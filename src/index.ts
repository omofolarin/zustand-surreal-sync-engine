// Main library exports
export * from './core';
export * from './adapters';
export * from './middleware';
export * from './schema';
export * from './utils';

// Specific feature exports to avoid conflicts
export { CommentManager } from './features/comments';
export { FieldLockManager } from './features/field-locking';
export { CollaborationManager } from './features/collaboration';
export { PluginManager, PluginUtils } from './features/plugins';

// Re-export commonly used types
export type {
  SyncConfig,
  TableConfig,
  TableSchema,
  FieldDefinition,
  IndexDefinition,
  SyncMetadata,
  ChangeRecord,
  FieldConstraints
} from './types';

// Re-export enhanced core types
export type {
  DatabaseAdapter,
  SyncStatus,
  SyncEngineConfig,
  SyncEngineEvent,
  SyncEngineEventHandler,
  SyncEngineMetrics,
  LiveQueryCallback,
  LiveQueryNotification,
  ConfigValidationResult,
  SyncMiddleware,
  ConflictResolutionStrategy,
  ConflictInfo
} from './core/types';

// Re-export plugin types
export type {
  Plugin,
  PluginHooks,
  PluginConfig,
  PluginContext,
  PluginRegistrationResult,
  OperationHandler
} from './features/plugins';