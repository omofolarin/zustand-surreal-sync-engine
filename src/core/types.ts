import { StringRecordId } from 'surrealdb';
import { StateCreator } from 'zustand';

// Core sync engine types
export interface SyncStatus {
  /** Number of pending changes waiting to be synchronized */
  pending: number;
  /** Whether synchronization is currently in progress */
  syncing: boolean;
  /** Timestamp of last successful synchronization */
  lastSync?: number;
  /** Array of recent synchronization errors */
  errors: string[];
  /** Connection status to the database */
  connected: boolean;
  /** Number of active live queries */
  liveQueries: number;
}

/**
 * Database adapter interface for abstracting database operations
 * 
 * This interface allows the sync engine to work with different database
 * implementations while maintaining a consistent API.
 */
export interface DatabaseAdapter {
  /** Establish connection to the database */
  connect(): Promise<void>;
  /** Close connection to the database */
  disconnect(): Promise<void>;
  
  // CRUD operations
  /** Create a new record in the specified table */
  create<T = any>(table: string, data: Partial<T>): Promise<T>;
  /** Update an existing record by ID */
  update<T = any>(id: StringRecordId, data: Partial<T>): Promise<T>;
  /** Delete a record by ID */
  delete(id: StringRecordId): Promise<void>;
  /** Select records from a table, optionally by ID */
  select<T = any>(table: string, id?: StringRecordId): Promise<T | T[]>;
  
  // Live queries for real-time updates
  /** Start a live query for real-time updates */
  startLiveQuery(table: string, callback: LiveQueryCallback): Promise<void>;
  /** Stop a live query */
  stopLiveQuery(table: string): Promise<void>;
  
  // Connection status
  /** Check if the adapter is connected to the database */
  isConnected(): boolean;
  
  // Health check
  /** Perform a health check on the database connection */
  healthCheck(): Promise<boolean>;
}

/**
 * Callback function for live query notifications
 */
export interface LiveQueryCallback {
  (notification: LiveQueryNotification): void;
}

/**
 * Live query notification structure
 */
export interface LiveQueryNotification {
  /** The action that triggered the notification */
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  /** The affected record data */
  result: any;
  /** Additional metadata about the change */
  metadata?: {
    timestamp: number;
    source?: string;
  };
}

/**
 * Configuration options for the sync engine
 */
export interface SyncEngineConfig {
  /** Interval between sync operations in milliseconds (default: 2000) */
  syncInterval?: number;
  /** Number of retry attempts for failed operations (default: 3) */
  retryAttempts?: number;
  /** Maximum number of changes to process in a single batch (default: 50) */
  batchSize?: number;
  /** Enable detailed logging for debugging (default: false) */
  enableLogging?: boolean;
  /** Timeout for database operations in milliseconds (default: 5000) */
  operationTimeout?: number;
  /** Enable offline mode support (default: true) */
  offlineSupport?: boolean;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** Array of validation errors */
  errors: string[];
  /** Array of validation warnings */
  warnings: string[];
}

/**
 * Sync metadata for tracking changes
 */
export interface SyncMetadata {
  /** Unique identifier for the metadata */
  id: string;
  /** Timestamp when the record was last modified */
  lastModified: number;
  /** Version number for optimistic concurrency control */
  version: number;
  /** Source of the change (zustand or database) */
  source: 'zustand' | 'surrealdb';
  /** Optional user ID who made the change */
  userId?: string;
  /** Optional session ID for tracking user sessions */
  sessionId?: string;
}

/**
 * Change record for tracking synchronization operations
 */
export interface ChangeRecord {
  /** Record ID being changed */
  id: StringRecordId;
  /** Table name where the change occurred */
  table: string;
  /** Type of operation being performed */
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  /** Data payload for the change */
  data: any;
  /** Metadata about the change */
  metadata: SyncMetadata;
  /** Timestamp when the change was recorded */
  timestamp: number;
  /** Number of retry attempts for this change */
  retryAttempts?: number;
  /** Error message if the change failed */
  error?: string;
}

/**
 * Zustand middleware type for sync functionality
 */
export type SyncMiddleware<T> = (
  config: StateCreator<T, [], []>
) => StateCreator<T, [], []>;

/**
 * Sync engine event types
 */
export type SyncEngineEvent = 
  | 'sync-start'
  | 'sync-complete'
  | 'sync-error'
  | 'connection-lost'
  | 'connection-restored'
  | 'conflict-detected'
  | 'change-queued'
  | 'change-synced';

/**
 * Event handler function type
 */
export interface SyncEngineEventHandler {
  (event: SyncEngineEvent, data?: any): void;
}

/**
 * Conflict resolution strategies
 */
export type ConflictResolutionStrategy = 
  | 'last-write-wins'
  | 'first-write-wins'
  | 'manual'
  | 'merge';

/**
 * Conflict information for manual resolution
 */
export interface ConflictInfo {
  /** Field where the conflict occurred */
  field: string;
  /** Local value */
  localValue: any;
  /** Remote value */
  remoteValue: any;
  /** Local timestamp */
  localTimestamp: number;
  /** Remote timestamp */
  remoteTimestamp: number;
  /** Conflict resolution strategy to use */
  strategy: ConflictResolutionStrategy;
}

/**
 * Sync engine metrics for monitoring
 */
export interface SyncEngineMetrics {
  /** Total number of sync operations performed */
  totalOperations: number;
  /** Number of successful sync operations */
  successfulSyncs: number;
  /** Number of failed sync operations */
  failedSyncs: number;
  /** Number of conflicts resolved */
  conflictsResolved: number;
  /** Average sync operation time in milliseconds */
  averageSyncTime: number;
  /** Total amount of data transferred in bytes */
  dataTransferred: number;
  /** Timestamp of last sync operation */
  lastSyncTimestamp: number;
  /** Current network latency in milliseconds */
  networkLatency: number;
  /** Error rate as a percentage */
  errorRate: number;
  /** Collaboration-specific metrics */
  collaborationMetrics?: {
    /** Number of active users in collaboration sessions */
    activeUsers: number;
    /** Operations per second rate */
    operationsPerSecond: number;
    /** Average response time for collaboration operations */
    averageResponseTime: number;
    /** Conflict rate as a percentage */
    conflictRate: number;
  };
}