/**
 * Workflow Patterns: TanStack Query + Sync Engine
 * 
 * This file demonstrates specific workflow patterns and best practices
 * for combining TanStack Query with the sync engine.
 */

import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { syncEngine, useTodoStore } from './tanstack-query-integration';
import { useEffect, useState } from 'react';
import { Todo } from '../src/types';

// ============================================================================
// PATTERN 1: Real-time Sync + API Enrichment
// ============================================================================

/**
 * Workflow: Local todos sync in real-time, but user profiles come from API
 */
export function useEnrichedTodos() {
  // Step 1: Get real-time synced todos from Zustand store
  const todos = useTodoStore(state => state.todos);
  
  // Step 2: Extract unique user IDs
  const userIds = [...new Set(todos.map(todo => todo.userId))];
  
  // Step 3: Fetch user profiles from API (with caching)
  const { data: userProfiles } = useQuery({
    queryKey: ['user-profiles', userIds],
    queryFn: async () => {
      // Batch fetch user profiles
      const profiles = await Promise.all(
        userIds.map(id => 
          fetch(`/api/users/${id}/profile`).then(r => r.json())
        )
      );
      return profiles;
    },
    enabled: userIds.length > 0,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  });

  // Step 4: Combine real-time data with API data
  const enrichedTodos = todos.map(todo => ({
    ...todo,
    userProfile: userProfiles?.find(profile => profile.id === todo.userId)
  }));

  return { todos: enrichedTodos, isLoading: !userProfiles && userIds.length > 0 };
}

// ============================================================================
// PATTERN 2: Optimistic Updates with Fallback Sync
// ============================================================================

/**
 * Workflow: Immediate UI updates, with server validation and sync fallback
 */
export function useOptimisticTodoMutations() {
  const queryClient = useQueryClient();
  const { updateTodo } = useTodoStore();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Todo> }) => {
      // Try server update first
      const response = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error('Server update failed');
      }

      return response.json();
    },

    onMutate: async ({ id, updates }) => {
      // Step 1: Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['todos'] });

      // Step 2: Optimistically update Zustand store (will sync to SurrealDB)
      updateTodo(id, updates);

      // Step 3: Snapshot previous state for rollback
      const previousTodos = useTodoStore.getState().todos;
      return { previousTodos };
    },

    onError: (error, { id }, context) => {
      console.log('Server update failed, relying on sync engine for eventual consistency');
      
      // Don't rollback - let sync engine handle conflict resolution
      // The sync engine will eventually reconcile with the server state
    },

    onSuccess: (serverData, { id }) => {
      // Server update succeeded - update local state to match server
      updateTodo(id, serverData);
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['todos', id] });
    }
  });
}

// ============================================================================
// PATTERN 3: Infinite Queries with Local Sync
// ============================================================================

/**
 * Workflow: Infinite scroll for historical data + real-time updates for recent items
 */
