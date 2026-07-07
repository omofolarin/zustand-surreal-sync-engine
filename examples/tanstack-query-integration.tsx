/**
 * TanStack Query Integration Example
 * 
 * This example demonstrates how to integrate TanStack Query with the sync engine
 * to work with both real-time sync (SurrealDB) and traditional REST endpoints.
 */

import { create } from 'zustand';
import { QueryClient, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SyncEngineAPI, ConfigBuilder } from '../src';
import type { SyncConfig } from '../src/types';

// Types for our application
interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Date;
  updatedAt?: Date;
  userId: string;
  // Sync metadata
  lastModified?: number;
  version?: number;
  source?: 'zustand' | 'surrealdb' | 'api';
}

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  // API-only fields
  preferences?: {
    theme: 'light' | 'dark';
    notifications: boolean;
  };
  subscription?: {
    plan: 'free' | 'pro' | 'enterprise';
    expiresAt: Date;
  };
}

interface TodoState {
  todos: Todo[];
  addTodo: (todo: Omit<Todo, 'id' | 'createdAt'>) => void;
  updateTodo: (id: string, updates: Partial<Todo>) => void;
  deleteTodo: (id: string) => void;
  toggleTodo: (id: string) => void;
}

// API client for REST endpoints
class ApiClient {
  private baseUrl = 'https://api.example.com';

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${this.getToken()}` }
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return response.json();
  }

  async post<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return response.json();
  }

  async put<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return response.json();
  }

  async delete(endpoint: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.getToken()}` }
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
  }

  private getToken(): string {
    return localStorage.getItem('auth_token') || '';
  }
}

const apiClient = new ApiClient();

// Enhanced sync middleware that integrates with TanStack Query
function createHybridSyncMiddleware<T>(
  syncEngine: SyncEngineAPI,
  queryClient: QueryClient,
  tableName: string
) {
  return (config: any) => (set: any, get: any, api: any) => {
    // Get the original sync middleware
    const syncMiddleware = syncEngine.createMiddleware(tableName);
    const wrappedConfig = syncMiddleware(config);

    // Enhance with TanStack Query integration
    const enhancedSet = (partial: any, replace?: boolean) => {
      // Call original set
      set(partial, replace);

      // If this is a user-initiated change (not from sync), invalidate related queries
      if (!replace) {
        queryClient.invalidateQueries({ 
          queryKey: [tableName],
          exact: false 
        });
      }
    };

    return wrappedConfig(enhancedSet, get, api);
  };
}

// Setup sync engine configuration
const syncConfig: SyncConfig = {
  dbName: 'hybrid-app',
  namespace: 'production',
  database: 'main',
  tables: {
    todos: {
      zustandPath: 'todos',
      primaryKey: 'id',
      schema: {
        fields: {
          id: { type: 'string' },
          text: { type: 'string', constraints: { nullable: false } },
          completed: { type: 'bool', constraints: { default: false } },
          createdAt: { type: 'datetime' },
          updatedAt: { type: 'datetime' },
          userId: { type: 'string', constraints: { nullable: false } }
        },
        indexes: [
          { name: 'user_todos_idx', fields: ['userId'] },
          { name: 'completed_idx', fields: ['completed'] }
        ]
      },
      syncEnabled: true
    }
  },
  syncInterval: 2000,
  retryAttempts: 3
};

// Initialize TanStack Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000,   // 10 minutes
      retry: 3,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    }
  }
});

// Initialize sync engine
let syncEngine: SyncEngineAPI;

async function initializeHybridSystem() {
  syncEngine = await SyncEngineAPI.create(syncConfig);
  
  // Set up sync engine event listeners to invalidate queries
  syncEngine.on('sync-complete', () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  });

  syncEngine.on('change-synced', (event, data) => {
    // Invalidate specific queries when changes are synced
    queryClient.invalidateQueries({ 
      queryKey: ['todos', data.change.id] 
    });
  });

  await syncEngine.loadInitialData('todos');
}

