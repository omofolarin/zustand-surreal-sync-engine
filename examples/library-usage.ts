/**
 * Comprehensive example demonstrating the refactored sync engine library
 * 
 * This example shows how to use the clean public API interfaces,
 * database adapter abstraction, and configuration system.
 */

import { create } from 'zustand';
import { 
  SyncEngineAPI, 
  SyncEngineFactory, 
  SyncEngineUtils,
  ConfigBuilder,
  createSyncMiddleware,
  createMultipleSyncMiddlewares
} from '../src';
import type { 
  SyncConfig, 
  SyncEngineConfig,
  SyncEngineEvent,
  SyncStatus 
} from '../src';

// Define your data types
interface Todo {
  id?: string;
  text: string;
  completed: boolean;
  createdAt: Date;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
}

interface User {
  id?: string;
  name: string;
  email: string;
  avatar?: string;
  lastActive: Date;
}

interface TodoState {
  todos: Todo[];
  addTodo: (todo: Omit<Todo, 'id' | 'createdAt'>) => void;
  updateTodo: (id: string, updates: Partial<Todo>) => void;
  deleteTodo: (id: string) => void;
  toggleTodo: (id: string) => void;
}

interface UserState {
  users: User[];
  currentUser: User | null;
  setCurrentUser: (user: User) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
}

