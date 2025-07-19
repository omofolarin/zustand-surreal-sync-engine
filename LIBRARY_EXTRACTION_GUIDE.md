# Sync Engine Library - Core Extraction Guide

This document describes the refactored sync engine library with its clean public API interfaces, database adapter abstraction, and comprehensive configuration system.

## Overview

The sync engine has been extracted and refactored into a standalone library module with the following key improvements:

### ✅ Task 2 Completed: Core Sync Engine Library Extraction

- **✅ Extracted ZustandSurrealSyncEngine into standalone library module**
- **✅ Created clean public API interfaces with comprehensive TypeScript definitions**
- **✅ Implemented database adapter abstraction layer with SurrealDB implementation**
- **✅ Added configuration system with validation and type safety**

## Architecture

### Core Components

1. **SyncEngineAPI** - Main entry point for library consumers
2. **SyncEngineFactory** - Factory methods for common use cases
3. **SyncEngineUtils** - Utility functions for configuration and management
4. **ConfigBuilder** - Fluent API for building configurations
5. **DatabaseAdapter** - Abstract interface for database operations
6. **SurrealDBAdapter** - Concrete implementation for SurrealDB

### Type System

The library provides comprehensive TypeScript definitions:

```typescript
// Core interfaces
interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  create<T>(table: string, data: Partial<T>): Promise<T>;
  update<T>(id: StringRecordId, data: Partial<T>): Promise<T>;
  delete(id: StringRecordId): Promise<void>;
  select<T>(table: string, id?: StringRecordId): Promise<T | T[]>;
  startLiveQuery(table: string, callback: LiveQueryCallback): Promise<void>;
  stopLiveQuery(table: string): Promise<void>;
  isConnected(): boolean;
  healthCheck(): Promise<boolean>;
}

interface SyncEngineConfig {
  syncInterval?: number;
  retryAttempts?: number;
  batchSize?: number;
  enableLogging?: boolean;
  operationTimeout?: number;
  offlineSupport?: boolean;
}

interface SyncStatus {
  pending: number;
  syncing: boolean;
  lastSync?: number;
  errors: string[];
  connected: boolean;
  liveQueries: number;
}
```

## Usage Examples

### Basic Usage

```typescript
import { SyncEngineAPI, ConfigBuilder, createSyncMiddleware } from '@sync-engine/core';
import { create } from 'zustand';

// Create configuration
const config = ConfigBuilder.create()
  .database('myapp', 'production', 'main')
  .syncInterval(2000)
  .retryAttempts(3)
  .table('todos', {
    zustandPath: 'todos',
    primaryKey: 'id',
    schema: {
      fields: {
        id: { type: 'string' },
        text: { type: 'string', constraints: { nullable: false } },
        completed: { type: 'bool', constraints: { default: false } }
      }
    }
  })
  .build();

// Create sync engine
const syncEngine = await SyncEngineAPI.create(config);

// Create Zustand store with sync middleware
const todoMiddleware = createSyncMiddleware(syncEngine, 'todos');
const useTodoStore = create(todoMiddleware((set, get) => ({
  todos: [],
  addTodo: (text: string) => set(state => ({
    todos: [...state.todos, { id: crypto.randomUUID(), text, completed: false }]
  }))
})));

// Load initial data and start syncing
await syncEngine.loadInitialData('todos');
```

### Factory Methods

```typescript
import { SyncEngineFactory } from '@sync-engine/core';

// Basic sync engine for simple use cases
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
  }
});

// Offline-first sync engine
const offlineEngine = await SyncEngineFactory.createOfflineFirst({
  dbName: 'offline-app',
  namespace: 'prod',
  database: 'main',
  tables: { /* table configs */ }
});

// High-performance sync engine
const perfEngine = await SyncEngineFactory.createHighPerformance({
  dbName: 'perf-app',
  namespace: 'prod',
  database: 'main',
  tables: { /* table configs */ }
});
```

### Event Handling and Monitoring

```typescript
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

// Monitor sync status
const status = syncEngine.getSyncStatus();
console.log('Sync status:', status);

// Get performance metrics
const metrics = syncEngine.getMetrics();
console.log('Metrics:', metrics);

// Perform health check
const isHealthy = await syncEngine.healthCheck();
console.log('Database healthy:', isHealthy);
```

### Configuration Utilities

```typescript
import { SyncEngineUtils, ConfigValidator } from '@sync-engine/core';

// Create table configuration with utilities
const tableConfig = SyncEngineUtils.createTableConfig({
  zustandPath: 'users',
  primaryKey: 'id',
  fields: {
    id: { type: 'string' },
    name: { type: 'string', nullable: false },
    email: { type: 'string', unique: true }
  },
  indexes: [
    { name: 'email_idx', fields: ['email'], unique: true }
  ]
});

// Validate configuration
const validation = ConfigValidator.validate(config);
if (!validation.valid) {
  console.error('Configuration errors:', validation.errors);
}

// Merge configurations
const merged = SyncEngineUtils.mergeConfigs(config1, config2);

// Extract information
const tableNames = SyncEngineUtils.getTableNames(config);
const hasEnabled = SyncEngineUtils.hasEnabledTables(config);
```

## Database Adapter Abstraction

The library uses a clean adapter pattern for database operations:

