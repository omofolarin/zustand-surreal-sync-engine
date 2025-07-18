import type { SyncConfig, ChangeRecord } from '../types';
import { StringRecordId } from 'surrealdb';

/**
 * Advanced Sync Features for Production-Ready Applications
 */

// 1. Batch Operations & Transactions
export interface BatchOperation {
  id: string;
  operations: ChangeRecord[];
  timestamp: number;
  userId: string;
  rollbackData?: any[];
}

export interface TransactionConfig {
  isolation: 'read-uncommitted' | 'read-committed' | 'repeatable-read' | 'serializable';
  timeout: number;
  retryOnConflict: boolean;
  maxRetries: number;
}

// 2. Advanced Conflict Resolution
export interface ConflictResolutionStrategy {
  type: 'three-way-merge' | 'semantic-merge' | 'custom-resolver' | 'user-choice';
  priority: 'local' | 'remote' | 'timestamp' | 'user-role';
  customResolver?: (local: any, remote: any, base: any) => Promise<any>;
  fieldStrategies?: Record<string, ConflictResolutionStrategy>;
}

// 3. Sync Policies & Rules
export interface SyncPolicy {
  name: string;
  conditions: {
    userRole?: string[];
    deviceType?: string[];
    networkCondition?: 'online' | 'offline' | 'slow';
    dataSize?: { max: number; unit: 'kb' | 'mb' };
  };
  actions: {
    syncMode: 'immediate' | 'batched' | 'scheduled';
    conflictResolution: ConflictResolutionStrategy;
    retryPolicy: {
      maxAttempts: number;
      backoffStrategy: 'linear' | 'exponential' | 'custom';
      baseDelay: number;
    };
  };
}