export function useInfiniteTodosWithSync() {
  const recentTodos = useTodoStore(state => 
    state.todos.filter(todo => 
      Date.now() - new Date(todo.createdAt).getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
    )
  );

  // Infinite query for historical todos
  const infiniteQuery = useInfiniteQuery({
    queryKey: ['todos', 'infinite'],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await fetch(`/api/todos?page=${pageParam}&limit=20&before=${Date.now() - 24 * 60 * 60 * 1000}`);
      return response.json();
    },
    getNextPageParam: (lastPage, pages) => {
      return lastPage.hasMore ? pages.length : undefined;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Combine recent (real-time) with historical (paginated)
  const allTodos = [
    ...recentTodos,
    ...(infiniteQuery.data?.pages.flatMap(page => page.todos) || [])
  ];

  return {
    todos: allTodos,
    fetchNextPage: infiniteQuery.fetchNextPage,
    hasNextPage: infiniteQuery.hasNextPage,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
  };
}

// ============================================================================
// PATTERN 4: Conditional Sync Strategies
// ============================================================================

/**
 * Workflow: Different sync strategies based on data type and user context
 */
export function useConditionalSync(userId: string) {
  const queryClient = useQueryClient();

  // Strategy 1: Real-time sync for user's own todos
  const userTodos = useTodoStore(state => 
    state.todos.filter(todo => todo.userId === userId)
  );

  // Strategy 2: Polling for shared/collaborative todos
  const { data: sharedTodos } = useQuery({
    queryKey: ['todos', 'shared', userId],
    queryFn: () => fetch(`/api/todos/shared/${userId}`).then(r => r.json()),
    refetchInterval: 5000, // Poll every 5 seconds
    refetchIntervalInBackground: true,
  });

  // Strategy 3: On-demand fetch for archived todos
  const fetchArchivedTodos = async () => {
    return queryClient.fetchQuery({
      queryKey: ['todos', 'archived', userId],
      queryFn: () => fetch(`/api/todos/archived/${userId}`).then(r => r.json()),
      staleTime: 30 * 60 * 1000, // Cache for 30 minutes
    });
  };

  return {
    userTodos,        // Real-time synced
    sharedTodos,      // Polled
    fetchArchivedTodos // On-demand
  };
}

// ============================================================================
// PATTERN 5: Cross-Tab Synchronization
// ============================================================================

/**
 * Workflow: Sync state across browser tabs using BroadcastChannel + TanStack Query
 */
export function useCrossTabSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = new BroadcastChannel('todo-sync');

    // Listen for updates from other tabs
    channel.addEventListener('message', (event) => {
      const { type, data } = event.data;

      switch (type) {
        case 'TODO_UPDATED':
          // Update TanStack Query cache
          queryClient.setQueryData(['todos'], (old: Todo[] = []) =>
            old.map(todo => todo.id === data.id ? { ...todo, ...data.updates } : todo)
          );
          
          // Update Zustand store (will trigger sync)
          useTodoStore.getState().updateTodo(data.id, data.updates);
          break;

        case 'INVALIDATE_CACHE':
          queryClient.invalidateQueries({ queryKey: data.queryKey });
          break;
      }
    });

    // Broadcast local changes to other tabs
    const unsubscribe = useTodoStore.subscribe((state, prevState) => {
      if (state.todos !== prevState.todos) {
        channel.postMessage({
          type: 'TODOS_CHANGED',
          data: { todos: state.todos }
        });
      }
    });

    return () => {
      channel.close();
      unsubscribe();
    };
  }, [queryClient]);
}

// ============================================================================
// PATTERN 6: Smart Background Sync
// ============================================================================

/**
 * Workflow: Intelligent background sync based on user activity and network status
 */
