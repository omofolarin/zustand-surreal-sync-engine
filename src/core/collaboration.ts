import { StringRecordId } from 'surrealdb';

// Real-time collaboration models (Figma/Google Docs level)
export interface CollaborationSession {
  id: string;
  recordId: StringRecordId;
  participants: CollaborationParticipant[];
  startTime: number;
  lastActivity: number;
  permissions: CollaborationPermissions;
  settings: CollaborationSettings;
  awareness: AwarenessState;
}

export interface CollaborationParticipant {
  userId: string;
  username: string;
  avatar?: string;
  color: string; // Unique color for cursors/selections
  role: 'owner' | 'editor' | 'viewer' | 'commenter';
  cursor?: CursorPosition;
  selection?: SelectionRange;
  presence: UserPresence;
  lastSeen: number;
  isActive: boolean;
}

export interface UserPresence {
  status: 'active' | 'idle' | 'away' | 'offline';
  currentField?: string;
  isTyping: boolean;
  lastActivity: number;
  viewport?: ViewportInfo;
  device: DeviceInfo;
}

export interface CursorPosition {
  field: string;
  position: number;
  line?: number;
  column?: number;
}

export interface SelectionRange {
  field: string;
  start: number;
  end: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

// Operational Transform for character-level synchronization
export interface TextOperation {
  id: string;
  type: 'insert' | 'delete' | 'retain';
  position: number;
  content?: string;
  length?: number;
  attributes?: TextAttributes;
  userId: string;
  timestamp: number;
  field: string;
}

export interface TextAttributes {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  backgroundColor?: string;
  fontSize?: number;
  fontFamily?: string;
}

// Comments and annotations (like Google Docs)
export interface Comment {
  id: string;
  recordId: StringRecordId;
  field: string;
  position: number;
  length: number;
  content: string;
  author: string;
  timestamp: number;
  resolved: boolean;
  replies: CommentReply[];
  mentions: string[];
}

export interface CommentReply {
  id: string;
  content: string;
  author: string;
  timestamp: number;
  mentions: string[];
}

// Awareness state for real-time presence
export interface AwarenessState {
  participants: Map<string, CollaborationParticipant>;
  cursors: Map<string, CursorPosition>;
  selections: Map<string, SelectionRange>;
  activeFields: Map<string, string[]>; // field -> userIds
  comments: Comment[];
}

// Conflict resolution models
export interface ConflictInfo {
  field: string;
  localValue: any;
  remoteValue: any;
  localTimestamp: number;
  remoteTimestamp: number;
  localUserId: string;
  remoteUserId: string;
  operationType: 'text' | 'object' | 'array';
  operations?: TextOperation[];
}

// Real-time events
export type CollaborationEvent = 
  | 'user-joined'
  | 'user-left'
  | 'cursor-moved'
  | 'selection-changed'
  | 'text-changed'
  | 'presence-updated'
  | 'comment-added'
  | 'comment-resolved'
  | 'field-locked'
  | 'field-unlocked';

export interface EventHandler {
  (data: any): void;
}

// Enhanced conflict resolution
export interface ConflictResolution {
  strategy: 'last-write-wins' | 'field-merge' | 'manual' | 'operational-transform';
  resolver?: (conflicts: ConflictInfo[]) => Promise<any>;
}

// Collaboration permissions
export interface CollaborationPermissions {
  canEdit: boolean;
  canComment: boolean;
  canView: boolean;
  fieldPermissions?: Record<string, FieldPermission>;
}

export interface FieldPermission {
  canEdit: boolean;
  canView: boolean;
  isLocked?: boolean;
  lockedBy?: string;
}

// Collaboration settings
export interface CollaborationSettings {
  enableCursors: boolean;
  enableSelections: boolean;
  enableComments: boolean;
  enablePresence: boolean;
  autoSaveInterval: number;
  conflictResolution: ConflictResolution;
}

// Device and viewport information
export interface DeviceInfo {
  type: 'desktop' | 'tablet' | 'mobile';
  os: string;
  browser: string;
  screenSize: { width: number; height: number };
  touchSupport: boolean;
  penSupport: boolean;
}

export interface ViewportInfo {
  scrollTop: number;
  scrollLeft: number;
  zoom: number;
  visibleArea: {
    top: number;
    left: number;
    bottom: number;
    right: number;
  };
}

// Batch operations
export interface BatchOperationBuilder {
  addOperation(operation: TextOperation): BatchOperationBuilder;
  addComment(comment: Comment): BatchOperationBuilder;
  updateCursor(cursor: CursorPosition): BatchOperationBuilder;
  updateSelection(selection: SelectionRange): BatchOperationBuilder;
  execute(): Promise<void>;
  clear(): BatchOperationBuilder;
}

// Health status
export interface HealthStatus {
  connected: boolean;
  latency: number;
  collaborationActive: boolean;
  activeSessions: number;
  errors: string[];
}

// Enhanced sync metrics
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
  collaborationMetrics: {
    activeUsers: number;
    operationsPerSecond: number;
    averageResponseTime: number;
    conflictRate: number;
  };
}

// Plugin interface
export interface Plugin {
  name: string;
  version: string;
  initialize?(engine: any): Promise<void>;
  destroy?(): Promise<void>;
}