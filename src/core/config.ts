import type { SyncConfig, TableConfig, TableSchema } from '../types';
import type { ConfigValidationResult } from './types';

/**
 * Configuration validation and normalization utilities
 */
export class ConfigValidator {
  /**
   * Validates a complete sync configuration
   */
  static validate(config: SyncConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!config.dbName) {
      errors.push('dbName is required');
    }
    if (!config.namespace) {
      errors.push('namespace is required');
    }
    if (!config.database) {
      errors.push('database is required');
    }
    if (!config.tables || Object.keys(config.tables).length === 0) {
      errors.push('At least one table configuration is required');
    }

    // Validate table configurations
    if (config.tables) {
      for (const [tableName, tableConfig] of Object.entries(config.tables)) {
        const tableValidation = this.validateTableConfig(tableName, tableConfig);
        errors.push(...tableValidation.errors);
        warnings.push(...tableValidation.warnings);
      }
    }

    // Validate optional numeric fields
    if (config.syncInterval !== undefined) {
      if (config.syncInterval < 100) {
        warnings.push('syncInterval below 100ms may cause performance issues');
      } else if (config.syncInterval > 60000) {
        warnings.push('syncInterval above 60s may cause poor user experience');
      }
    }

    if (config.retryAttempts !== undefined) {
      if (config.retryAttempts < 0) {
        errors.push('retryAttempts cannot be negative');
      } else if (config.retryAttempts > 10) {
        warnings.push('retryAttempts above 10 may cause excessive retry delays');
      }
    }

