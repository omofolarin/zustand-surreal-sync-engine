import type { 
  SyncEngineConfig, 
  ChangeRecord, 
  ConflictInfo, 
  SyncEngineEvent,
  SyncMiddleware 
} from '../core/types';
import type { 
  CollaborationSession, 
  CollaborationParticipant, 
  TextOperation,
  Comment
} from '../core/collaboration';

/**
 * Plugin lifecycle hooks for extending sync engine functionality
 */
export interface PluginHooks {
  // Sync lifecycle hooks
  beforeSync?: (data: ChangeRecord) => Promise<ChangeRecord>;
  afterSync?: (data: ChangeRecord) => Promise<void>;
  onSyncError?: (error: Error, data: ChangeRecord) => Promise<void>;
  
  // Conflict resolution hooks
  onConflict?: (conflict: ConflictInfo) => Promise<ConflictInfo>;
  onConflictResolved?: (conflict: ConflictInfo, resolution: any) => Promise<void>;
  
  // Collaboration hooks
  onCollaborationStart?: (session: CollaborationSession) => Promise<void>;
  onCollaborationEnd?: (session: CollaborationSession) => Promise<void>;
  onUserJoined?: (session: CollaborationSession, user: CollaborationParticipant) => Promise<void>;
  onUserLeft?: (session: CollaborationSession, userId: string) => Promise<void>;
  onTextOperation?: (operation: TextOperation) => Promise<TextOperation>;
  onCommentAdded?: (comment: Comment) => Promise<void>;
  
  // General event hooks
  onEvent?: (event: SyncEngineEvent, data: any) => Promise<void>;
  onError?: (error: Error) => Promise<void>;
  
  // Data transformation hooks
  beforeCreate?: (table: string, data: any) => Promise<any>;
  afterCreate?: (table: string, data: any, result: any) => Promise<void>;
  beforeUpdate?: (table: string, id: string, data: any) => Promise<any>;
  afterUpdate?: (table: string, id: string, data: any, result: any) => Promise<void>;
  beforeDelete?: (table: string, id: string) => Promise<void>;
  afterDelete?: (table: string, id: string) => Promise<void>;
}

/**
 * Plugin operation handler for custom operations
 */
export interface OperationHandler {
  (data: any, context: PluginContext): Promise<any>;
}

/**
 * Plugin context provided to operation handlers
 */
export interface PluginContext {
  syncEngine: any; // Will be the actual sync engine instance
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

/**
 * Plugin configuration options
 */
export interface PluginConfig {
  [key: string]: any;
}

/**
 * Plugin data models for extending core functionality
 */
export interface PluginDataModels {
  [modelName: string]: any;
}

/**
 * Main plugin interface
 */
export interface Plugin {
  /** Unique plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Plugin description */
  description?: string;
  /** Plugin author */
  author?: string;
  /** Plugin dependencies */
  dependencies?: string[];
  
  /** Plugin lifecycle hooks */
  hooks?: PluginHooks;
  
  /** Custom middleware for extending sync functionality */
  middleware?: SyncMiddleware<any>[];
  
  /** Plugin configuration */
  config?: PluginConfig;
  
  /** Plugin-specific data models */
  dataModels?: PluginDataModels;
  
  /** Custom operations */
  operations?: Record<string, OperationHandler>;
  
  /** Plugin initialization function */
  initialize?: (syncEngine: any) => Promise<void>;
  
  /** Plugin cleanup function */
  destroy?: () => Promise<void>;
  
  /** Plugin configuration validation */
  validateConfig?: (config: PluginConfig) => Promise<boolean>;
  
  /** Plugin health check */
  healthCheck?: () => Promise<boolean>;
}

/**
 * Plugin registration result
 */
export interface PluginRegistrationResult {
  success: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Plugin manager for registering and managing plugins
 */
export class PluginManager {
  private plugins = new Map<string, Plugin>();
  private pluginContexts = new Map<string, PluginContext>();
  private syncEngine: any;
  
  constructor(syncEngine: any) {
    this.syncEngine = syncEngine;
  }
  
