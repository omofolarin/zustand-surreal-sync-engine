import { create } from 'zustand';
import { ZustandSurrealSyncEngine } from './syncEngine';
import { SurrealDBAdapter } from '../services/surrealdb';
import type { Todo, TodoState, SyncConfig } from '../types';


export const syncConfig: SyncConfig = {
  dbName: 'todoapp-indexeddb',
  namespace: 'test',
  database: 'todo-db',
  tables: {
    todos: {
      zustandPath: 'todos',
      primaryKey: 'id',
      syncEnabled: true,
      schema: {
        text: 'string',
        completed: 'bool',
        createdAt: 'datetime'
      }
    }
  },
  conflictResolution: 'last-write-wins',
  syncInterval: 300,
  retryAttempts: 5
};

export const syncEngine = new ZustandSurrealSyncEngine(syncConfig);

export const useTodoStore = create<TodoState>()(
  syncEngine.createSyncMiddleware<TodoState>('todos')(
    (set) => ({
      todos: [],
      addTodo: (text: string) => {
        const newTodo: Todo = {
          text,
          completed: false,
          createdAt: new Date(),
          lastModified: new Date(),
        };

        set((state) => ({
          todos: [...state.todos, newTodo]
        }));

        return newTodo;
      },
      updateTodo: (id, updates) => {
        set((state) => ({
          todos: state.todos.map(todo =>
            todo.id === id ? { ...todo, ...updates } : todo
          )
        }));
      },
      deleteTodo: (id) => {
        set((state) => ({
          todos: state.todos.filter(todo => todo.id !== id)
        }));
      },
      toggleTodo: (id) => {
        set((state) => ({
          todos: state.todos.map(todo =>
            todo.id === id ? { ...todo, completed: !todo.completed } : todo
          )
        }));
      }
    })
  )
);

export async function initializeSync(dbAdapterInstance: SurrealDBAdapter) {
  try {
    console.log("Attempting to initialize sync engine...");
    await syncEngine.initialize(dbAdapterInstance);
    await syncEngine.loadInitialData('todos');
    console.log('Sync engine initialized successfully and initial data loaded.');
  } catch (error) {
    console.error('Failed to initialize sync engine:', error);
    throw error; // Re-throw to be caught by UI
  }
}

export async function shutdownSync() {
  await syncEngine.shutdown();
  console.log('Sync engine shut down.');
}
