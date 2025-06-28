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

export interface TableConfig {
  zustandPath: string;
  primaryKey: string;
  schema: Record<string, any>;
  syncEnabled?: boolean;
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
