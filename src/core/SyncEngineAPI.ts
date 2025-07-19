import { ZustandSurrealSyncEngine } from './SyncEngine';
import { EnhancedSyncEngine } from './EnhancedSyncEngine';
import { SurrealDBAdapter } from '../adapters/SurrealDBAdapter';
import { ConfigValidator, ConfigBuilder } from './config';
import type { SyncConfig, TableConfig } from '../types';
import type { 
  DatabaseAdapter, 
  SyncStatus, 
  SyncEngineConfig,
  SyncEngineEvent,
  SyncEngineEventHandler,
  SyncEngineMetrics
} from './types';

/**
 * Main API class for the sync engine library
 * Provides a clean, simple interface for library consumers
 */
export class SyncEngineAPI {
  private engine: ZustandSurrealSyncEngine | null = null;
  private adapter: DatabaseAdapter | null = null;

  /**
   * Creates a new sync engine instance with the provided configuration
   */
  static async create(config: SyncConfig, engineConfig?: SyncEngineConfig): Promise<SyncEngineAPI> {
    const api = new SyncEngineAPI();
    await api.initialize(config, engineConfig);
    return api;
  }

  /**
   * Creates an enhanced sync engine with collaboration features
   */
  static async createEnhanced(config: SyncConfig, userId: string, engineConfig?: SyncEngineConfig): Promise<SyncEngineAPI> {
    const api = new SyncEngineAPI();
    await api.initializeEnhanced(config, userId, engineConfig);
    return api;
  }

  /**
   * Creates a configuration builder for fluent API
   */
  static configBuilder(): ConfigBuilder {
    return ConfigBuilder.create();
  }

  /**
   * Validates a configuration without creating an engine
   */
  static validateConfig(config: SyncConfig): { valid: boolean; errors: string[]; warnings: string[] } {
    return ConfigValidator.validate(config);
  }

