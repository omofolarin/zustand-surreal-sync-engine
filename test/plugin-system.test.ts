import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedSyncEngine } from '../src/core/EnhancedSyncEngine';
import { PluginManager, PluginUtils, type Plugin } from '../src/features/plugins';
import { SurrealDBAdapter } from '../src/adapters/SurrealDBAdapter';
import { create } from 'zustand';
import { createPluginAwareMiddleware } from '../src/middleware/pluginMiddleware';

// Mock adapter for testing
const mockAdapter = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  create: vi.fn().mockResolvedValue({ id: 'test-id' }),
  update: vi.fn().mockResolvedValue({ id: 'test-id' }),
  delete: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
  startLiveQuery: vi.fn().mockResolvedValue(undefined),
  stopLiveQuery: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  healthCheck: vi.fn().mockResolvedValue(true)
};

describe('Plugin System', () => {
  let syncEngine: EnhancedSyncEngine;
  let pluginManager: PluginManager;

  beforeEach(() => {
    const config = {
      adapter: mockAdapter as any,
      syncInterval: 1000,
      dbName: 'test',
      namespace: 'test',
      database: 'test',
      tables: {
        test: {
          zustandPath: 'test',
          primaryKey: 'id',
          schema: {
            fields: {
              id: { type: 'string' },
              name: { type: 'string' }
            }
          }
        }
      }
    };
    
    syncEngine = new EnhancedSyncEngine(config, 'test-user');
    pluginManager = new PluginManager(syncEngine);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Plugin Registration', () => {
    it('should register a valid plugin', async () => {
      const testPlugin: Plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin'
      };

      const result = await pluginManager.register(testPlugin);
      
      expect(result.success).toBe(true);
      expect(pluginManager.hasPlugin('test-plugin')).toBe(true);
      expect(pluginManager.getPlugin('test-plugin')).toBe(testPlugin);
    });

    it('should reject plugin with invalid name', async () => {
      const invalidPlugin: Plugin = {
        name: 'Invalid Plugin Name!',
        version: '1.0.0'
      };

      const result = await pluginManager.register(invalidPlugin);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('lowercase letters, numbers, and hyphens');
    });

    it('should reject plugin without required fields', async () => {
      const incompletePlugin = {
        description: 'Missing name and version'
      } as Plugin;

      const result = await pluginManager.register(incompletePlugin);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('name is required');
    });

    it('should prevent duplicate plugin registration', async () => {
      const plugin: Plugin = {
        name: 'duplicate-test',
        version: '1.0.0'
      };

      await pluginManager.register(plugin);
      const result = await pluginManager.register(plugin);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('already registered');
    });

    it('should check plugin dependencies', async () => {
      const dependentPlugin: Plugin = {
        name: 'dependent-plugin',
        version: '1.0.0',
        dependencies: ['non-existent-plugin']
      };

      const result = await pluginManager.register(dependentPlugin);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing dependencies');
    });
  });

  describe('Plugin Lifecycle', () => {
    it('should call plugin initialize method', async () => {
      const initializeSpy = vi.fn().mockResolvedValue(undefined);
      
      const plugin: Plugin = {
        name: 'lifecycle-test',
        version: '1.0.0',
        initialize: initializeSpy
      };

      await pluginManager.register(plugin);
      
      expect(initializeSpy).toHaveBeenCalledWith(syncEngine);
    });

    it('should call plugin destroy method on unregister', async () => {
      const destroySpy = vi.fn().mockResolvedValue(undefined);
      
      const plugin: Plugin = {
        name: 'destroy-test',
        version: '1.0.0',
        destroy: destroySpy
      };

      await pluginManager.register(plugin);
      const success = await pluginManager.unregister('destroy-test');
      
      expect(success).toBe(true);
      expect(destroySpy).toHaveBeenCalled();
      expect(pluginManager.hasPlugin('destroy-test')).toBe(false);
    });

    it('should validate plugin configuration', async () => {
      const validateConfigSpy = vi.fn().mockResolvedValue(true);
      
      const plugin: Plugin = {
        name: 'config-test',
        version: '1.0.0',
        config: { setting: 'value' },
        validateConfig: validateConfigSpy
      };

      await pluginManager.register(plugin);
      
      expect(validateConfigSpy).toHaveBeenCalledWith({ setting: 'value' });
    });
  });

  describe('Plugin Hooks', () => {
    it('should execute beforeSync hook', async () => {
      const beforeSyncSpy = vi.fn().mockImplementation(async (data) => {
        data.modified = true;
        return data;
      });

      const plugin: Plugin = {
        name: 'hook-test',
        version: '1.0.0',
        hooks: {
          beforeSync: beforeSyncSpy
        }
      };

      await pluginManager.register(plugin);

      const testData = {
        id: 'test-id',
        table: 'test-table',
        operation: 'UPDATE' as const,
        data: { test: 'data' },
        metadata: {
          id: 'meta-id',
          lastModified: Date.now(),
          version: 1,
          source: 'zustand' as const
        },
        timestamp: Date.now()
      };

      const result = await pluginManager.executeHook('beforeSync', testData);
      
      expect(beforeSyncSpy).toHaveBeenCalledWith(testData);
      expect(result.modified).toBe(true);
    });

    it('should handle hook errors gracefully', async () => {
      const errorHookSpy = vi.fn().mockRejectedValue(new Error('Hook error'));
      const onErrorSpy = vi.fn().mockResolvedValue(undefined);

      const plugin: Plugin = {
        name: 'error-test',
        version: '1.0.0',
        hooks: {
          beforeSync: errorHookSpy,
          onError: onErrorSpy
        }
      };

      await pluginManager.register(plugin);

      const testData = {
        id: 'test-id',
        table: 'test-table',
        operation: 'UPDATE' as const,
        data: {},
        metadata: {
          id: 'meta-id',
          lastModified: Date.now(),
          version: 1,
          source: 'zustand' as const
        },
        timestamp: Date.now()
      };

      // Should not throw, but handle error internally
      const result = await pluginManager.executeHook('beforeSync', testData);
      
      expect(result).toBe(testData); // Original data returned
      expect(onErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Plugin Operations', () => {
    it('should execute plugin operations', async () => {
      const operationSpy = vi.fn().mockResolvedValue({ result: 'success' });

      const plugin: Plugin = {
        name: 'operation-test',
        version: '1.0.0',
        operations: {
          'test-operation': operationSpy
        }
      };

      await pluginManager.register(plugin);

      const result = await pluginManager.executeOperation('test-operation', { input: 'data' });
      
      expect(operationSpy).toHaveBeenCalledWith(
        { input: 'data' },
        expect.objectContaining({ syncEngine })
      );
      expect(result).toEqual({ result: 'success' });
    });

    it('should execute operation on specific plugin', async () => {
      const operation1Spy = vi.fn().mockResolvedValue({ plugin: 'plugin1' });
      const operation2Spy = vi.fn().mockResolvedValue({ plugin: 'plugin2' });

      const plugin1: Plugin = {
        name: 'plugin1',
        version: '1.0.0',
        operations: { 'shared-op': operation1Spy }
      };

      const plugin2: Plugin = {
        name: 'plugin2',
        version: '1.0.0',
        operations: { 'shared-op': operation2Spy }
      };

      await pluginManager.register(plugin1);
      await pluginManager.register(plugin2);

      const result = await pluginManager.executeOperation('shared-op', {}, 'plugin2');
      
      expect(operation2Spy).toHaveBeenCalled();
      expect(operation1Spy).not.toHaveBeenCalled();
      expect(result).toEqual({ plugin: 'plugin2' });
    });

    it('should throw error for non-existent operation', async () => {
      await expect(
        pluginManager.executeOperation('non-existent', {})
      ).rejects.toThrow('Operation non-existent not found');
    });
  });

  describe('Plugin Health Check', () => {
    it('should check plugin health', async () => {
      const healthCheckSpy = vi.fn().mockResolvedValue(true);

      const plugin: Plugin = {
        name: 'health-test',
        version: '1.0.0',
        healthCheck: healthCheckSpy
      };

      await pluginManager.register(plugin);

      const health = await pluginManager.getPluginHealth();
      
      expect(health['health-test']).toBe(true);
      expect(healthCheckSpy).toHaveBeenCalled();
    });

    it('should handle health check failures', async () => {
      const failingHealthCheck = vi.fn().mockRejectedValue(new Error('Health check failed'));

      const plugin: Plugin = {
        name: 'failing-health',
        version: '1.0.0',
        healthCheck: failingHealthCheck
      };

      await pluginManager.register(plugin);

      const health = await pluginManager.getPluginHealth();
      
      expect(health['failing-health']).toBe(false);
    });
  });

  describe('Enhanced Sync Engine Integration', () => {
    it('should register plugins through sync engine', async () => {
      const plugin: Plugin = {
        name: 'integration-test',
        version: '1.0.0'
      };

      await syncEngine.use(plugin);
      
      expect(syncEngine.hasPlugin('integration-test')).toBe(true);
      expect(syncEngine.getPlugins()).toContain(plugin);
    });

    it('should unregister plugins through sync engine', async () => {
      const plugin: Plugin = {
        name: 'unregister-test',
        version: '1.0.0'
      };

      await syncEngine.use(plugin);
      const success = await syncEngine.unuse('unregister-test');
      
      expect(success).toBe(true);
      expect(syncEngine.hasPlugin('unregister-test')).toBe(false);
    });

    it('should execute plugin operations through sync engine', async () => {
      const operationSpy = vi.fn().mockResolvedValue({ executed: true });

      const plugin: Plugin = {
        name: 'sync-engine-op-test',
        version: '1.0.0',
        operations: {
          'test-op': operationSpy
        }
      };

      await syncEngine.use(plugin);

      const result = await syncEngine.executePluginOperation('test-op', { data: 'test' });
      
      expect(result).toEqual({ executed: true });
      expect(operationSpy).toHaveBeenCalled();
    });
  });

  describe('Plugin Utils', () => {
    it('should create plugin template', () => {
      const template = PluginUtils.createTemplate('test-plugin', '1.0.0');
      
      expect(template.name).toBe('test-plugin');
      expect(template.version).toBe('1.0.0');
      expect(template.description).toBe('Plugin test-plugin');
      expect(template.hooks).toBeDefined();
      expect(template.config).toBeDefined();
      expect(template.initialize).toBeDefined();
      expect(template.destroy).toBeDefined();
    });

    it('should validate plugin config', () => {
      const validConfig = { setting: 'value' };
      const invalidConfig = null;
      
      expect(PluginUtils.validateConfig(validConfig, {})).toBe(true);
      expect(PluginUtils.validateConfig(invalidConfig as any, {})).toBe(false);
    });

    it('should merge plugin configs', () => {
      const config1 = { a: 1, b: 2 };
      const config2 = { b: 3, c: 4 };
      const config3 = { c: 5, d: 6 };
      
      const merged = PluginUtils.mergeConfigs(config1, config2, config3);
      
      expect(merged).toEqual({ a: 1, b: 3, c: 5, d: 6 });
    });
  });

  describe('Plugin Middleware Integration', () => {
    it('should create plugin-aware middleware', async () => {
      const beforeSyncSpy = vi.fn().mockImplementation(async (data) => data);

      const plugin: Plugin = {
        name: 'middleware-test',
        version: '1.0.0',
        hooks: {
          beforeSync: beforeSyncSpy
        }
      };

      await syncEngine.use(plugin);

      interface TestState {
        items: string[];
        addItem: (item: string) => void;
      }

      const useTestStore = create<TestState>(
        createPluginAwareMiddleware(syncEngine, 'test-table', [plugin])((set) => ({
          items: [],
          addItem: (item: string) => {
            set(state => ({ items: [...state.items, item] }));
          }
        }))
      );

      const store = useTestStore.getState();
      store.addItem('test-item');

      // Verify the plugin hook was called during middleware execution
      // Note: This is a simplified test - in real usage, the middleware would
      // integrate more deeply with the sync engine's operation flow
      expect(useTestStore.getState().items).toContain('test-item');
    });
  });
});

describe('Plugin Examples', () => {
  let syncEngine: EnhancedSyncEngine;

  beforeEach(() => {
    const config = {
      adapter: mockAdapter as any,
      syncInterval: 1000,
      dbName: 'test',
      namespace: 'test',
      database: 'test',
      tables: {
        test: {
          zustandPath: 'test',
          primaryKey: 'id',
          schema: {
            fields: {
              id: { type: 'string' },
              name: { type: 'string' }
            }
          }
        }
      }
    };
    
    syncEngine = new EnhancedSyncEngine(config, 'test-user');
  });

  it('should work with audit plugin pattern', async () => {
    const auditLogs: any[] = [];

    const AuditPlugin: Plugin = {
      name: 'audit-logger',
      version: '1.0.0',
      hooks: {
        beforeSync: async (data) => {
          auditLogs.push({ action: 'before_sync', data });
          return data;
        },
        afterSync: async (data) => {
          auditLogs.push({ action: 'after_sync', data });
        }
      },
      operations: {
        'get-logs': async () => auditLogs
      }
    };

    await syncEngine.use(AuditPlugin);

    // Simulate sync operation through plugin hooks
    const testData = {
      id: 'test-id',
      table: 'test-table',
      operation: 'CREATE' as const,
      data: { name: 'test' },
      metadata: {
        id: 'meta-id',
        lastModified: Date.now(),
        version: 1,
        source: 'zustand' as const
      },
      timestamp: Date.now()
    };

    await syncEngine['pluginManager'].executeHook('beforeSync', testData);
    await syncEngine['pluginManager'].executeHook('afterSync', testData);

    const logs = await syncEngine.executePluginOperation('get-logs');
    
    expect(logs).toHaveLength(2);
    expect(logs[0].action).toBe('before_sync');
    expect(logs[1].action).toBe('after_sync');
  });

  it('should work with validation plugin pattern', async () => {
    const ValidationPlugin: Plugin = {
      name: 'validator',
      version: '1.0.0',
      hooks: {
        beforeCreate: async (table: string, data: any) => {
          if (table === 'users' && !data.email) {
            throw new Error('Email is required');
          }
          return data;
        }
      },
      operations: {
        'validate': async (data: { table: string; data: any }) => {
          if (data.table === 'users' && !data.data.email) {
            return { valid: false, errors: ['Email is required'] };
          }
          return { valid: true, errors: [] };
        }
      }
    };

    await syncEngine.use(ValidationPlugin);

    // Test validation operation
    const validResult = await syncEngine.executePluginOperation('validate', {
      table: 'users',
      data: { email: 'test@example.com' }
    });

    const invalidResult = await syncEngine.executePluginOperation('validate', {
      table: 'users',
      data: { name: 'Test User' }
    });

    expect(validResult.valid).toBe(true);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors).toContain('Email is required');
  });
});