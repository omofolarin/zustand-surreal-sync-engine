
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
  id: string;
  table: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  data: unknown;
  metadata: SyncMetadata;
  timestamp: number;
}

// Todo App Specific Types
export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  lastModified?: string;
  version?: number;
  source?: 'zustand' | 'surrealdb';
}

export interface TodoState {
  todos: Todo[];
  addTodo: (text: string) => void;
  updateTodo: (id: string, updates: Partial<Todo>) => void;
  deleteTodo: (id: string) => void;
  toggleTodo: (id: string) => void;
}
