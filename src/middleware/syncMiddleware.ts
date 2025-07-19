import { ZustandSurrealSyncEngine } from '../core/SyncEngine';
import { SyncEngineAPI } from '../core/SyncEngineAPI';
import type { SyncMiddleware } from '../core/types';

/**
 * Create sync middleware for a Zustand store
 * 
 * @param syncEngine - The sync engine instance
 * @param tableName - Name of the database table to sync with
 * @returns Zustand middleware function
 * 
 * @example
 * ```typescript
 * const syncEngine = await SyncEngineAPI.create(config);
 * const todoMiddleware = createSyncMiddleware(syncEngine, 'todos');
 * 
 * const useTodoStore = create(todoMiddleware((set, get) => ({
 *   todos: [],
 *   addTodo: (text) => set(state => ({ todos: [...state.todos, { text, completed: false }] }))
 * })));
 * ```
 */
export function createSyncMiddleware<T extends Record<string, any>>(
  syncEngine: ZustandSurrealSyncEngine | SyncEngineAPI,
  tableName: string
): SyncMiddleware<T> {
  if (syncEngine instanceof SyncEngineAPI) {
    return syncEngine.createMiddleware<T>(tableName);
  }
  return syncEngine.createSyncMiddleware<T>(tableName);
}

/**
 * Create multiple sync middlewares for different tables
 * 
 * @param syncEngine - The sync engine instance
 * @param tableNames - Array of table names to create middleware for
 * @returns Object with middleware functions keyed by table name
 * 
 * @example
 * ```typescript
 * const middlewares = createMultipleSyncMiddlewares(syncEngine, ['todos', 'users', 'projects']);
 * 
 * const useTodoStore = create(middlewares.todos((set, get) => ({ todos: [] })));
 * const useUserStore = create(middlewares.users((set, get) => ({ users: [] })));
 * ```
 */
export function createMultipleSyncMiddlewares<T extends Record<string, any>>(
  syncEngine: ZustandSurrealSyncEngine | SyncEngineAPI,
  tableNames: string[]
): Record<string, SyncMiddleware<T>> {
  return Object.fromEntries(
    tableNames.map(tableName => [
      tableName,
      createSyncMiddleware<T>(syncEngine, tableName)
    ])
  );
}

/**
 * Create a typed sync middleware with better TypeScript inference
 * 
 * @param syncEngine - The sync engine instance
 * @param tableName - Name of the database table to sync with
 * @returns Typed middleware function
 * 
 * @example
 * ```typescript
 * interface TodoState {
 *   todos: Todo[];
 *   addTodo: (text: string) => void;
 * }
 * 
 * const todoMiddleware = createTypedSyncMiddleware<TodoState>(syncEngine, 'todos');
 * ```
 */
export function createTypedSyncMiddleware<T extends Record<string, any>>(
  syncEngine: ZustandSurrealSyncEngine | SyncEngineAPI,
  tableName: string
): SyncMiddleware<T> {
  return createSyncMiddleware<T>(syncEngine, tableName);
}