// 4. Data Versioning & History
export interface DataVersion {
  id: string;
  recordId: StringRecordId;
  version: number;
  data: any;
  timestamp: number;
  userId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  parentVersion?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

// 5. Sync Monitoring & Analytics
export interface SyncMetrics {
  totalOperations: number;
  successfulSyncs: number;
  failedSyncs: number;
  conflictsResolved: number;
  averageSyncTime: number;
  dataTransferred: number;
  lastSyncTimestamp: number;
  networkLatency: number;
  errorRate: number;
}

export interface SyncEvent {
  type: 'sync-start' | 'sync-complete' | 'sync-error' | 'conflict-detected' | 'connection-lost';
  timestamp: number;
  data: any;
  duration?: number;
  error?: Error;
}

// 6. Offline-First Capabilities
export interface OfflineConfig {
  enabled: boolean;
  storageQuota: number; // in MB
  syncOnReconnect: boolean;
  conflictResolution: 'merge' | 'overwrite' | 'manual';
  dataRetention: {
    maxAge: number; // in days
    maxRecords: number;
  };
  backgroundSync: {
    enabled: boolean;
    interval: number;
    conditions: string[]; // e.g., ['wifi-only', 'battery-sufficient']
  };
}

// 7. Real-time Collaboration
export interface CollaborationSession {
  id: string;
  recordId: StringRecordId;
  participants: CollaborationParticipant[];
  startTime: number;
  lastActivity: number;
  permissions: CollaborationPermissions;
  settings: CollaborationSettings;
}

export interface CollaborationParticipant {
  userId: string;
  username: string;
  role: 'owner' | 'editor' | 'viewer';
  cursor?: {
    field: string;
    position: number;
  };
  selection?: {
    field: string;
    start: number;
    end: number;
  };
  lastSeen: number;
  isActive: boolean;
}

export interface CollaborationPermissions {
  canEdit: string[]; // field names
  canView: string[];
  canComment: boolean;
  canShare: boolean;
}

export interface CollaborationSettings {
  showCursors: boolean;
  showSelections: boolean;
  autoSave: boolean;
  autoSaveInterval: number;
  lockFields: boolean; // prevent simultaneous editing
}

// 8. Data Validation & Sanitization
export interface ValidationRule {
  field: string;
  rules: {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'url';
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    custom?: (value: any, record: any) => boolean | string;
  };
  sanitization?: {
    trim?: boolean;
    lowercase?: boolean;
    uppercase?: boolean;
    removeHtml?: boolean;
    custom?: (value: any) => any;
  };
}

// 9. Caching & Performance
export interface CacheConfig {
  enabled: boolean;
  strategy: 'lru' | 'lfu' | 'ttl' | 'custom';
  maxSize: number; // number of records
  ttl: number; // time to live in ms
  compression: boolean;
  encryption: boolean;
  persistToDisk: boolean;
}

export interface PerformanceConfig {
  batchSize: number;
  debounceTime: number;
  throttleTime: number;
  lazyLoading: boolean;
  virtualScrolling: boolean;
  indexedFields: string[];
  preloadRelations: string[];
}

// 10. Security & Encryption
export interface SecurityConfig {
  encryption: {
    enabled: boolean;
    algorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305';
    keyRotation: {
      enabled: boolean;
      interval: number; // in days
    };
  };
  authentication: {
    required: boolean;
    methods: ('jwt' | 'oauth' | 'api-key')[];
    sessionTimeout: number;
  };
  authorization: {
    rbac: boolean; // Role-Based Access Control
    abac: boolean; // Attribute-Based Access Control
    fieldLevel: boolean;
  };
  audit: {
    enabled: boolean;
    logLevel: 'minimal' | 'standard' | 'detailed';
    retention: number; // in days
  };
}

// 11. Multi-tenant Support
export interface TenantConfig {
  enabled: boolean;
  isolation: 'database' | 'schema' | 'row-level';
  tenantIdField: string;
  defaultTenant: string;
  crossTenantQueries: boolean;
}

// 12. Data Migration & Schema Evolution
export interface MigrationConfig {
  version: string;
  migrations: Migration[];
  autoMigrate: boolean;
  backupBeforeMigration: boolean;
}

export interface Migration {
  version: string;
  description: string;
  up: (db: any) => Promise<void>;
  down: (db: any) => Promise<void>;
  dependencies?: string[];
}

// 13. Plugin System
export interface Plugin {
  name: string;
  version: string;
  hooks: {
    beforeSync?: (data: any) => Promise<any>;
    afterSync?: (data: any) => Promise<void>;
    onConflict?: (conflict: any) => Promise<any>;
    onError?: (error: Error) => Promise<void>;
  };
  middleware?: any[];
  config?: Record<string, any>;
}

// 14. Advanced Querying
export interface QueryBuilder {
  table(name: string): QueryBuilder;
  select(fields: string[]): QueryBuilder;
  where(condition: string | object): QueryBuilder;
  orderBy(field: string, direction?: 'asc' | 'desc'): QueryBuilder;
  limit(count: number): QueryBuilder;
  offset(count: number): QueryBuilder;
  join(table: string, condition: string): QueryBuilder;
  groupBy(fields: string[]): QueryBuilder;
  having(condition: string): QueryBuilder;
  raw(query: string): QueryBuilder;
  execute(): Promise<any[]>;
}

// 15. Event Sourcing
export interface EventStore {
  append(streamId: string, events: DomainEvent[]): Promise<void>;
  getEvents(streamId: string, fromVersion?: number): Promise<DomainEvent[]>;
  getSnapshot(streamId: string): Promise<Snapshot | null>;
  saveSnapshot(snapshot: Snapshot): Promise<void>;
}

export interface DomainEvent {
  id: string;
  streamId: string;
  version: number;
  type: string;
  data: any;
  metadata?: any;
  timestamp: number;
}

export interface Snapshot {
  streamId: string;
  version: number;
  data: any;
  timestamp: number;
}

// Enhanced Sync Engine Interface
export interface EnhancedSyncEngineConfig extends SyncConfig {
  // Advanced features
  batchOperations?: boolean;
  transactionConfig?: TransactionConfig;
  syncPolicies?: SyncPolicy[];
  offlineConfig?: OfflineConfig;
  collaborationConfig?: Partial<CollaborationSettings>;
  validationRules?: Record<string, ValidationRule[]>;
  cacheConfig?: CacheConfig;
  performanceConfig?: PerformanceConfig;
  securityConfig?: SecurityConfig;
  tenantConfig?: TenantConfig;
  migrationConfig?: MigrationConfig;
  plugins?: Plugin[];
  eventSourcing?: boolean;
}