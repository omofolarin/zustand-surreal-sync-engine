import type { StateCreator } from 'zustand';
import type { SyncMiddleware } from '../core/types';
import type { Plugin, PluginHooks, PluginContext } from '../features/plugins';

/**
 * Plugin-aware middleware that can be extended by plugins
 */
export interface PluginMiddleware<T> extends SyncMiddleware<T> {
  /** Plugin name that created this middleware */
  pluginName: string;
  /** Priority for middleware execution order (higher = earlier) */
  priority?: number;
  /** Whether this middleware should run before or after core sync */
  phase: 'before' | 'after' | 'around';
}

/**
 * Middleware factory for creating plugin-aware middleware
 */
export class PluginMiddlewareFactory {
  private middlewares = new Map<string, PluginMiddleware<any>[]>();
  private plugins = new Map<string, Plugin>();
  
  /**
   * Register a plugin and its middleware
   * 
   * @param plugin - Plugin to register
   */
  registerPlugin(plugin: Plugin): void {
    this.plugins.set(plugin.name, plugin);
    
    if (plugin.middleware) {
      const pluginMiddlewares = plugin.middleware.map((mw, index) => ({
        ...mw,
        pluginName: plugin.name,
        priority: plugin.config?.middlewarePriority || 0,
        phase: plugin.config?.middlewarePhase || 'around'
      } as PluginMiddleware<any>));
      
      this.middlewares.set(plugin.name, pluginMiddlewares);
    }
  }
  
  /**
   * Unregister a plugin and its middleware
   * 
   * @param pluginName - Name of plugin to unregister
   */
  unregisterPlugin(pluginName: string): void {
    this.plugins.delete(pluginName);
    this.middlewares.delete(pluginName);
  }
  
  /**
   * Create a composite middleware that includes all plugin middleware
   * 
   * @param tableName - Table name for the middleware
   * @param baseMiddleware - Base sync middleware
   * @returns Composite middleware with plugin extensions
   */
  createCompositeMiddleware<T>(
    tableName: string,
    baseMiddleware: SyncMiddleware<T>
  ): SyncMiddleware<T> {
    return (config: StateCreator<T, [], []>) => {
      // Get all middleware for this table, sorted by priority
      const allMiddlewares = this.getAllMiddlewares<T>(tableName);
      
      // Separate middleware by phase
      const beforeMiddlewares = allMiddlewares.filter(mw => mw.phase === 'before');
      const afterMiddlewares = allMiddlewares.filter(mw => mw.phase === 'after');
      const aroundMiddlewares = allMiddlewares.filter(mw => mw.phase === 'around');
      
      // Create the middleware chain
      let enhancedConfig = config;
      
      // Apply 'before' middleware
      for (const middleware of beforeMiddlewares) {
        enhancedConfig = middleware(enhancedConfig);
      }
      
      // Apply 'around' middleware (includes base middleware)
      for (const middleware of aroundMiddlewares) {
        enhancedConfig = middleware(enhancedConfig);
      }
      
      // Apply base middleware
      enhancedConfig = baseMiddleware(enhancedConfig);
      
      // Apply 'after' middleware
      for (const middleware of afterMiddlewares) {
        enhancedConfig = middleware(enhancedConfig);
      }
      
      return enhancedConfig;
    };
  }
  
  /**
   * Create middleware that executes plugin hooks
   * 
   * @param tableName - Table name
   * @param hooks - Plugin hooks to execute
   * @returns Hook-executing middleware
   */
  createHookMiddleware<T>(tableName: string, hooks: PluginHooks): SyncMiddleware<T> {
    return (config: StateCreator<T, [], []>) => {
      return (set, get, api) => {
        const originalSet = set;
        
        // Wrap set function to execute hooks
        const wrappedSet = async (
          partial: T | Partial<T> | ((state: T) => T | Partial<T>),
          replace?: boolean | undefined
        ) => {
          const currentState = get();
          
          // Execute beforeSync hook
          if (hooks.beforeSync) {
            try {
              // Create a change record for the hook
              const changeRecord = {
                id: `${tableName}:${Date.now()}`,
                table: tableName,
                operation: 'UPDATE' as const,
                data: typeof partial === 'function' ? partial(currentState) : partial,
                metadata: {
                  id: `${tableName}:${Date.now()}`,
                  lastModified: Date.now(),
                  version: 1,
                  source: 'zustand' as const
                },
                timestamp: Date.now()
              };
              
              await hooks.beforeSync(changeRecord);
            } catch (error) {
              console.error('Plugin beforeSync hook failed:', error);
              if (hooks.onError) {
                await hooks.onError(error as Error);
              }
            }
          }
          
          // Execute the original set
          const result = originalSet(partial, replace);
          
          // Execute afterSync hook
          if (hooks.afterSync) {
            try {
              const newState = get();
              const changeRecord = {
                id: `${tableName}:${Date.now()}`,
                table: tableName,
                operation: 'UPDATE' as const,
                data: newState,
                metadata: {
                  id: `${tableName}:${Date.now()}`,
                  lastModified: Date.now(),
                  version: 1,
                  source: 'zustand' as const
                },
                timestamp: Date.now()
              };
              
              await hooks.afterSync(changeRecord);
            } catch (error) {
              console.error('Plugin afterSync hook failed:', error);
              if (hooks.onError) {
                await hooks.onError(error as Error);
              }
            }
          }
          
          return result;
        };
        
        return config(wrappedSet, get, api);
      };
    };
  }
  