// Create Zustand store with hybrid middleware
const useTodoStore = create<TodoState>()(
  createHybridSyncMiddleware(syncEngine, queryClient, 'todos')((set, get) => ({
    todos: [],

    addTodo: (todo) => {
      const newTodo: Todo = {
        ...todo,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        source: 'zustand'
      };

      set(state => ({
        todos: [...state.todos, newTodo]
      }));

      // Optimistically update TanStack Query cache
      queryClient.setQueryData(['todos'], (old: Todo[] = []) => [...old, newTodo]);
    },

    updateTodo: (id, updates) => {
      set(state => ({
        todos: state.todos.map(todo =>
          todo.id === id 
            ? { ...todo, ...updates, updatedAt: new Date(), source: 'zustand' }
            : todo
        )
      }));

      // Update TanStack Query cache
      queryClient.setQueryData(['todos'], (old: Todo[] = []) =>
        old.map(todo => todo.id === id ? { ...todo, ...updates } : todo)
      );
    },

    deleteTodo: (id) => {
      set(state => ({
        todos: state.todos.filter(todo => todo.id !== id)
      }));

      // Update TanStack Query cache
      queryClient.setQueryData(['todos'], (old: Todo[] = []) =>
        old.filter(todo => todo.id !== id)
      );
    },

    toggleTodo: (id) => {
      const todo = get().todos.find(t => t.id === id);
      if (todo) {
        get().updateTodo(id, { completed: !todo.completed });
      }
    }
  }))
);

// TanStack Query hooks for API endpoints
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get<User[]>('/users'),
    staleTime: 10 * 60 * 1000, // 10 minutes for user data
  });
}

export function useUser(userId: string) {
  return useQuery({
    queryKey: ['users', userId],
    queryFn: () => apiClient.get<User>(`/users/${userId}`),
    enabled: !!userId,
  });
}

export function useUserPreferences(userId: string) {
  return useQuery({
    queryKey: ['users', userId, 'preferences'],
    queryFn: () => apiClient.get<User['preferences']>(`/users/${userId}/preferences`),
    enabled: !!userId,
  });
}

// Mutations for API endpoints
export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, preferences }: { userId: string; preferences: User['preferences'] }) =>
      apiClient.put(`/users/${userId}/preferences`, preferences),
    
    onMutate: async ({ userId, preferences }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['users', userId, 'preferences'] });

      // Snapshot previous value
      const previousPreferences = queryClient.getQueryData(['users', userId, 'preferences']);

      // Optimistically update
      queryClient.setQueryData(['users', userId, 'preferences'], preferences);

      return { previousPreferences };
    },

    onError: (err, { userId }, context) => {
      // Rollback on error
      if (context?.previousPreferences) {
        queryClient.setQueryData(['users', userId, 'preferences'], context.previousPreferences);
      }
    },

    onSettled: (data, error, { userId }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['users', userId, 'preferences'] });
    },
  });
}

// Hybrid query that combines sync engine data with API data
export function useTodosWithUserData() {
  const todos = useTodoStore(state => state.todos);
  
  // Get unique user IDs from todos
  const userIds = [...new Set(todos.map(todo => todo.userId))];
  
  // Fetch user data for all users mentioned in todos
  const usersQuery = useQuery({
    queryKey: ['users', 'batch', userIds],
    queryFn: () => Promise.all(
      userIds.map(id => apiClient.get<User>(`/users/${id}`))
    ),
    enabled: userIds.length > 0,
  });

  // Combine todos with user data
  const todosWithUsers = todos.map(todo => ({
    ...todo,
    user: usersQuery.data?.find(user => user.id === todo.userId)
  }));

  return {
    todos: todosWithUsers,
    isLoading: usersQuery.isLoading,
    error: usersQuery.error,
  };
}

// Advanced: Server-side filtering with local sync
export function useFilteredTodos(filters: { completed?: boolean; userId?: string; search?: string }) {
  const localTodos = useTodoStore(state => state.todos);
  
  // Server-side filtered query for complex searches
  const serverQuery = useQuery({
    queryKey: ['todos', 'filtered', filters],
    queryFn: () => apiClient.get<Todo[]>(`/todos/search?${new URLSearchParams(filters as any)}`),
    enabled: !!filters.search, // Only use server search for text queries
    staleTime: 30 * 1000, // 30 seconds for search results
  });

  // Use server data if searching, otherwise use local synced data
  const todos = filters.search ? serverQuery.data || [] : localTodos;

  // Apply local filters
  const filteredTodos = todos.filter(todo => {
    if (filters.completed !== undefined && todo.completed !== filters.completed) return false;
    if (filters.userId && todo.userId !== filters.userId) return false;
    return true;
  });

  return {
    todos: filteredTodos,
    isLoading: filters.search ? serverQuery.isLoading : false,
    error: serverQuery.error,
  };
}

