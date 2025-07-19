import { Surreal, type Uuid, type LiveHandler, StringRecordId } from 'surrealdb';
import { surrealdbWasmEngines } from '@surrealdb/wasm';
import type { SyncConfig, TableConfig, TableSchema, FieldDefinition, IndexDefinition } from '../types';
import { upgradeTableConfig, validateSchema } from '../schema/utils';
import type { DatabaseAdapter, LiveQueryCallback } from '../core/types';

export class SurrealDBAdapter implements DatabaseAdapter {
  private db: Surreal;
  private connected = false;
  private liveQueries = new Map<string, Uuid>();

  constructor(private config: SyncConfig) {
    // Enable the WebAssembly engines now imported from npm
    this.db = new Surreal({
      engines: surrealdbWasmEngines(),
    });
  }

  async connect(): Promise<void> {
    try {
      await this.db.connect(`indxdb://${this.config.dbName || 'sync-engine-db'}`);
      await this.db.use({
        namespace: this.config.namespace,
        database: this.config.database,
      });

      for (const [tableName, tableConfig] of Object.entries(this.config.tables)) {
        await this.initializeTable(tableName, tableConfig);
      }

      this.connected = true;
      console.log('SurrealDB (IndexedDB) connected successfully');
    } catch (error) {
      console.error('Failed to connect to SurrealDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      for (const queryId of this.liveQueries.values()) {
        try {
          await this.db.kill(queryId);
        } catch (e) {
          console.warn(`Failed to kill live query ${queryId.toString()}:`, e);
        }
      }
      this.liveQueries.clear();

      await this.db.close();
      this.connected = false;
      console.log('SurrealDB disconnected successfully');
    }
  }

  private async initializeTable(tableName: string, config: TableConfig): Promise<void> {
    const info = await this.db.query(`INFO FOR TABLE ${tableName}`);
    console.log({ info, schema: config.schema });
    
    // Upgrade legacy schema if needed
    const upgradedConfig = upgradeTableConfig(config);
    const schema = upgradedConfig.schema as TableSchema;
    
    // Validate the schema
    const validation = validateSchema(schema);
    if (!validation.valid) {
      console.warn(`Schema validation warnings for table ${tableName}:`, validation.errors);
      // Continue with initialization but log warnings
    }
    
    let query = `DEFINE TABLE IF NOT EXISTS ${tableName} SCHEMAFULL;`;
    
    // Add system fields
    query += `
      DEFINE FIELD IF NOT EXISTS lastModified ON TABLE ${tableName} TYPE datetime DEFAULT time::now();
      DEFINE FIELD IF NOT EXISTS version ON TABLE ${tableName} TYPE number DEFAULT 1;
      DEFINE FIELD IF NOT EXISTS source ON TABLE ${tableName} TYPE string DEFAULT 'surrealdb';
    `;

    // Build enhanced schema query
    query += this.buildEnhancedSchemaQuery(tableName, schema);

    try {
      await this.db.query(query);
      console.log(`Table ${tableName} initialized/checked with enhanced schema.`);
    } catch (error) {
      console.error(`Error initializing table ${tableName}:`, error);
      throw error;
    }
  }

  private buildEnhancedSchemaQuery(tableName: string, schema: TableSchema): string {
    let query = '';

    // Define fields with constraints
    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      query += this.buildFieldDefinition(tableName, fieldName, fieldDef);
    }

    // Define indexes
    if (schema.indexes) {
      for (const index of schema.indexes) {
        query += this.buildIndexDefinition(tableName, index);
      }
    }

    // Define table permissions
    if (schema.permissions) {
      query += this.buildPermissionsDefinition(tableName, schema.permissions);
    }

    // Define events
    if (schema.events) {
      for (const [eventType, eventFunction] of Object.entries(schema.events)) {
        query += `DEFINE EVENT IF NOT EXISTS ${eventType} ON TABLE ${tableName} WHEN $event = "${eventType}" THEN ${eventFunction};`;
      }
    }

