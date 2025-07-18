import { StringRecordId } from "surrealdb";

export interface SyncConfig {
  dbName: string;
  namespace: string;
  database: string;
  tables: Record<string, TableConfig>;
  conflictResolution?: 'last-write-wins' | 'manual';
  syncInterval?: number;
  retryAttempts?: number;
}

export interface FieldConstraints {
  unique?: boolean;
  nullable?: boolean;
  default?: any;
  assert?: string; // SurrealDB assertion expression
  value?: string;  // SurrealDB value expression
  permissions?: {
    select?: string;
    create?: string;
    update?: string;
    delete?: string;
  };
}

export interface FieldDefinition {
  type: string;
  constraints?: FieldConstraints;
}

export interface IndexDefinition {
  name: string;
  fields: string[];
  unique?: boolean;
  type?: 'btree' | 'hash' | 'fulltext';
}

export interface TableSchema {
  fields: Record<string, FieldDefinition>;
  indexes?: IndexDefinition[];
  permissions?: {
    select?: string;
    create?: string;
    update?: string;
    delete?: string;
  };
  events?: {
    [eventType: string]: string; // Event type -> SurrealQL function
  };
}

export interface TableConfig {
  zustandPath: string;
  primaryKey: string;
  schema: TableSchema;
  syncEnabled?: boolean;
  // Legacy support for simple schema format
  legacySchema?: Record<string, any>;
}

export interface SyncMetadata {
  id: string;
  lastModified: number;
  version: number;
  source: 'zustand' | 'surrealdb';
}

export interface ChangeRecord {
  id: StringRecordId;
  table: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  data: any;
  metadata: SyncMetadata;
  timestamp: number;
}

// Todo App Specific Types
export interface Todo {
  id?: StringRecordId;
  text: string;
  completed: boolean;
  createdAt: Date;
  updatedAt?: Date;
  priority?: number;
  tags?: string[];
  dueDate?: Date;
  category?: StringRecordId;
  metadata?: {
    estimatedMinutes: number;
    difficulty: 'easy' | 'medium' | 'hard';
    notes: string;
  };
  lastModified?: Date;
  version?: number;
  source?: 'zustand' | 'surrealdb';
}

export interface TodoState {
  todos: Todo[];
  addTodo: (text: string) => void;
  updateTodo: (id: StringRecordId, updates: Partial<Todo>) => void;
  deleteTodo: (id: StringRecordId) => void;
  toggleTodo: (id: StringRecordId) => void;
}
