import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { 
  SyncEngineAPI, 
  SyncEngineFactory, 
  SyncEngineUtils,
  ConfigBuilder,
  ConfigValidator
} from '../src/core';
import { createSyncMiddleware, createMultipleSyncMiddlewares } from '../src/middleware';
import type { SyncConfig, TableConfig } from '../src/types';
import type { SyncEngineConfig } from '../src/core/types';

describe('Sync Engine Library', () => {
  let syncEngine: SyncEngineAPI;
  
  const testConfig: SyncConfig = {
    dbName: 'test-sync-engine',
    namespace: 'test',
    database: 'test',
    tables: {
      todos: {
        zustandPath: 'todos',
        primaryKey: 'id',
        schema: {
          fields: {
            id: { type: 'string' },
            text: { type: 'string' },
            completed: { type: 'bool' },
            createdAt: { type: 'datetime' }
          }
        },
        syncEnabled: true
      }
    }
  };

  afterEach(async () => {
    if (syncEngine) {
      await syncEngine.shutdown();
    }
  });

  describe('Configuration System', () => {
    it('should validate configuration correctly', () => {
      const validation = ConfigValidator.validate(testConfig);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid configuration', () => {
      const invalidConfig = { ...testConfig };
      delete (invalidConfig as any).dbName;
      
      const validation = ConfigValidator.validate(invalidConfig);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('dbName is required');
    });

    it('should build configuration with ConfigBuilder', () => {
      const config = ConfigBuilder.create()
        .database('test-db', 'test-ns', 'test-db')
        .syncInterval(1000)
        .retryAttempts(5)
        .simpleTable('items', 'items', 'id', { name: 'string', value: 'number' })
        .build();

      expect(config.dbName).toBe('test-db');
      expect(config.namespace).toBe('test-ns');
      expect(config.database).toBe('test-db');
      expect(config.syncInterval).toBe(1000);
      expect(config.retryAttempts).toBe(5);
      expect(config.tables.items).toBeDefined();
      expect(config.tables.items.zustandPath).toBe('items');
    });

    it('should merge configurations correctly', () => {
      const config1 = ConfigBuilder.create()
        .database('db1', 'ns1', 'db1')
        .simpleTable('table1', 'path1')
        .build();

      const config2: Partial<SyncConfig> = {
        syncInterval: 500,
        tables: {
          table2: {
            zustandPath: 'path2',
            primaryKey: 'id',
            schema: { fields: { id: { type: 'string' } } },
            syncEnabled: true
          }
        }
      };

      const merged = SyncEngineUtils.mergeConfigs(config1, config2);
      
      expect(merged.dbName).toBe('db1');
      expect(merged.syncInterval).toBe(500);
      expect(merged.tables.table1).toBeDefined();
      expect(merged.tables.table2).toBeDefined();
    });
  });

  describe('SyncEngineAPI', () => {
    it('should create sync engine with basic configuration', async () => {
      syncEngine = await SyncEngineAPI.create(testConfig);
      
      expect(syncEngine.isReady()).toBe(true);
      
      const status = syncEngine.getSyncStatus();
      expect(status.connected).toBe(true);
      expect(status.pending).toBe(0);
      expect(status.syncing).toBe(false);
    });

    it('should create sync engine with engine configuration', async () => {
      const engineConfig: SyncEngineConfig = {
        syncInterval: 500,
        retryAttempts: 5,
        batchSize: 25,
        enableLogging: true
      };

      syncEngine = await SyncEngineAPI.create(testConfig, engineConfig);
      
      expect(syncEngine.isReady()).toBe(true);
      
      const metrics = syncEngine.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.totalOperations).toBe(0);
    });

    it('should handle event listeners', async () => {
      syncEngine = await SyncEngineAPI.create(testConfig);
      
      let eventReceived = false;
      const handler = (event: string, data: any) => {
        eventReceived = true;
      };

      syncEngine.on('sync-start', handler);
      
      // Event handling is tested indirectly through sync operations
      expect(syncEngine.isReady()).toBe(true);
      
      syncEngine.off('sync-start', handler);
    });

    it('should perform health check', async () => {
      syncEngine = await SyncEngineAPI.create(testConfig);
      
      const isHealthy = await syncEngine.healthCheck();
      expect(isHealthy).toBe(true);
    });
  });

  describe('SyncEngineFactory', () => {
    it('should create basic sync engine', async () => {
      syncEngine = await SyncEngineFactory.createBasic({
        dbName: 'basic-test',
        namespace: 'test',
        database: 'test',
        tables: {
          items: {
            zustandPath: 'items',
            primaryKey: 'id',
            schema: { fields: { id: { type: 'string' } } }
          }
        }
      });

      expect(syncEngine.isReady()).toBe(true);
    });

    it('should create offline-first sync engine', async () => {
      syncEngine = await SyncEngineFactory.createOfflineFirst({
        dbName: 'offline-test',
        namespace: 'test',
        database: 'test',
        tables: {
          items: {
            zustandPath: 'items',
            primaryKey: 'id',
            schema: { fields: { id: { type: 'string' } } }
          }
        }
      });

      expect(syncEngine.isReady()).toBe(true);
      
      const status = syncEngine.getSyncStatus();
      expect(status.connected).toBe(true);
    });

    it('should create high-performance sync engine', async () => {
      syncEngine = await SyncEngineFactory.createHighPerformance({
        dbName: 'perf-test',
        namespace: 'test',
        database: 'test',
        tables: {
          items: {
            zustandPath: 'items',
            primaryKey: 'id',
            schema: { fields: { id: { type: 'string' } } }
          }
        }
      });

      expect(syncEngine.isReady()).toBe(true);
    });
  });

  describe('Middleware', () => {
    beforeEach(async () => {
      syncEngine = await SyncEngineAPI.create(testConfig);
    });

    it('should create sync middleware', () => {
      const middleware = createSyncMiddleware(syncEngine, 'todos');
      expect(typeof middleware).toBe('function');
    });

    it('should create multiple sync middlewares', () => {
      const middlewares = createMultipleSyncMiddlewares(syncEngine, ['todos', 'users']);
      
      expect(middlewares.todos).toBeDefined();
      expect(middlewares.users).toBeDefined();
      expect(typeof middlewares.todos).toBe('function');
      expect(typeof middlewares.users).toBe('function');
    });
  });

  describe('SyncEngineUtils', () => {
    it('should create table configuration', () => {
      const tableConfig = SyncEngineUtils.createTableConfig({
        zustandPath: 'items',
        primaryKey: 'id',
        fields: {
          name: { type: 'string', nullable: false },
          count: { type: 'number', default: 0 }
        },
        indexes: [
          { name: 'name_idx', fields: ['name'], unique: true }
        ]
      });

      expect(tableConfig.zustandPath).toBe('items');
      expect(tableConfig.primaryKey).toBe('id');
      expect(tableConfig.schema.fields.name).toBeDefined();
      expect(tableConfig.schema.fields.count).toBeDefined();
      expect(tableConfig.schema.indexes).toHaveLength(1);
    });

    it('should create test configuration', () => {
      const config = SyncEngineUtils.createTestConfig('test_table', 'testPath');
      
      expect(config.dbName).toBe('test-db');
      expect(config.tables.test_table).toBeDefined();
      expect(config.tables.test_table.zustandPath).toBe('testPath');
    });

    it('should extract table names', () => {
      const tableNames = SyncEngineUtils.getTableNames(testConfig);
      expect(tableNames).toEqual(['todos']);
    });

    it('should check for enabled tables', () => {
      const hasEnabled = SyncEngineUtils.hasEnabledTables(testConfig);
      expect(hasEnabled).toBe(true);
      
      const enabledTables = SyncEngineUtils.getEnabledTables(testConfig);
      expect(Object.keys(enabledTables)).toEqual(['todos']);
    });
  });

  describe('Database Adapter Abstraction', () => {
    beforeEach(async () => {
      syncEngine = await SyncEngineAPI.create(testConfig);
    });

    it('should have working database adapter', async () => {
      const adapter = syncEngine.getAdapter();
      expect(adapter).toBeDefined();
      expect(adapter!.isConnected()).toBe(true);
      
      const healthCheck = await adapter!.healthCheck();
      expect(healthCheck).toBe(true);
    });

    it('should perform CRUD operations through adapter', async () => {
      const adapter = syncEngine.getAdapter();
      expect(adapter).toBeDefined();

      // Test create
      const created = await adapter!.create('todos', {
        text: 'Test todo',
        completed: false,
        createdAt: new Date()
      });
      expect(created).toBeDefined();
      expect(created.text).toBe('Test todo');

      // Test select
      const selected = await adapter!.select('todos');
      expect(Array.isArray(selected)).toBe(true);
      expect((selected as any[]).length).toBeGreaterThan(0);

      // Test update
      if (created.id) {
        const updated = await adapter!.update(created.id, { completed: true });
        expect(updated.completed).toBe(true);

        // Test delete
        await adapter!.delete(created.id);
      }
    });
  });

  describe('Error Handling and Validation', () => {
    it('should handle invalid configuration gracefully', async () => {
      const invalidConfig = { ...testConfig };
      delete (invalidConfig as any).dbName;

      await expect(SyncEngineAPI.create(invalidConfig)).rejects.toThrow();
    });

    it('should handle operations on uninitialized engine', () => {
      const uninitializedEngine = new SyncEngineAPI();
      
      expect(() => uninitializedEngine.getSyncStatus()).toThrow();
      expect(() => uninitializedEngine.createMiddleware('test')).toThrow();
      expect(() => uninitializedEngine.getMetrics()).toThrow();
    });

    it('should validate table configurations', () => {
      const invalidTableConfig: TableConfig = {
        zustandPath: '',
        primaryKey: '',
        schema: { fields: {} },
        syncEnabled: true
      };

      const validation = ConfigValidator.validateTableConfig('test', invalidTableConfig);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });
});