export function useSmartBackgroundSync() {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleFocus = () => setIsActive(true);
    const handleBlur = () => setIsActive(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Aggressive sync when online and active
  useQuery({
    queryKey: ['background-sync', 'aggressive'],
    queryFn: () => fetch('/api/sync/full').then(r => r.json()),
    enabled: isOnline && isActive,
    refetchInterval: 30 * 1000, // Every 30 seconds when active
    refetchIntervalInBackground: false,
  });

  // Conservative sync when online but inactive
  useQuery({
    queryKey: ['background-sync', 'conservative'],
    queryFn: () => fetch('/api/sync/minimal').then(r => r.json()),
    enabled: isOnline && !isActive,
    refetchInterval: 5 * 60 * 1000, // Every 5 minutes when inactive
    refetchIntervalInBackground: true,
  });

  // Offline queue processing when coming back online
  useEffect(() => {
    if (isOnline) {
      // Process any queued mutations
      queryClient.resumePausedMutations();
      
      // Invalidate all queries to refresh data
      queryClient.invalidateQueries();
    }
  }, [isOnline, queryClient]);
}

// ============================================================================
// PATTERN 7: Conflict Resolution with User Choice
// ============================================================================

/**
 * Workflow: Handle conflicts by presenting options to the user
 */
export function useConflictResolution() {
  const [conflicts, setConflicts] = useState<Array<{
    id: string;
    localVersion: Todo;
    serverVersion: Todo;
    field: string;
  }>>([]);

  // Listen for conflicts from sync engine
  useEffect(() => {
    const handleConflict = (event: any, data: any) => {
      setConflicts(prev => [...prev, {
        id: data.recordId,
        localVersion: data.localData,
        serverVersion: data.serverData,
        field: data.conflictField
      }]);
    };

    syncEngine.on('conflict-detected', handleConflict);
    return () => syncEngine.off('conflict-detected', handleConflict);
  }, []);

  const resolveConflict = useMutation({
    mutationFn: async ({ conflictId, resolution }: { 
      conflictId: string; 
      resolution: 'local' | 'server' | 'merge' 
    }) => {
      const conflict = conflicts.find(c => c.id === conflictId);
      if (!conflict) throw new Error('Conflict not found');

      let resolvedData: Todo;
      switch (resolution) {
        case 'local':
          resolvedData = conflict.localVersion;
          break;
        case 'server':
          resolvedData = conflict.serverVersion;
          break;
        case 'merge':
          resolvedData = { ...conflict.serverVersion, ...conflict.localVersion };
          break;
      }

      // Apply resolution
      useTodoStore.getState().updateTodo(conflictId, resolvedData);
      
      // Remove from conflicts
      setConflicts(prev => prev.filter(c => c.id !== conflictId));

      return resolvedData;
    }
  });

  return {
    conflicts,
    resolveConflict: resolveConflict.mutate,
    isResolving: resolveConflict.isPending
  };
}

// ============================================================================
// PATTERN 8: Performance Monitoring and Analytics
// ============================================================================

/**
 * Workflow: Monitor performance and sync health
 */
export function useSyncAnalytics() {
  const queryClient = useQueryClient();

  // Monitor query cache performance
  const cacheMetrics = useQuery({
    queryKey: ['analytics', 'cache'],
    queryFn: () => {
      const cache = queryClient.getQueryCache();
      const queries = cache.getAll();
      
      return {
        totalQueries: queries.length,
        staleQueries: queries.filter(q => q.isStale()).length,
        errorQueries: queries.filter(q => q.state.status === 'error').length,
        cacheSize: JSON.stringify(cache).length,
      };
    },
    refetchInterval: 10 * 1000, // Every 10 seconds
  });

  // Monitor sync engine performance
  const syncMetrics = useQuery({
    queryKey: ['analytics', 'sync'],
    queryFn: () => syncEngine.getMetrics(),
    refetchInterval: 5 * 1000, // Every 5 seconds
  });

  // Send analytics to server
  const reportAnalytics = useMutation({
    mutationFn: (metrics: any) => 
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metrics)
      }),
  });

  // Auto-report every minute
  useEffect(() => {
    const interval = setInterval(() => {
      if (cacheMetrics.data && syncMetrics.data) {
        reportAnalytics.mutate({
          cache: cacheMetrics.data,
          sync: syncMetrics.data,
          timestamp: Date.now()
        });
      }
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [cacheMetrics.data, syncMetrics.data]);

  return {
    cacheMetrics: cacheMetrics.data,
    syncMetrics: syncMetrics.data,
    isHealthy: syncMetrics.data?.errorRate < 5, // Less than 5% error rate
  };
}

// ============================================================================
// USAGE EXAMPLE: Complete Workflow
// ============================================================================

export function CompleteTodoWorkflow() {
  // Real-time synced todos with API-enriched user data
  const { todos, isLoading } = useEnrichedTodos();
  
  // Optimistic mutations with server validation
  const updateTodo = useOptimisticTodoMutations();
  
  // Infinite scroll for historical data
  const { fetchNextPage, hasNextPage } = useInfiniteTodosWithSync();
  
  // Conflict resolution
  const { conflicts, resolveConflict } = useConflictResolution();
  
  // Performance monitoring
  const { isHealthy } = useSyncAnalytics();
  
  // Cross-tab sync
  useCrossTabSync();
  
  // Smart background sync
  useSmartBackgroundSync();

  return (
    <div>
      <div>Health Status: {isHealthy ? '🟢' : '🔴'}</div>
      
      {conflicts.length > 0 && (
        <div>
          <h3>Conflicts to Resolve:</h3>
          {conflicts.map(conflict => (
            <div key={conflict.id}>
              <button onClick={() => resolveConflict({ conflictId: conflict.id, resolution: 'local' })}>
                Use Local
              </button>
              <button onClick={() => resolveConflict({ conflictId: conflict.id, resolution: 'server' })}>
                Use Server
              </button>
            </div>
          ))}
        </div>
      )}
      
      <div>
        {todos.map(todo => (
          <div key={todo.id}>
            <span>{todo.text}</span>
            <span>by {todo.userProfile?.name}</span>
            <button onClick={() => updateTodo.mutate({ 
              id: todo.id, 
              updates: { completed: !todo.completed } 
            })}>
              Toggle
            </button>
          </div>
        ))}
      </div>
      
      {hasNextPage && (
        <button onClick={() => fetchNextPage()}>
          Load More
        </button>
      )}
    </div>
  );
}