// Background sync with API endpoints
export function useBackgroundSync() {
  const queryClient = useQueryClient();

  // Sync user data periodically
  useQuery({
    queryKey: ['background-sync', 'users'],
    queryFn: async () => {
      const users = await apiClient.get<User[]>('/users');
      
      // Update individual user caches
      users.forEach(user => {
        queryClient.setQueryData(['users', user.id], user);
      });
      
      return users;
    },
    refetchInterval: 5 * 60 * 1000, // Every 5 minutes
    refetchIntervalInBackground: true,
  });

  // Sync analytics data
  useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => apiClient.get('/analytics/dashboard'),
    refetchInterval: 60 * 1000, // Every minute
    refetchIntervalInBackground: true,
  });
}

// Example React component showing the hybrid workflow
export function TodoApp() {
  const { todos, addTodo, updateTodo, deleteTodo } = useTodoStore();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { todos: todosWithUsers } = useTodosWithUserData();
  const updatePreferences = useUpdateUserPreferences();

  // Use background sync
  useBackgroundSync();

  const handleAddTodo = (text: string) => {
    addTodo({
      text,
      completed: false,
      userId: 'current-user-id' // Would come from auth context
    });
  };

  const handleUpdatePreferences = (preferences: User['preferences']) => {
    updatePreferences.mutate({
      userId: 'current-user-id',
      preferences
    });
  };

  return (
    <div>
      <h1>Hybrid Todo App</h1>
      
      {/* Real-time synced todos */}
      <section>
        <h2>Todos (Real-time Sync)</h2>
        {todosWithUsers.map(todo => (
          <div key={todo.id}>
            <span>{todo.text}</span>
            <span>by {todo.user?.name || 'Unknown'}</span>
            <button onClick={() => updateTodo(todo.id, { completed: !todo.completed })}>
              {todo.completed ? 'Undo' : 'Complete'}
            </button>
          </div>
        ))}
      </section>

      {/* API-fetched user data */}
      <section>
        <h2>Users (API)</h2>
        {usersLoading ? (
          <div>Loading users...</div>
        ) : (
          users?.map(user => (
            <div key={user.id}>
              {user.name} - {user.email}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

// Workflow demonstration
export async function demonstrateHybridWorkflow() {
  console.log('🚀 Starting Hybrid Sync + TanStack Query Workflow Demo\n');

  try {
    // 1. Initialize the hybrid system
    await initializeHybridSystem();
    console.log('✅ Hybrid system initialized');

    // 2. Add some todos (will sync to SurrealDB)
    const { addTodo, todos } = useTodoStore.getState();
    
    addTodo({
      text: 'Learn hybrid sync patterns',
      completed: false,
      userId: 'user-1'
    });

    addTodo({
      text: 'Implement TanStack Query integration',
      completed: false,
      userId: 'user-2'
    });

    console.log('✅ Added todos to sync engine');

    // 3. Fetch user data from API (cached by TanStack Query)
    const users = await queryClient.fetchQuery({
      queryKey: ['users'],
      queryFn: () => apiClient.get<User[]>('/users')
    });

    console.log(`✅ Fetched ${users.length} users from API`);

    // 4. Demonstrate optimistic updates
    const updatePreferences = async (userId: string, preferences: User['preferences']) => {
      try {
        await queryClient.fetchQuery({
          queryKey: ['update-preferences'],
          queryFn: () => apiClient.put(`/users/${userId}/preferences`, preferences)
        });
        console.log('✅ Updated user preferences optimistically');
      } catch (error) {
        console.log('❌ Preferences update failed, rolled back');
      }
    };

    await updatePreferences('user-1', { theme: 'dark', notifications: true });

    // 5. Show current state
    console.log('\n📊 Current State:');
    console.log('Todos (synced):', useTodoStore.getState().todos.length);
    console.log('Users (cached):', queryClient.getQueryData(['users']));
    console.log('Sync status:', syncEngine.getSyncStatus());

    // 6. Demonstrate background sync
    console.log('\n🔄 Background sync will continue...');
    
  } catch (error) {
    console.error('❌ Workflow demo failed:', error);
  }
}

export {
  initializeHybridSystem,
  useTodoStore,
  queryClient,
  syncEngine,
  apiClient
};