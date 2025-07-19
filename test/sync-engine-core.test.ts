import { describe, it, expect } from 'bun:test';
import { 
  ConfigBuilder,
  ConfigValidator,
  SyncEngineUtils
} from '../src/core';
import { createSyncMiddleware } from '../src/middleware';
import type { SyncConfig, TableConfig } from '../src/types';

describe('Sync Engine Core Library', () => {
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

    it('should normalize configuration with defaults', () => {
      const minimalConfig: SyncConfig = {
        dbName: 'test',
        namespace: 'test',
        database: 'test',
        tables: {
          test: {
            zustandPath: 'test',
            primaryKey: 'id',
            schema: { fields: { id: { type: 'string' } } }
          }
        }
      };

      const normalized = ConfigValidator.normalize(minimalConfig);
      
      expect(normalized.syncInterval).toBe(2000);
      expect(normalized.retryAttempts).toBe(3);
      expect(normalized.conflictResolution).toBe('last-write-wins');
      expect(normalized.tables.test.syncEnabled).toBe(true);
    });
  });

  describe('ConfigBuilder Advanced Features', () => {
    it('should support method chaining', () => {
      const config = ConfigBuilder.create()
        .database('test', 'test', 'test')
        .syncInterval(1000)
        .retryAttempts(5)
        .conflictResolution('manual')
        .simpleTable('test', 'test')
        .build();
      
      expect(config.syncInterval).toBe(1000);
      expect(config.retryAttempts).toBe(5);
      expect(config.conflictResolution).toBe('manual');
    });

    it('should validate before building', () => {
      const builder = ConfigBuilder.create()
        .syncInterval(1000);

      const validation = builder.validate();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('dbName is required');
    });

    it('should clone builder correctly', () => {
      const original = ConfigBuilder.create()
        .database('test', 'test', 'test')
        .syncInterval(1000);

      const cloned = original.clone()
        .retryAttempts(5);

      const originalConfig = original.simpleTable('test', 'test').build();
      const clonedConfig = cloned.simpleTable('test', 'test').build();

      expect(originalConfig.retryAttempts).toBe(3); // default
      expect(clonedConfig.retryAttempts).toBe(5);
      expect(originalConfig.syncInterval).toBe(1000);
      expect(clonedConfig.syncInterval).toBe(1000);
    });

    it('should merge configurations in builder', () => {
      const baseConfig: Partial<SyncConfig> = {
        syncInterval: 500,
        retryAttempts: 10
      };

      const config = ConfigBuilder.create()
        .database('test', 'test', 'test')
        .merge(baseConfig)
        .simpleTable('test', 'test')
        .build();

      expect(config.syncInterval).toBe(500);
      expect(config.retryAttempts).toBe(10);
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

    it('should handle disabled tables', () => {
      const configWithDisabled: SyncConfig = {
        ...testConfig,
        tables: {
          ...testConfig.tables,
          disabled: {
            zustandPath: 'disabled',
            primaryKey: 'id',
            schema: { fields: { id: { type: 'string' } } },
            syncEnabled: false
          }
        }
      };

      const enabledTables = SyncEngineUtils.getEnabledTables(configWithDisabled);
      expect(Object.keys(enabledTables)).toEqual(['todos']);
      expect(enabledTables.disabled).toBeUndefined();
    });
  });

  describe('Schema Validation', () => {
    it('should validate enhanced schema', () => {
      const schema = {
        fields: {
          id: { type: 'string' },
          name: { 
            type: 'string',
            constraints: {
              nullable: false,
              assert: '$value != NONE'
            }
          },
          email: {
            type: 'string',
            constraints: {
              unique: true,
              assert: 'string::is::email($value)'
            }
          }
        },
        indexes: [
          { name: 'email_idx', fields: ['email'], unique: true }
        ]
      };

      const validation = ConfigValidator.validateSchema('users', schema);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect schema errors', () => {
      const invalidSchema = {
        fields: {
          badField: { /* missing type */ }
        },
        indexes: [
          { name: 'bad_idx', fields: ['nonexistent'] }
        ]
      };

      const validation = ConfigValidator.validateSchema('test', invalidSchema);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid configuration gracefully', () => {
      const invalidConfig = { ...testConfig };
      delete (invalidConfig as any).dbName;

      expect(() => ConfigValidator.normalize(invalidConfig)).not.toThrow();
      
      const validation = ConfigValidator.validate(invalidConfig);
      expect(validation.valid).toBe(false);
    });

    it('should handle empty configurations', () => {
      const emptyConfig = {} as SyncConfig;
      
      const validation = ConfigValidator.validate(emptyConfig);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should validate field constraints', () => {
      const constraints = {
        assert: '$value > 0',
        permissions: {
          select: 'true',
          create: '$auth.id != NONE',
          update: '$auth.id == $before.owner',
          delete: '$auth.role == "admin"'
        }
      };

      const validation = ConfigValidator.validateFieldConstraints('test', 'field', constraints);
      expect(validation.valid).toBe(true);
    });

    it('should detect invalid field constraints', () => {
      const invalidConstraints = {
        permissions: {
          invalid: 'true', // invalid permission type
          select: 123 // should be string
        }
      };

      const validation = ConfigValidator.validateFieldConstraints('test', 'field', invalidConstraints);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });
});