```typescript
// Custom adapter implementation
class CustomDatabaseAdapter implements DatabaseAdapter {
  async connect(): Promise<void> {
    // Custom connection logic
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    // Custom create logic
  }

  // ... implement other methods
}

// Use custom adapter
const syncEngine = await SyncEngineAPI.createWithAdapter(config, new CustomDatabaseAdapter());
```

## Configuration System

### ConfigBuilder Features

- **Fluent API** - Method chaining for easy configuration
- **Validation** - Built-in validation with detailed error messages
- **Type Safety** - Full TypeScript support with type inference
- **Defaults** - Automatic application of sensible defaults
- **Merging** - Combine multiple configurations
- **Cloning** - Create configuration variants

```typescript
const config = ConfigBuilder.create()
  .database('app', 'prod', 'main')
  .syncInterval(1000)
  .retryAttempts(5)
  .conflictResolution('last-write-wins')
  .simpleTable('todos', 'todos', 'id', { text: 'string', completed: 'bool' })
  .enableSync(true)
  .defaults()
  .build();
```

### Schema Definition

Enhanced schema support with constraints and indexes:

```typescript
const schema = {
  fields: {
    id: { type: 'string' },
    email: { 
      type: 'string',
      constraints: {
        unique: true,
        nullable: false,
        assert: 'string::is::email($value)'
      }
    },
    age: {
      type: 'number',
      constraints: {
        assert: '$value >= 0 AND $value <= 150'
      }
    }
  },
  indexes: [
    { name: 'email_idx', fields: ['email'], unique: true },
    { name: 'age_idx', fields: ['age'] }
  ],
  permissions: {
    select: 'true',
    create: '$auth.id != NONE',
    update: '$auth.id == $before.owner',
    delete: '$auth.role == "admin"'
  }
};
```

## Error Handling

The library provides comprehensive error handling:

- **Configuration Validation** - Detailed validation with warnings and errors
- **Connection Management** - Automatic reconnection and health monitoring
- **Retry Logic** - Configurable retry attempts with exponential backoff
- **Event System** - Real-time error notifications
- **Graceful Degradation** - Offline support and queue management

## Performance Features

- **Batching** - Configurable batch sizes for bulk operations
- **Metrics** - Detailed performance monitoring
- **Optimization** - Different engine configurations for various use cases
- **Memory Management** - Efficient change tracking and cleanup
- **Network Efficiency** - Minimal data transfer with delta sync

## Testing

The library includes comprehensive tests:

```bash
# Run core functionality tests
bun test test/sync-engine-core.test.ts

# Run integration tests (requires database)
bun test test/sync-engine-library.test.ts
```

## Migration Guide

### From Previous Version

1. **Update Imports**:
   ```typescript
   // Old
   import { ZustandSurrealSyncEngine } from './core/SyncEngine';
   
   // New
   import { SyncEngineAPI } from '@sync-engine/core';
   ```

2. **Update Initialization**:
   ```typescript
   // Old
   const engine = new ZustandSurrealSyncEngine(config);
   await engine.initialize(adapter);
   
   // New
   const engine = await SyncEngineAPI.create(config);
   ```

3. **Update Middleware Creation**:
   ```typescript
   // Old
   const middleware = engine.createSyncMiddleware('todos');
   
   // New
   const middleware = createSyncMiddleware(engine, 'todos');
   ```

## Best Practices

1. **Configuration Management**
   - Use ConfigBuilder for complex configurations
   - Validate configurations before deployment
   - Use factory methods for common patterns

2. **Error Handling**
   - Always add event listeners for errors
   - Implement proper retry logic
   - Monitor sync status regularly

3. **Performance**
   - Choose appropriate sync intervals
   - Use batching for bulk operations
   - Monitor metrics in production

4. **Testing**
   - Use SyncEngineUtils.createTestConfig for tests
   - Mock database adapters for unit tests
   - Test configuration validation

## API Reference

### SyncEngineAPI

- `create(config, engineConfig?)` - Create sync engine
- `createEnhanced(config, userId, engineConfig?)` - Create enhanced engine
- `createMiddleware(tableName)` - Create Zustand middleware
- `loadInitialData(tableName)` - Load initial data
- `getSyncStatus()` - Get current status
- `getMetrics()` - Get performance metrics
- `on(event, handler)` - Add event listener
- `off(event, handler)` - Remove event listener
- `healthCheck()` - Check database health
- `shutdown()` - Clean shutdown

### SyncEngineFactory

- `createBasic(options)` - Basic sync engine
- `createCollaborative(options)` - Collaborative features
- `createOfflineFirst(options)` - Offline-first configuration
- `createHighPerformance(options)` - Performance optimized

### SyncEngineUtils

- `createTableConfig(options)` - Create table configuration
- `createTestConfig(tableName, path)` - Create test configuration
- `mergeConfigs(...configs)` - Merge configurations
- `getTableNames(config)` - Extract table names
- `hasEnabledTables(config)` - Check for enabled tables
- `getEnabledTables(config)` - Get enabled tables

### ConfigBuilder

- `database(name, namespace, database)` - Set database info
- `syncInterval(ms)` - Set sync interval
- `retryAttempts(count)` - Set retry attempts
- `table(name, config)` - Add table configuration
- `simpleTable(name, path, key?, fields?)` - Add simple table
- `build()` - Build final configuration
- `validate()` - Validate without building
- `clone()` - Clone builder

This refactored library provides a clean, type-safe, and extensible foundation for synchronizing Zustand state with SurrealDB while maintaining backward compatibility and adding powerful new features.