    // Validate conflict resolution strategy
    if (config.conflictResolution && !['last-write-wins', 'manual'].includes(config.conflictResolution)) {
      errors.push('conflictResolution must be either "last-write-wins" or "manual"');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validates a single table configuration
   */
  static validateTableConfig(tableName: string, config: TableConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.zustandPath) {
      errors.push(`Table '${tableName}' must have a zustandPath`);
    }
    if (!config.primaryKey) {
      errors.push(`Table '${tableName}' must have a primaryKey`);
    }
    if (!config.schema) {
      errors.push(`Table '${tableName}' must have a schema`);
    }

    // Validate zustand path format
    if (config.zustandPath && !this.isValidZustandPath(config.zustandPath)) {
      warnings.push(`Table '${tableName}' zustandPath '${config.zustandPath}' should use dot notation (e.g., 'todos' or 'data.items')`);
    }

    // Validate schema structure
    if (config.schema) {
      const schemaValidation = this.validateSchema(tableName, config.schema);
      errors.push(...schemaValidation.errors);
      warnings.push(...schemaValidation.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validates a table schema
   */
  static validateSchema(tableName: string, schema: TableSchema | Record<string, any>): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Handle legacy schema format
    if (!('fields' in schema)) {
      warnings.push(`Table '${tableName}' is using legacy schema format. Consider upgrading to enhanced schema.`);
      return { valid: true, errors, warnings };
    }

    const enhancedSchema = schema as TableSchema;

    // Validate fields
    if (!enhancedSchema.fields || Object.keys(enhancedSchema.fields).length === 0) {
      errors.push(`Table '${tableName}' schema must have at least one field`);
    }

    if (enhancedSchema.fields) {
      for (const [fieldName, fieldDef] of Object.entries(enhancedSchema.fields)) {
        if (!fieldDef.type) {
          errors.push(`Field '${tableName}.${fieldName}' must have a type`);
        }

        // Validate SurrealDB types
        if (fieldDef.type && !this.isValidSurrealDBType(fieldDef.type)) {
          warnings.push(`Field '${tableName}.${fieldName}' type '${fieldDef.type}' may not be a valid SurrealDB type`);
        }

        // Validate constraints
        if (fieldDef.constraints) {
          const constraintValidation = this.validateFieldConstraints(tableName, fieldName, fieldDef.constraints);
          errors.push(...constraintValidation.errors);
          warnings.push(...constraintValidation.warnings);
        }
      }
    }

    // Validate indexes
    if (enhancedSchema.indexes) {
      for (const index of enhancedSchema.indexes) {
        if (!index.name) {
          errors.push(`Table '${tableName}' has an index without a name`);
        }
        if (!index.fields || index.fields.length === 0) {
          errors.push(`Index '${index.name}' in table '${tableName}' must specify at least one field`);
        }

        // Check if indexed fields exist
        if (index.fields && enhancedSchema.fields) {
          for (const field of index.fields) {
            if (!enhancedSchema.fields[field]) {
              errors.push(`Index '${index.name}' in table '${tableName}' references non-existent field '${field}'`);
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validates field constraints
   */
  static validateFieldConstraints(tableName: string, fieldName: string, constraints: any): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate assertion syntax
    if (constraints.assert && typeof constraints.assert === 'string') {
      if (!constraints.assert.includes('$value')) {
        warnings.push(`Field '${tableName}.${fieldName}' assertion should reference $value`);
      }
    }

    // Validate permissions
    if (constraints.permissions) {
      const validPermissions = ['select', 'create', 'update', 'delete'];
      for (const [permType, permExpr] of Object.entries(constraints.permissions)) {
        if (!validPermissions.includes(permType)) {
          errors.push(`Field '${tableName}.${fieldName}' has invalid permission type '${permType}'`);
        }
        if (typeof permExpr !== 'string') {
          errors.push(`Field '${tableName}.${fieldName}' permission '${permType}' must be a string expression`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Normalizes configuration with defaults
   */
  static normalize(config: SyncConfig): SyncConfig {
    return {
      ...config,
      syncInterval: config.syncInterval ?? 2000,
      retryAttempts: config.retryAttempts ?? 3,
      conflictResolution: config.conflictResolution ?? 'last-write-wins',
      tables: Object.fromEntries(
        Object.entries(config.tables).map(([name, tableConfig]) => [
          name,
          {
            ...tableConfig,
            syncEnabled: tableConfig.syncEnabled ?? true
          }
        ])
      )
    };
  }

  /**
   * Validates zustand path format
   */
  private static isValidZustandPath(path: string): boolean {
    // Simple validation for dot notation paths
    return /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(path);
  }

  /**
   * Validates SurrealDB type names
   */
  private static isValidSurrealDBType(type: string): boolean {
    const validTypes = [
      'string', 'number', 'bool', 'datetime', 'duration', 'uuid', 'object', 'array',
      'record', 'geometry', 'bytes', 'decimal', 'int', 'float', 'any'
    ];
    
    // Handle array types like array<string>
    if (type.startsWith('array<') && type.endsWith('>')) {
      const innerType = type.slice(6, -1);
      return this.isValidSurrealDBType(innerType);
    }
    
    // Handle record types like record<table>
    if (type.startsWith('record<') && type.endsWith('>')) {
      return true; // Table names can vary
    }
    
    return validTypes.includes(type);
  }
}

/**
 * Configuration builder for fluent API
 * 
 * Provides a convenient way to build sync configurations with method chaining
 * and automatic validation.
 * 
 * @example
 * ```typescript
 * const config = ConfigBuilder.create()
 *   .database('myapp', 'production', 'main')
 *   .syncInterval(1000)
 *   .retryAttempts(5)
 *   .table('todos', {
 *     zustandPath: 'todos',
 *     primaryKey: 'id',
 *     schema: { fields: { id: { type: 'string' } } }
 *   })
 *   .build();
 * ```
 */
export class ConfigBuilder {
  private config: Partial<SyncConfig> = {};

  static create(): ConfigBuilder {
    return new ConfigBuilder();
  }

  /**
   * Set database connection details
   */
  database(dbName: string, namespace: string, database: string): ConfigBuilder {
    this.config.dbName = dbName;
    this.config.namespace = namespace;
    this.config.database = database;
    return this;
  }

  /**
   * Set sync interval in milliseconds
   */
  syncInterval(interval: number): ConfigBuilder {
    if (interval < 100) {
      console.warn('Sync interval below 100ms may cause performance issues');
    }
    this.config.syncInterval = interval;
    return this;
  }

  /**
   * Set number of retry attempts for failed operations
   */
  retryAttempts(attempts: number): ConfigBuilder {
    if (attempts < 0) {
      throw new Error('Retry attempts cannot be negative');
    }
    this.config.retryAttempts = attempts;
    return this;
  }

  /**
   * Set conflict resolution strategy
   */
  conflictResolution(strategy: 'last-write-wins' | 'manual'): ConfigBuilder {
    this.config.conflictResolution = strategy;
    return this;
  }

  /**
   * Add a table configuration
   */
  table(name: string, config: TableConfig): ConfigBuilder {
    if (!this.config.tables) {
      this.config.tables = {};
    }
    this.config.tables[name] = config;
    return this;
  }

  /**
   * Add multiple table configurations
   */
  tables(tables: Record<string, TableConfig>): ConfigBuilder {
    if (!this.config.tables) {
      this.config.tables = {};
    }
    Object.assign(this.config.tables, tables);
    return this;
  }

  /**
   * Add a simple table configuration with basic schema
   */
  simpleTable(
    name: string, 
    zustandPath: string, 
    primaryKey: string = 'id',
    fields: Record<string, string> = {}
  ): ConfigBuilder {
    const tableConfig: TableConfig = {
      zustandPath,
      primaryKey,
      syncEnabled: true,
      schema: {
        fields: {
          [primaryKey]: { type: 'string' },
          ...Object.fromEntries(
            Object.entries(fields).map(([fieldName, type]) => [
              fieldName,
              { type, constraints: { nullable: true } }
            ])
          )
        }
      }
    };

    return this.table(name, tableConfig);
  }

  /**
   * Enable or disable sync for all tables
   */
  enableSync(enabled: boolean = true): ConfigBuilder {
    if (this.config.tables) {
      Object.values(this.config.tables).forEach(table => {
        table.syncEnabled = enabled;
      });
    }
    return this;
  }

  /**
   * Set default values for common configuration options
   */
  defaults(): ConfigBuilder {
    this.config.syncInterval = this.config.syncInterval ?? 2000;
    this.config.retryAttempts = this.config.retryAttempts ?? 3;
    this.config.conflictResolution = this.config.conflictResolution ?? 'last-write-wins';
    return this;
  }

  /**
   * Merge with another configuration
   */
  merge(other: Partial<SyncConfig>): ConfigBuilder {
    this.config = {
      ...this.config,
      ...other,
      tables: {
        ...this.config.tables,
        ...other.tables
      }
    };
    return this;
  }

  /**
   * Validate the current configuration without building
   */
  validate(): ConfigValidationResult {
    return ConfigValidator.validate(this.config as SyncConfig);
  }

  /**
   * Build and return the final configuration
   */
  build(): SyncConfig {
    const validation = ConfigValidator.validate(this.config as SyncConfig);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }
    
    if (validation.warnings.length > 0) {
      console.warn('Configuration warnings:', validation.warnings);
    }
    
    return ConfigValidator.normalize(this.config as SyncConfig);
  }

  /**
   * Get the current configuration (without validation)
   */
  peek(): Partial<SyncConfig> {
    return { ...this.config };
  }

  /**
   * Reset the builder to start fresh
   */
  reset(): ConfigBuilder {
    this.config = {};
    return this;
  }

  /**
   * Clone the current builder
   */
  clone(): ConfigBuilder {
    const newBuilder = new ConfigBuilder();
    newBuilder.config = JSON.parse(JSON.stringify(this.config));
    return newBuilder;
  }
}