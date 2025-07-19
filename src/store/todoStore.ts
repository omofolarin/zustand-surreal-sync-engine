import { create } from 'zustand';
import { ZustandSurrealSyncEngine } from '../core/SyncEngine';
import { SurrealDBAdapter } from '../adapters/SurrealDBAdapter';
import type { Todo, TodoState, SyncConfig } from '../types';
import { FieldBuilder, IndexBuilder } from '../schema/builders';


// Enhanced Todo Schema using FieldBuilder and IndexBuilder utilities
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
        fields: {
          // Required text field with length validation
          text: FieldBuilder.string({
            required: true,
            minLength: 1,
            maxLength: 500
          }),
          
          // Boolean field with default value
          completed: FieldBuilder.boolean(false),
          
          // Auto-timestamp for creation
          createdAt: FieldBuilder.datetime({
            required: true,
            autoNowAdd: true
          }),
          
          // Auto-timestamp for updates
          updatedAt: FieldBuilder.datetime({
            autoNow: true
          }),
          
          // Priority with range validation
          priority: FieldBuilder.number({
            integer: true,
            min: 0,
            max: 5,
            default: 0
          }),
          
          // Tags array with max length
          tags: FieldBuilder.array('string', {
            maxLength: 10,
            default: []
          }),
          
          // Optional due date
          dueDate: FieldBuilder.datetime({
            required: false
          }),
          
          // Optional category reference
          category: FieldBuilder.record('categories', false),
          
          // Metadata object for extensibility
          metadata: FieldBuilder.object({
            estimatedMinutes: 0,
            difficulty: 'easy',
            notes: ''
          })
        },
        indexes: [
          IndexBuilder.composite('idx_completed', ['completed']),
          IndexBuilder.composite('idx_created_at', ['createdAt']),
          IndexBuilder.composite('idx_priority_completed', ['priority', 'completed']),
          IndexBuilder.composite('idx_due_date', ['dueDate']),
          IndexBuilder.composite('idx_category_completed', ['category', 'completed']),
          IndexBuilder.fulltext('idx_text_search', ['text'])
        ],
        permissions: {
          select: 'true', // Allow all reads for now
          create: 'true', // Allow all creates
          update: 'true', // Allow all updates
          delete: 'true'  // Allow all deletes
        }
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
