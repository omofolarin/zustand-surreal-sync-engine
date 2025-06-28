import { Surreal, type Uuid, type LiveHandler, StringRecordId } from 'surrealdb';
import { surrealdbWasmEngines } from '@surrealdb/wasm';
import type { SyncConfig, TableConfig } from '../types';

export class SurrealDBAdapter {
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
      await this.db.connect(`indxdb://${this.config.dbName || 'todo-app-db'}`);
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
    let query = `
      DEFINE TABLE IF NOT EXISTS ${tableName} SCHEMAFULL;
      DEFINE FIELD IF NOT EXISTS lastModified ON TABLE ${tableName} TYPE datetime DEFAULT time::now();
      DEFINE FIELD IF NOT EXISTS version ON TABLE ${tableName} TYPE number DEFAULT 1;
      DEFINE FIELD IF NOT EXISTS source ON TABLE ${tableName} TYPE string DEFAULT 'surrealdb';
    `;

    for (const [key, value] of Object.entries(config.schema)) {
      query += `DEFINE FIELD IF NOT EXISTS ${key} ON TABLE ${tableName} TYPE ${value};`;
    }


    try {
      await this.db.query(query);
      console.log(`Table ${tableName} initialized/checked.`);
    } catch (error) {
      console.error(`Error initializing table ${tableName}:`, error);
    }
  }

  async create(table: string, data: any): Promise<any> {
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

  async update(id: StringRecordId, data: any): Promise<any> {
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

  async select(table: string, id?: StringRecordId): Promise<any> {
    if (id) {
      return await this.db.select(id);
    }
    return await this.db.select(table);
  }

  async startLiveQuery(table: string, callback: (notification: { action: string, result: any }) => void): Promise<void> {
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

      callback({ action, result });
    };

    const queryId = await this.db.live(table, liveHandler);
    this.liveQueries.set(table, queryId);
    console.log(`Live query started for table ${table} with ID ${queryId.toString()}`);
  }

  isConnected(): boolean {
    return this.connected;
  }
}