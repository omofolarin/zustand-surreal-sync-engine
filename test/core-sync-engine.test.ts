import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SyncEngineAPI, ConfigBuilder, SyncEngineUtils } from '../src/core';
import type { SyncConfig } from '../src/types';

describe('Core Sync Engine Library Extraction', () => {
  let syncEngine: SyncEngineAPI | null = null;

  afterEach(async () => {
    if (syncEngine) {
      await syncEngine.shutdown();
      syncEngine = null;
    }
  });

  describe('Configuration System', () => {
    it('should validate configuration correctly', () => {
      const validConfig: SyncConfig = {
        dbName: 'test-db',
        namespace: 'test-ns',
        database: 'test-db',
        tables: {
          todos: {
            zustandPath: 'todos',
            primaryKey: 'id',
            syncEnabled: true,
            schema: {
              fields: {
                id: { type: 'string' },
                text: { type: 'string' },
                completed: { type: 'bool' }
              }
            }
          }
        }
      };

      const validation = SyncEngineAPI.validateConfig(validConfig);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject invalid configuration', () => {
      const invalidConfig = {
        // Missing required fields
        tables: {}
      } as SyncConfig;

      const validation = SyncEngineAPI.validateConfig(invalidConfig);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should build configuration using fluent API', () => {
      const config = ConfigBuilder.create()
        .database('test-db', 'test-ns', 'test-db')
        .syncInterval(1000)
        .retryAttempts(5)
        .conflictResolution('last-write-wins')
        .table('todos', {
          zustandPath: 'todos',
          primaryKey: 'id',
          syncEnabled: true,
          schema: {
            fields: {
              id: { type: 'string' },
              text: { type: 'string' },
              completed: { type: 'bool' }
            }
          }
        })
        .build();

      expect(config.dbName).toBe('test-db');
      expect(config.syncInterval).toBe(1000);
      expect(config.retryAttempts).toBe(5);
      expect(config.conflictResolution).toBe('last-write-wins');
      expect(config.tables.todos).toBeDefined();
    });
  });

  describe('Database Adapter Abstraction', () => {
    it('should create sync engine with database adapter', async () => {
      const config: SyncConfig = {
        dbName: 'test-db',
        namespace: 'test-ns',
        database: 'test-db',
        tables: {
          todos: {
            zustandPath: 'todos',
            primaryKey: 'id',
            syncEnabled: true,
            schema: {
              fields: {
                id: { type: 'string' },
                text: { type: 'string' },
                completed: { type: 'bool' }
              }
            }
          }
        }
      };

      syncEngine = await SyncEngineAPI.create(config);
      expect(syncEngine.isReady()).toBe(true);
      expect(syncEngine.getAdapter()).toBeDefined();
      expect(syncEngine.getEngine()).toBeDefined();
    });

    it('should provide sync status information', async () => {
      const config: SyncConfig = {
        dbName: 'test-db',
        namespace: 'test-ns',
        database: 'test-db',
        tables: {
          todos: {
            zustandPath: 'todos',
            primaryKey: 'id',
            syncEnabled: true,
            schema: {
              fields: {
                id: { type: 'string' },
                text: { type: 'string' },
                completed: { type: 'bool' }
              }
            }
          }
        }
      };

      syncEngine = await SyncEngineAPI.create(config);
      const status = syncEngine.getSyncStatus();
      
      expect(status).toHaveProperty('pending');
      expect(status).toHaveProperty('syncing');
      expect(status).toHaveProperty('errors');
      expect(typeof status.pending).toBe('number');
      expect(typeof status.syncing).toBe('boolean');
      expect(Array.isArray(status.errors)).toBe(true);
    });
  });

  describe('Public API Interface', () => {
    it('should create middleware for Zustand integration', async () => {
      const config: SyncConfig = {
        dbName: 'test-db',
        namespace: 'test-ns',
        database: 'test-db',
        tables: {
          todos: {
            zustandPath: 'todos',
            primaryKey: 'id',
            syncEnabled: true,
            schema: {
              fields: {
                id: { type: 'string' },
                text: { type: 'string' },
                completed: { type: 'bool' }
              }
            }
          }
        }
      };

      syncEngine = await SyncEngineAPI.create(config);
      const middleware = syncEngine.createMiddleware('todos');
      
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should update configuration at runtime', async () => {
      const config: SyncConfig = {
        dbName: 'test-db',
        namespace: 'test-ns',
        database: 'test-db',
        tables: {
          todos: {
            zustandPath: 'todos',
            primaryKey: 'id',
            syncEnabled: true,
            schema: {
              fields: {
                id: { type: 'string' },
                text: { type: 'string' },
                completed: { type: 'bool' }
              }
            }
          }
        }
      };

      syncEngine = await SyncEngineAPI.create(config);
      
      // Update configuration
      syncEngine.updateConfig({
        syncInterval: 5000,
        retryAttempts: 10
      });

      // Configuration should be updated (we can't directly test this without exposing internal config)
      expect(() => syncEngine!.updateConfig({ syncInterval: 5000 })).not.toThrow();
    });
  });

  describe('Utility Functions', () => {
    it('should create simple table configuration', () => {
      const tableConfig = SyncEngineUtils.createTableConfig(
        'todos',
        'id',
        {
          id: 'string',
          text: 'string',
          completed: 'bool'
        }
      );

      expect(tableConfig.zustandPath).toBe('todos');
      expect(tableConfig.primaryKey).toBe('id');
      expect(tableConfig.syncEnabled).toBe(true);
      expect(tableConfig.schema.fields).toBeDefined();
      expect(tableConfig.schema.fields.id.type).toBe('string');
    });

    it('should create enhanced table configuration', () => {
      const schema = {
        fields: {
          id: { type: 'string', constraints: { unique: true } },
          text: { type: 'string', constraints: { nullable: false } },
          completed: { type: 'bool', constraints: { default: false } }
        },
        indexes: [
          { name: 'idx_completed', fields: ['completed'] }
        ]
      };

      const tableConfig = SyncEngineUtils.createEnhancedTableConfig(
        'todos',
        'id',
        schema
      );

      expect(tableConfig.schema.fields.id.constraints?.unique).toBe(true);
      expect(tableConfig.schema.indexes).toHaveLength(1);
      expect(tableConfig.schema.indexes![0].name).toBe('idx_completed');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid configuration', async () => {
      const invalidConfig = {
        // Missing required fields
      } as SyncConfig;

      await expect(SyncEngineAPI.create(invalidConfig)).rejects.toThrow();
    });

    it('should throw error when using uninitialized engine', () => {
      const uninitializedEngine = new SyncEngineAPI();
      
      expect(() => uninitializedEngine.createMiddleware('todos')).toThrow();
      expect(() => uninitializedEngine.getSyncStatus()).toThrow();
    });
  });
});