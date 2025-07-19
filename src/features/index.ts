// Advanced features exports
export { CollaborationManager } from './collaboration';
export { OfflineManager } from './offline';
export { PluginManager, PluginUtils } from './plugins';

// Export types with aliases to avoid conflicts
export type { 
  CollaborationSession as BasicCollaborationSession,
  UserPresence 
} from './collaboration';

export type { 
  OfflineConfig as BasicOfflineConfig,
  OfflineChange 
} from './offline';

export type { 
  Plugin,
  PluginHooks,
  PluginConfig,
  PluginContext,
  PluginRegistrationResult,
  OperationHandler
} from './plugins';

// Export advanced features
export * from './advancedSyncFeatures';