  /**
   * Register a plugin with the sync engine
   * 
   * @param plugin - Plugin to register
   * @returns Registration result
   */
  async register(plugin: Plugin): Promise<PluginRegistrationResult> {
    try {
      // Validate plugin
      const validation = await this.validatePlugin(plugin);
      if (!validation.valid) {
        return {
          success: false,
          error: `Plugin validation failed: ${validation.errors.join(', ')}`
        };
      }
      
      // Check for conflicts
      if (this.plugins.has(plugin.name)) {
        return {
          success: false,
          error: `Plugin ${plugin.name} is already registered`
        };
      }
      
      // Check dependencies
      const dependencyCheck = this.checkDependencies(plugin);
      if (!dependencyCheck.satisfied) {
        return {
          success: false,
          error: `Missing dependencies: ${dependencyCheck.missing.join(', ')}`
        };
      }
      
      // Validate configuration
      if (plugin.validateConfig && plugin.config) {
        const configValid = await plugin.validateConfig(plugin.config);
        if (!configValid) {
          return {
            success: false,
            error: 'Plugin configuration validation failed'
          };
        }
      }
      
      // Create plugin context
      const context: PluginContext = {
        syncEngine: this.syncEngine,
        metadata: {}
      };
      this.pluginContexts.set(plugin.name, context);
      
      // Initialize plugin
      if (plugin.initialize) {
        await plugin.initialize(this.syncEngine);
      }
      
      // Register plugin
      this.plugins.set(plugin.name, plugin);
      
      // Register hooks
      if (plugin.hooks) {
        this.registerHooks(plugin.name, plugin.hooks);
      }
      
      // Register middleware
      if (plugin.middleware) {
        this.registerMiddleware(plugin.name, plugin.middleware);
      }
      
      // Register operations
      if (plugin.operations) {
        this.registerOperations(plugin.name, plugin.operations);
      }
      
      return {
        success: true,
        warnings: validation.warnings
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Failed to register plugin: ${error}`
      };
    }
  }
  
  /**
   * Unregister a plugin
   * 
   * @param pluginName - Name of plugin to unregister
   * @returns Whether unregistration was successful
   */
  async unregister(pluginName: string): Promise<boolean> {
    try {
      const plugin = this.plugins.get(pluginName);
      if (!plugin) {
        return false;
      }
      
      // Call plugin destroy method
      if (plugin.destroy) {
        await plugin.destroy();
      }
      
      // Unregister hooks
      this.unregisterHooks(pluginName);
      
      // Unregister middleware
      this.unregisterMiddleware(pluginName);
      
      // Unregister operations
      this.unregisterOperations(pluginName);
      
      // Remove plugin
      this.plugins.delete(pluginName);
      this.pluginContexts.delete(pluginName);
      
      return true;
      
    } catch (error) {
      console.error(`Failed to unregister plugin ${pluginName}:`, error);
      return false;
    }
  }
  
  /**
   * Get a registered plugin
   * 
   * @param name - Plugin name
   * @returns Plugin instance or undefined
   */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }
  
  /**
   * List all registered plugins
   * 
   * @returns Array of registered plugins
   */
  listPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }
  
  /**
   * Get plugin names
   * 
   * @returns Array of plugin names
   */
  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }
  
  /**
   * Check if a plugin is registered
   * 
   * @param name - Plugin name
   * @returns Whether plugin is registered
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }
  
  /**
   * Execute a specific hook across all plugins
   * 
   * @param hookName - Name of hook to execute
   * @param data - Data to pass to hook
   * @returns Processed data
   */
  async executeHook<T>(hookName: keyof PluginHooks, data: T): Promise<T> {
    let processedData = data;
    
    for (const [pluginName, plugin] of this.plugins) {
      if (plugin.hooks && plugin.hooks[hookName]) {
        try {
          const hook = plugin.hooks[hookName] as any;
          processedData = await hook(processedData);
        } catch (error) {
          console.error(`Error executing hook ${hookName} in plugin ${pluginName}:`, error);
          
          // Execute error hook if available
          if (plugin.hooks.onError) {
            await plugin.hooks.onError(error as Error);
          }
        }
      }
    }
    
    return processedData;
  }
  
  /**
   * Execute a custom operation
   * 
   * @param operationName - Name of operation to execute
   * @param data - Data to pass to operation
   * @param pluginName - Specific plugin to execute operation on (optional)
   * @returns Operation result
   */
  async executeOperation(operationName: string, data: any, pluginName?: string): Promise<any> {
    if (pluginName) {
      const plugin = this.plugins.get(pluginName);
      if (plugin?.operations?.[operationName]) {
        const context = this.pluginContexts.get(pluginName)!;
        return await plugin.operations[operationName](data, context);
      }
      throw new Error(`Operation ${operationName} not found in plugin ${pluginName}`);
    }
    
    // Execute on first plugin that has the operation
    for (const [name, plugin] of this.plugins) {
      if (plugin.operations?.[operationName]) {
        const context = this.pluginContexts.get(name)!;
        return await plugin.operations[operationName](data, context);
      }
    }
    
    throw new Error(`Operation ${operationName} not found in any plugin`);
  }
  
  /**
   * Get plugin health status
   * 
   * @returns Health status for all plugins
   */
  async getPluginHealth(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};
    
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.healthCheck) {
          health[name] = await plugin.healthCheck();
        } else {
          health[name] = true; // Assume healthy if no health check
        }
      } catch (error) {
        health[name] = false;
      }
    }
    
    return health;
  }
  
  /**
   * Validate a plugin before registration
   */
  private async validatePlugin(plugin: Plugin): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required fields
    if (!plugin.name) errors.push('Plugin name is required');
    if (!plugin.version) errors.push('Plugin version is required');
    
    // Name format validation
    if (plugin.name && !/^[a-z0-9-]+$/.test(plugin.name)) {
      errors.push('Plugin name must contain only lowercase letters, numbers, and hyphens');
    }
    
    // Version format validation
    if (plugin.version && !/^\d+\.\d+\.\d+/.test(plugin.version)) {
      warnings.push('Plugin version should follow semantic versioning (x.y.z)');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Check plugin dependencies
   */
  private checkDependencies(plugin: Plugin): {
    satisfied: boolean;
    missing: string[];
  } {
    if (!plugin.dependencies || plugin.dependencies.length === 0) {
      return { satisfied: true, missing: [] };
    }
    
    const missing = plugin.dependencies.filter(dep => !this.plugins.has(dep));
    
    return {
      satisfied: missing.length === 0,
      missing
    };
  }
  
  /**
   * Register plugin hooks
   */
  private registerHooks(pluginName: string, hooks: PluginHooks): void {
    // Store hooks for later execution
    // In a real implementation, this would integrate with the sync engine's event system
    console.log(`Registered hooks for plugin ${pluginName}:`, Object.keys(hooks));
  }
  
  /**
   * Unregister plugin hooks
   */
  private unregisterHooks(pluginName: string): void {
    console.log(`Unregistered hooks for plugin ${pluginName}`);
  }
  
  /**
   * Register plugin middleware
   */
  private registerMiddleware(pluginName: string, middleware: SyncMiddleware<any>[]): void {
    console.log(`Registered ${middleware.length} middleware functions for plugin ${pluginName}`);
  }
  
  /**
   * Unregister plugin middleware
   */
  private unregisterMiddleware(pluginName: string): void {
    console.log(`Unregistered middleware for plugin ${pluginName}`);
  }
  
  /**
   * Register plugin operations
   */
  private registerOperations(pluginName: string, operations: Record<string, OperationHandler>): void {
    console.log(`Registered operations for plugin ${pluginName}:`, Object.keys(operations));
  }
  
  /**
   * Unregister plugin operations
   */
  private unregisterOperations(pluginName: string): void {
    console.log(`Unregistered operations for plugin ${pluginName}`);
  }
}

/**
 * Plugin utilities for common plugin development tasks
 */
export class PluginUtils {
  /**
   * Create a basic plugin template
   * 
   * @param name - Plugin name
   * @param version - Plugin version
   * @returns Basic plugin template
   */
  static createTemplate(name: string, version: string): Plugin {
    return {
      name,
      version,
      description: `Plugin ${name}`,
      hooks: {},
      config: {},
      initialize: async (syncEngine: any) => {
        console.log(`Plugin ${name} initialized`);
      },
      destroy: async () => {
        console.log(`Plugin ${name} destroyed`);
      }
    };
  }
  
  /**
   * Validate plugin configuration
   * 
   * @param config - Configuration to validate
   * @param schema - Validation schema
   * @returns Whether configuration is valid
   */
  static validateConfig(config: PluginConfig, schema: any): boolean {
    // Simple validation - in real implementation would use a schema validator
    return typeof config === 'object' && config !== null;
  }
  
  /**
   * Merge plugin configurations
   * 
   * @param configs - Array of configurations to merge
   * @returns Merged configuration
   */
  static mergeConfigs(...configs: PluginConfig[]): PluginConfig {
    return Object.assign({}, ...configs);
  }
}