// Example 1: Basic Usage with SyncEngineAPI
async function basicUsageExample() {
  console.log('=== Basic Usage Example ===');

  // Create configuration using ConfigBuilder
  const config = ConfigBuilder.create()
    .database('todo-app', 'production', 'main')
    .syncInterval(2000)
    .retryAttempts(3)
    .conflictResolution('last-write-wins')
    .table('todos', {
      zustandPath: 'todos',
      primaryKey: 'id',
      schema: {
        fields: {
          id: { type: 'string' },
          text: { type: 'string', constraints: { nullable: false } },
          completed: { type: 'bool', constraints: { default: false } },
          createdAt: { type: 'datetime', constraints: { default: 'time::now()' } },
          priority: { type: 'string', constraints: { default: 'medium' } },
          tags: { type: 'array<string>', constraints: { default: '[]' } }
        },
        indexes: [
          { name: 'priority_idx', fields: ['priority'] },
          { name: 'completed_idx', fields: ['completed'] }
        ]
      },
      syncEnabled: true
    })
    .build();

  // Create sync engine
  const syncEngine = await SyncEngineAPI.create(config);

  // Add event listeners
  syncEngine.on('sync-start', (event, data) => {
    console.log('Sync started:', data);
  });

  syncEngine.on('sync-complete', (event, data) => {
    console.log('Sync completed:', data);
  });

  syncEngine.on('sync-error', (event, data) => {
    console.error('Sync error:', data);
  });

  // Create Zustand store with sync middleware
  const todoMiddleware = createSyncMiddleware<TodoState>(syncEngine, 'todos');
  
  const useTodoStore = create(todoMiddleware((set, get) => ({
    todos: [],
    
    addTodo: (todo) => set(state => ({
      todos: [...state.todos, {
        ...todo,
        id: crypto.randomUUID(),
        createdAt: new Date()
      }]
    })),
    
    updateTodo: (id, updates) => set(state => ({
      todos: state.todos.map(todo => 
        todo.id === id ? { ...todo, ...updates } : todo
      )
    })),
    
    deleteTodo: (id) => set(state => ({
      todos: state.todos.filter(todo => todo.id !== id)
    })),
    
    toggleTodo: (id) => set(state => ({
      todos: state.todos.map(todo =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    }))
  })));

  // Load initial data
  await syncEngine.loadInitialData('todos');

  // Use the store
  const { addTodo, toggleTodo, todos } = useTodoStore.getState();
  
  addTodo({
    text: 'Learn sync engine library',
    completed: false,
    priority: 'high',
    tags: ['learning', 'development']
  });

  console.log('Current todos:', todos);

  // Get sync status
  const status = syncEngine.getSyncStatus();
  console.log('Sync status:', status);

  // Get metrics
  const metrics = syncEngine.getMetrics();
  console.log('Sync metrics:', metrics);

  // Cleanup
  await syncEngine.shutdown();
}

// Example 2: Factory Methods for Different Use Cases
async function factoryMethodsExample() {
  console.log('=== Factory Methods Example ===');

  // Create basic sync engine for simple use cases
  const basicEngine = await SyncEngineFactory.createBasic({
    dbName: 'simple-app',
    namespace: 'dev',
    database: 'test',
    tables: {
      items: {
        zustandPath: 'items',
        primaryKey: 'id',
        schema: { fields: { id: { type: 'string' }, name: { type: 'string' } } }
      }
    },
    syncInterval: 1000
  });

  console.log('Basic engine ready:', basicEngine.isReady());

  // Create offline-first sync engine
  const offlineEngine = await SyncEngineFactory.createOfflineFirst({
    dbName: 'offline-app',
    namespace: 'prod',
    database: 'main',
    tables: {
      documents: {
        zustandPath: 'documents',
        primaryKey: 'id',
        schema: { fields: { id: { type: 'string' }, content: { type: 'string' } } }
      }
    }
  });

  console.log('Offline engine ready:', offlineEngine.isReady());

  // Create high-performance sync engine
  const perfEngine = await SyncEngineFactory.createHighPerformance({
    dbName: 'perf-app',
    namespace: 'prod',
    database: 'main',
    tables: {
      analytics: {
        zustandPath: 'events',
        primaryKey: 'id',
        schema: { fields: { id: { type: 'string' }, event: { type: 'string' } } }
      }
    }
  });

  console.log('Performance engine ready:', perfEngine.isReady());

  // Cleanup
  await Promise.all([
    basicEngine.shutdown(),
    offlineEngine.shutdown(),
    perfEngine.shutdown()
  ]);
}

// Example 3: Multiple Tables and Advanced Configuration
async function multiTableExample() {
  console.log('=== Multi-Table Example ===');

  // Create configuration for multiple tables
  const config = ConfigBuilder.create()
    .database('multi-app', 'prod', 'main')
    .syncInterval(1500)
    .retryAttempts(5)
    .table('todos', SyncEngineUtils.createTableConfig({
      zustandPath: 'todos',
      primaryKey: 'id',
      fields: {
        id: { type: 'string' },
        text: { type: 'string', nullable: false },
        completed: { type: 'bool', default: false },
        userId: { type: 'string', nullable: false }
      },
      indexes: [
        { name: 'user_todos_idx', fields: ['userId'] }
      ]
    }))
    .table('users', SyncEngineUtils.createTableConfig({
      zustandPath: 'users',
      primaryKey: 'id',
      fields: {
        id: { type: 'string' },
        name: { type: 'string', nullable: false },
        email: { type: 'string', unique: true },
        avatar: { type: 'string', nullable: true },
        lastActive: { type: 'datetime', default: 'time::now()' }
      },
      indexes: [
        { name: 'email_idx', fields: ['email'], unique: true }
      ]
    }))
    .build();

  // Create sync engine with custom configuration
  const engineConfig: SyncEngineConfig = {
    syncInterval: 1500,
    retryAttempts: 5,
    batchSize: 50,
    enableLogging: true,
    operationTimeout: 8000
  };

  const syncEngine = await SyncEngineAPI.create(config, engineConfig);

  // Create multiple middlewares
  const middlewares = createMultipleSyncMiddlewares<any>(syncEngine, ['todos', 'users']);

  // Create stores
  const useTodoStore = create(middlewares.todos((set, get) => ({
    todos: [],
    addTodo: (todo: Omit<Todo, 'id' | 'createdAt'>) => set(state => ({
      todos: [...state.todos, { ...todo, id: crypto.randomUUID(), createdAt: new Date() }]
    })),
    updateTodo: (id: string, updates: Partial<Todo>) => set(state => ({
      todos: state.todos.map(todo => todo.id === id ? { ...todo, ...updates } : todo)
    })),
    deleteTodo: (id: string) => set(state => ({
      todos: state.todos.filter(todo => todo.id !== id)
    })),
    toggleTodo: (id: string) => set(state => ({
      todos: state.todos.map(todo => todo.id === id ? { ...todo, completed: !todo.completed } : todo)
    }))
  })));

  const useUserStore = create(middlewares.users((set, get) => ({
    users: [],
    currentUser: null,
    setCurrentUser: (user: User) => set({ currentUser: user }),
    updateUser: (id: string, updates: Partial<User>) => set(state => ({
      users: state.users.map(user => user.id === id ? { ...user, ...updates } : user)
    }))
  })));

  // Load initial data for both tables
  await Promise.all([
    syncEngine.loadInitialData('todos'),
    syncEngine.loadInitialData('users')
  ]);

  // Use the stores
  const { addTodo } = useTodoStore.getState();
  const { setCurrentUser } = useUserStore.getState();

  const user: User = {
    id: crypto.randomUUID(),
    name: 'John Doe',
    email: 'john@example.com',
    lastActive: new Date()
  };

  setCurrentUser(user);

  addTodo({
    text: 'Multi-table sync example',
    completed: false,
    priority: 'medium',
    tags: ['example']
  });

  // Monitor sync status
  const status = syncEngine.getSyncStatus();
  console.log('Multi-table sync status:', status);

  // Cleanup
  await syncEngine.shutdown();
}

// Example 4: Configuration Utilities and Validation
async function configurationExample() {
  console.log('=== Configuration Example ===');

  // Create table configurations using utilities
  const todoTableConfig = SyncEngineUtils.createTableConfig({
    zustandPath: 'todos',
    primaryKey: 'id',
    fields: {
      id: { type: 'string' },
      text: { type: 'string', nullable: false, assert: 'string::len($value) > 0' },
      completed: { type: 'bool', default: false },
      priority: { type: 'string', default: 'medium' }
    },
    indexes: [
      { name: 'priority_idx', fields: ['priority'] }
    ]
  });

  // Validate configuration before using
  const testConfig = SyncEngineUtils.createTestConfig('todos', 'todos');
  const validation = SyncEngineUtils.validateConfig(testConfig);
  
  console.log('Configuration validation:', validation);

  if (validation.valid) {
    console.log('Configuration is valid!');
  } else {
    console.error('Configuration errors:', validation.errors);
  }

  // Merge configurations
  const baseConfig = ConfigBuilder.create()
    .database('app', 'prod', 'main')
    .syncInterval(2000)
    .build();

  const additionalConfig: Partial<SyncConfig> = {
    retryAttempts: 5,
    tables: {
      todos: todoTableConfig
    }
  };

  const mergedConfig = SyncEngineUtils.mergeConfigs(baseConfig, additionalConfig);
  console.log('Merged configuration:', {
    dbName: mergedConfig.dbName,
    syncInterval: mergedConfig.syncInterval,
    retryAttempts: mergedConfig.retryAttempts,
    tableCount: Object.keys(mergedConfig.tables).length
  });

  // Extract information from configuration
  const tableNames = SyncEngineUtils.getTableNames(mergedConfig);
  const hasEnabledTables = SyncEngineUtils.hasEnabledTables(mergedConfig);
  const enabledTables = SyncEngineUtils.getEnabledTables(mergedConfig);

  console.log('Configuration analysis:', {
    tableNames,
    hasEnabledTables,
    enabledTableCount: Object.keys(enabledTables).length
  });
}

// Example 5: Error Handling and Health Monitoring
async function errorHandlingExample() {
  console.log('=== Error Handling Example ===');

  try {
    const config = SyncEngineUtils.createTestConfig('test', 'test');
    const syncEngine = await SyncEngineAPI.create(config);

    // Set up comprehensive event monitoring
    const events: SyncEngineEvent[] = [
      'sync-start', 'sync-complete', 'sync-error',
      'connection-lost', 'connection-restored',
      'conflict-detected', 'change-queued', 'change-synced'
    ];

    events.forEach(event => {
      syncEngine.on(event, (eventType, data) => {
        console.log(`Event [${eventType}]:`, data);
      });
    });

    // Perform health check
    const isHealthy = await syncEngine.healthCheck();
    console.log('Database health check:', isHealthy);

    // Monitor metrics over time
    const initialMetrics = syncEngine.getMetrics();
    console.log('Initial metrics:', initialMetrics);

    // Simulate some operations
    const middleware = createSyncMiddleware(syncEngine, 'test');
    const useTestStore = create(middleware((set) => ({
      items: [],
      addItem: (item: any) => set(state => ({ items: [...state.items, item] }))
    })));

    const { addItem } = useTestStore.getState();
    addItem({ id: '1', name: 'Test Item' });

    // Wait a bit for sync to process
    await new Promise(resolve => setTimeout(resolve, 1000));

    const finalMetrics = syncEngine.getMetrics();
    console.log('Final metrics:', finalMetrics);

    // Get final status
    const finalStatus = syncEngine.getSyncStatus();
    console.log('Final sync status:', finalStatus);

    await syncEngine.shutdown();

  } catch (error) {
    console.error('Error in example:', error);
  }
}

// Run all examples
async function runAllExamples() {
  try {
    await basicUsageExample();
    await factoryMethodsExample();
    await multiTableExample();
    await configurationExample();
    await errorHandlingExample();
    
    console.log('\n=== All Examples Completed Successfully! ===');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Export for use in other files
export {
  basicUsageExample,
  factoryMethodsExample,
  multiTableExample,
  configurationExample,
  errorHandlingExample,
  runAllExamples
};

// Run examples if this file is executed directly
if (import.meta.main) {
  runAllExamples();
}