  private async initialize(config: SyncConfig, engineConfig?: SyncEngineConfig): Promise<void> {
    // Validate configuration
    const validation = ConfigValidator.validate(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    // Create adapter and engine
    this.adapter = new SurrealDBAdapter(config);
    this.engine = new ZustandSurrealSyncEngine(config);

    // Apply engine configuration if provided
    if (engineConfig) {
      this.engine.updateConfig({ ...config, ...engineConfig });
    }

    // Initialize the engine with the adapter
    await this.engine.initialize(this.adapter);
  }

  private async initializeEnhanced(config: SyncConfig, userId: string, engineConfig?: SyncEngineConfig): Promise<void> {
    // Validate configuration
    const validation = ConfigValidator.validate(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    // Create adapter and enhanced engine
    this.adapter = new SurrealDBAdapter(config);
    this.engine = new EnhancedSyncEngine(config, userId);

    // Apply engine configuration if provided
    if (engineConfig) {
      this.engine.updateConfig({ ...config, ...engineConfig });
    }

    // Initialize the engine with the adapter
    await this.engine.initialize(this.adapter);
  }

  /**
   * Creates Zustand middleware for a specific table
   */
  createMiddleware<T extends Record<string, any>>(tableName: string) {
    if (!this.engine) {
      throw new Error('Sync engine not initialized. Call SyncEngineAPI.create() first.');
    }
    return this.engine.createSyncMiddleware<T>(tableName);
  }

  /**
   * Loads initial data for a table
   */
  async loadInitialData(tableName: string): Promise<void> {
    if (!this.engine) {
      throw new Error('Sync engine not initialized');
    }
    await this.engine.loadInitialData(tableName);
  }

  /**
   * Gets current sync status
   */
  getSyncStatus(): SyncStatus {
    if (!this.engine) {
      throw new Error('Sync engine not initialized');
    }
    return this.engine.getSyncStatus();
  }

  /**
   * Updates the engine configuration
   */
  updateConfig(config: Partial<SyncConfig>): void {
    if (!this.engine) {
      throw new Error('Sync engine not initialized');
    }
    this.engine.updateConfig(config);
  }

  /**
   * Shuts down the sync engine and closes connections
   */
  async shutdown(): Promise<void> {
    if (this.engine) {
      await this.engine.shutdown();
      this.engine = null;
    }
    this.adapter = null;
  }

  /**
   * Gets the underlying sync engine instance (for advanced usage)
   */
  getEngine(): ZustandSurrealSyncEngine | null {
    return this.engine;
  }

  /**
   * Gets the database adapter instance (for advanced usage)
   */
  getAdapter(): DatabaseAdapter | null {
    return this.adapter;
  }

  /**
   * Checks if the engine is initialized and connected
   */
  isReady(): boolean {
    return this.engine !== null && this.adapter !== null && this.adapter.isConnected();
  }

  /**
   * Add an event listener for sync engine events
   */
  on(event: SyncEngineEvent, handler: SyncEngineEventHandler): void {
    if (!this.engine) {
      throw new Error('Sync engine not initialized');
    }
    this.engine.on(event, handler);
  }

  /**
   * Remove an event listener
   */
  off(event: SyncEngineEvent, handler: SyncEngineEventHandler): void {
    if (!this.engine) {
      throw new Error('Sync engine not initialized');
    }
    this.engine.off(event, handler);
  }

  /**
   * Get current sync engine metrics
   */
  getMetrics(): SyncEngineMetrics {
    if (!this.engine) {
      throw new Error('Sync engine not initialized');
    }
    return this.engine.getMetrics();
  }

  /**
   * Reset sync engine metrics
   */
  resetMetrics(): void {
    if (!this.engine) {
      throw new Error('Sync engine not initialized');
    }
    this.engine.resetMetrics();
  }

  /**
   * Perform a health check on the database connection
   */
  async healthCheck(): Promise<boolean> {
    if (!this.adapter) {
      return false;
    }
    return this.adapter.healthCheck();
  }
}

/**
 * Factory functions for common use cases
 */
export class SyncEngineFactory {
  /**
   * Creates a basic sync engine for simple use cases
   */
  static async createBasic(options: {
    dbName: string;
    namespace: string;
    database: string;
    tables: Record<string, { zustandPath: string; primaryKey: string; schema: any }>;
    syncInterval?: number;
    retryAttempts?: number;
  }): Promise<SyncEngineAPI> {
    const builder = ConfigBuilder.create()
      .database(options.dbName, options.namespace, options.database)
      .syncInterval(options.syncInterval ?? 2000)
      .retryAttempts(options.retryAttempts ?? 3);

    // Add tables to builder
    for (const [tableName, tableConfig] of Object.entries(options.tables)) {
      builder.table(tableName, {
        zustandPath: tableConfig.zustandPath,
        primaryKey: tableConfig.primaryKey,
        schema: tableConfig.schema,
        syncEnabled: true
      });
    }

    const config = builder.build();
    return SyncEngineAPI.create(config);
  }

  /**
   * Creates a collaborative sync engine with real-time features
   */
  static async createCollaborative(options: {
    dbName: string;
    namespace: string;
    database: string;
    userId: string;
    tables: Record<string, { zustandPath: string; primaryKey: string; schema: any }>;
    syncInterval?: number;
  }): Promise<SyncEngineAPI> {
    const builder = ConfigBuilder.create()
      .database(options.dbName, options.namespace, options.database)
      .syncInterval(options.syncInterval ?? 500) // Faster sync for collaboration
      .retryAttempts(3);

    // Add tables to builder
    for (const [tableName, tableConfig] of Object.entries(options.tables)) {
      builder.table(tableName, {
        zustandPath: tableConfig.zustandPath,
        primaryKey: tableConfig.primaryKey,
        schema: tableConfig.schema,
        syncEnabled: true
      });
    }

    const config = builder.build();

    const engineConfig: SyncEngineConfig = {
      syncInterval: options.syncInterval ?? 500,
      batchSize: 10, // Smaller batches for real-time feel
      enableLogging: true,
      operationTimeout: 3000
    };

    return SyncEngineAPI.createEnhanced(config, options.userId, engineConfig);
  }

  /**
   * Creates an offline-first sync engine
   */
  static async createOfflineFirst(options: {
    dbName: string;
    namespace: string;
    database: string;
    tables: Record<string, { zustandPath: string; primaryKey: string; schema: any }>;
  }): Promise<SyncEngineAPI> {
    const builder = ConfigBuilder.create()
      .database(options.dbName, options.namespace, options.database)
      .syncInterval(5000) // Longer intervals for offline scenarios
      .retryAttempts(10); // More retries for unreliable connections

    // Add tables to builder
    for (const [tableName, tableConfig] of Object.entries(options.tables)) {
      builder.table(tableName, {
        zustandPath: tableConfig.zustandPath,
        primaryKey: tableConfig.primaryKey,
        schema: tableConfig.schema,
        syncEnabled: true
      });
    }

    const config = builder.build();

    const engineConfig: SyncEngineConfig = {
      syncInterval: 5000,
      retryAttempts: 10,
      batchSize: 100, // Larger batches for efficiency
      offlineSupport: true,
      operationTimeout: 10000
    };

    return SyncEngineAPI.create(config, engineConfig);
  }

  /**
   * Creates a high-performance sync engine for large datasets
   */
  static async createHighPerformance(options: {
    dbName: string;
    namespace: string;
    database: string;
    tables: Record<string, { zustandPath: string; primaryKey: string; schema: any }>;
  }): Promise<SyncEngineAPI> {
    const builder = ConfigBuilder.create()
      .database(options.dbName, options.namespace, options.database)
      .syncInterval(1000)
      .retryAttempts(5);

    // Add tables to builder
    for (const [tableName, tableConfig] of Object.entries(options.tables)) {
      builder.table(tableName, {
        zustandPath: tableConfig.zustandPath,
        primaryKey: tableConfig.primaryKey,
        schema: tableConfig.schema,
        syncEnabled: true
      });
    }

    const config = builder.build();

    const engineConfig: SyncEngineConfig = {
      syncInterval: 1000,
      retryAttempts: 5,
      batchSize: 200, // Large batches for performance
      enableLogging: false, // Disable logging for performance
      operationTimeout: 5000
    };

    return SyncEngineAPI.create(config, engineConfig);
  }
}

/**
 * Utility functions for common operations
 */
export class SyncEngineUtils {
  /**
   * Creates a simple table configuration
   */
  static createTableConfig(options: {
    zustandPath: string;
    primaryKey: string;
    fields: Record<string, { type: string; [key: string]: any }>;
    syncEnabled?: boolean;
    indexes?: Array<{ name: string; fields: string[]; unique?: boolean }>;
  }): TableConfig {
    return {
      zustandPath: options.zustandPath,
      primaryKey: options.primaryKey,
      syncEnabled: options.syncEnabled ?? true,
      schema: {
        fields: Object.fromEntries(
          Object.entries(options.fields || {}).map(([name, field]) => [
            name,
            { 
              type: field.type, 
              constraints: Object.fromEntries(
                Object.entries(field).filter(([key]) => key !== 'type')
              )
            }
          ])
        ),
        indexes: options.indexes?.map(index => ({
          name: index.name,
          fields: index.fields,
          unique: index.unique ?? false,
          type: 'btree' as const
        }))
      }
    };
  }

  /**
   * Creates an enhanced table configuration with constraints
   */
  static createEnhancedTableConfig(
    zustandPath: string,
    primaryKey: string,
    schema: any
  ): TableConfig {
    return {
      zustandPath,
      primaryKey,
      syncEnabled: true,
      schema
    };
  }

  /**
   * Create a minimal configuration for testing
   */
  static createTestConfig(tableName: string, zustandPath: string): SyncConfig {
    return {
      dbName: 'test-db',
      namespace: 'test',
      database: 'test',
      tables: {
        [tableName]: {
          zustandPath,
          primaryKey: 'id',
          schema: {
            fields: {
              id: { type: 'string' },
              createdAt: { type: 'datetime' },
              updatedAt: { type: 'datetime' }
            }
          },
          syncEnabled: true
        }
      }
    };
  }

  /**
   * Extract table names from a configuration
   */
  static getTableNames(config: SyncConfig): string[] {
    return Object.keys(config.tables);
  }

  /**
   * Check if a configuration has any enabled tables
   */
  static hasEnabledTables(config: SyncConfig): boolean {
    return Object.values(config.tables).some(table => table.syncEnabled !== false);
  }

  /**
   * Get enabled table configurations
   */
  static getEnabledTables(config: SyncConfig): Record<string, TableConfig> {
    return Object.fromEntries(
      Object.entries(config.tables).filter(([, table]) => table.syncEnabled !== false)
    );
  }

  /**
   * Merge multiple sync configurations
   */
  static mergeConfigs(...configs: Partial<SyncConfig>[]): SyncConfig {
    const merged = configs.reduce((acc, config) => ({
      ...acc,
      ...config,
      tables: { ...acc.tables, ...config.tables }
    }), {} as SyncConfig);

    const validation = ConfigValidator.validate(merged);
    if (!validation.valid) {
      throw new Error(`Invalid merged configuration: ${validation.errors.join(', ')}`);
    }

    return merged;
  }
}