  /**
   * Get all middleware for a table, sorted by priority
   */
  private getAllMiddlewares<T>(tableName: string): PluginMiddleware<T>[] {
    const allMiddlewares: PluginMiddleware<T>[] = [];
    
    for (const middlewares of this.middlewares.values()) {
      allMiddlewares.push(...middlewares);
    }
    
    // Sort by priority (higher priority first)
    return allMiddlewares.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }
}

/**
 * Create a plugin-aware sync middleware
 * 
 * @param syncEngine - Sync engine instance
 * @param tableName - Table name
 * @param plugins - Array of plugins to include
 * @returns Plugin-aware middleware
 */
export function createPluginAwareMiddleware<T>(
  syncEngine: any,
  tableName: string,
  plugins: Plugin[] = []
): SyncMiddleware<T> {
  const factory = new PluginMiddlewareFactory();
  
  // Register all plugins
  for (const plugin of plugins) {
    factory.registerPlugin(plugin);
  }
  
  // Get base middleware from sync engine
  const baseMiddleware = syncEngine.createSyncMiddleware<T>(tableName);
  
  // Create composite middleware
  return factory.createCompositeMiddleware(tableName, baseMiddleware);
}

/**
 * Middleware for handling plugin operations
 */
export function createPluginOperationMiddleware<T>(
  pluginManager: any,
  tableName: string
): SyncMiddleware<T> {
  return (config: StateCreator<T, [], []>) => {
    return (set, get, api) => {
      const originalSet = set;
      
      const wrappedSet = async (
        partial: T | Partial<T> | ((state: T) => T | Partial<T>),
        replace?: boolean | undefined
      ) => {
        // Check if this is a plugin operation
        if (typeof partial === 'object' && partial !== null && 'pluginOperation' in partial) {
          const operation = (partial as any).pluginOperation;
          
          try {
            // Execute plugin operation
            const result = await pluginManager.executeOperation(
              operation.name,
              operation.data,
              operation.plugin
            );
            
            // Update state with operation result
            if (result) {
              return originalSet(result, replace);
            }
          } catch (error) {
            console.error('Plugin operation failed:', error);
            throw error;
          }
        }
        
        return originalSet(partial, replace);
      };
      
      return config(wrappedSet, get, api);
    };
  };
}

/**
 * Utility for creating middleware that transforms data through plugins
 */
export function createDataTransformMiddleware<T>(
  plugins: Plugin[],
  tableName: string
): SyncMiddleware<T> {
  return (config: StateCreator<T, [], []>) => {
    return (set, get, api) => {
      const originalSet = set;
      
      const wrappedSet = async (
        partial: T | Partial<T> | ((state: T) => T | Partial<T>),
        replace?: boolean | undefined
      ) => {
        let transformedData = typeof partial === 'function' ? partial(get()) : partial;
        
        // Apply data transformations from plugins
        for (const plugin of plugins) {
          if (plugin.hooks?.beforeUpdate) {
            try {
              transformedData = await plugin.hooks.beforeUpdate(
                tableName,
                'unknown', // ID would need to be determined
                transformedData
              );
            } catch (error) {
              console.error(`Data transform failed in plugin ${plugin.name}:`, error);
            }
          }
        }
        
        return originalSet(transformedData, replace);
      };
      
      return config(wrappedSet, get, api);
    };
  };
}