    return query;
  }

  private buildFieldDefinition(tableName: string, fieldName: string, fieldDef: FieldDefinition): string {
    let fieldQuery = `DEFINE FIELD IF NOT EXISTS ${fieldName} ON TABLE ${tableName} TYPE ${fieldDef.type}`;

    if (fieldDef.constraints) {
      const constraints = fieldDef.constraints;

      // Handle default value
      if (constraints.default !== undefined) {
        if (typeof constraints.default === 'string') {
          fieldQuery += ` DEFAULT "${constraints.default}"`;
        } else if (typeof constraints.default === 'number' || typeof constraints.default === 'boolean') {
          fieldQuery += ` DEFAULT ${constraints.default}`;
        } else {
          fieldQuery += ` DEFAULT ${JSON.stringify(constraints.default)}`;
        }
      }

      // Handle value expression
      if (constraints.value) {
        fieldQuery += ` VALUE ${constraints.value}`;
      }

      // Handle assertions
      if (constraints.assert) {
        fieldQuery += ` ASSERT ${constraints.assert}`;
      }

      // Handle field permissions
      if (constraints.permissions) {
        const perms = constraints.permissions;
        if (perms.select) fieldQuery += ` PERMISSIONS FOR select WHERE ${perms.select}`;
        if (perms.create) fieldQuery += ` PERMISSIONS FOR create WHERE ${perms.create}`;
        if (perms.update) fieldQuery += ` PERMISSIONS FOR update WHERE ${perms.update}`;
        if (perms.delete) fieldQuery += ` PERMISSIONS FOR delete WHERE ${perms.delete}`;
      }
    }

    fieldQuery += ';';
    return fieldQuery;
  }

  private buildIndexDefinition(tableName: string, index: IndexDefinition): string {
    let indexQuery = `DEFINE INDEX IF NOT EXISTS ${index.name} ON TABLE ${tableName} COLUMNS ${index.fields.join(', ')}`;
    
    if (index.unique) {
      indexQuery += ' UNIQUE';
    }
    
    if (index.type && index.type !== 'btree') {
      indexQuery += ` ${index.type.toUpperCase()}`;
    }
    
    indexQuery += ';';
    return indexQuery;
  }

  private buildPermissionsDefinition(tableName: string, permissions: NonNullable<TableSchema['permissions']>): string {
    let permQuery = '';
    
    if (permissions.select) {
      permQuery += `DEFINE PERMISSIONS FOR select ON TABLE ${tableName} WHERE ${permissions.select};`;
    }
    if (permissions.create) {
      permQuery += `DEFINE PERMISSIONS FOR create ON TABLE ${tableName} WHERE ${permissions.create};`;
    }
    if (permissions.update) {
      permQuery += `DEFINE PERMISSIONS FOR update ON TABLE ${tableName} WHERE ${permissions.update};`;
    }
    if (permissions.delete) {
      permQuery += `DEFINE PERMISSIONS FOR delete ON TABLE ${tableName} WHERE ${permissions.delete};`;
    }
    
    return permQuery;
  }

  async create<T = any>(table: string, data: Partial<T>): Promise<T> {
    const record = {
      ...data,
      lastModified: new Date(),
      version: 1,
      source: 'zustand'
    };

    const result = await this.db.create(table, record);
    console.log('created', result[0], data);
    return Array.isArray(result) ? result[0] : result;
  }

  async update<T = any>(id: StringRecordId, data: Partial<T>): Promise<T> {
    console.log(`Updating record ${id}`);
    const existingResult = await this.db.select(id);
    const existing: any = Array.isArray(existingResult) ? existingResult[0] : existingResult;

    const record = {
      ...data,
      lastModified: new Date(),
      version: (Number(existing?.version) || 0) + 1,
      source: 'zustand'
    };

    const result = await this.db.merge(id, record);
    return Array.isArray(result) ? result[0] : result;
  }

  async delete(id: StringRecordId): Promise<void> {
    await this.db.delete(id);
    console.log(`Deleted record ${id}`);
  }

  async select<T = any>(table: string, id?: StringRecordId): Promise<T | T[]> {
    if (id) {
      const result = await this.db.select(id);
      return Array.isArray(result) ? result[0] : result;
    }
    return await this.db.select(table);
  }

  async startLiveQuery(table: string, callback: LiveQueryCallback): Promise<void> {
    if (this.liveQueries.has(table)) {
      try {
        await this.db.kill(this.liveQueries.get(table)!);
      } catch (e) {
        console.warn(`Failed to kill existing live query for ${table}:`, e);
      }
    }

    const liveHandler: LiveHandler<Record<string, unknown>> = (action: string, result?: any) => {
      if (action === "CLOSE") {
        console.log(`Live query for table ${table} closed with reason: ${result}`);
        this.liveQueries.delete(table);
        return;
      }

      callback({ 
        action: action.toUpperCase() as 'CREATE' | 'UPDATE' | 'DELETE',
        result,
        metadata: {
          timestamp: Date.now(),
          source: 'surrealdb'
        }
      });
    };

    const queryId = await this.db.live(table, liveHandler);
    this.liveQueries.set(table, queryId);
    console.log(`Live query started for table ${table} with ID ${queryId.toString()}`);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async stopLiveQuery(table: string): Promise<void> {
    const queryId = this.liveQueries.get(table);
    if (queryId) {
      try {
        await this.db.kill(queryId);
        this.liveQueries.delete(table);
        console.log(`Live query stopped for table ${table}`);
      } catch (error) {
        console.warn(`Failed to stop live query for ${table}:`, error);
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.connected) {
        return false;
      }
      
      // Perform a simple query to check database health
      await this.db.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}