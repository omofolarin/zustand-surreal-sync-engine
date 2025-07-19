# @sync-engine/core

A comprehensive Bun library for robust synchronization between client-side state management (Zustand) and SurrealDB with real-time collaboration features.

## Features

- 🔄 **Bidirectional Sync**: Seamless synchronization between Zustand stores and SurrealDB
- 🏗️ **Schema Builder**: Type-safe schema definition with validation
- 🤝 **Real-time Collaboration**: Google Docs/Figma-level collaborative editing
- 📱 **Offline-First**: Works offline with automatic sync when reconnected
- 🔌 **Plugin System**: Extensible architecture for custom functionality
- ⚡ **Bun Optimized**: Built specifically for Bun runtime performance
- 📝 **TypeScript**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
bun add @sync-engine/core zustand surrealdb
```

## Quick Start

```typescript
import { ZustandSurrealSyncEngine, SurrealDBAdapter, FieldBuilder } from '@sync-engine/core';
import { create } from 'zustand';

// Define your schema
const syncConfig = {
  dbName: 'my-app-db',
  namespace: 'production',
  database: 'main',
  tables: {
    todos: {
      zustandPath: 'todos',
      primaryKey: 'id',
      syncEnabled: true,
      schema: {
        fields: {
          text: FieldBuilder.string({ required: true }),
          completed: FieldBuilder.boolean(false),
          createdAt: FieldBuilder.datetime({ autoNowAdd: true })
        }
      }
    }
  }
};

// Create sync engine and adapter
const syncEngine = new ZustandSurrealSyncEngine(syncConfig);
const dbAdapter = new SurrealDBAdapter(syncConfig);

// Create your Zustand store with sync middleware
const useTodoStore = create(
  syncEngine.createSyncMiddleware('todos')((set) => ({
    todos: [],
    addTodo: (text: string) => {
      set((state) => ({
        todos: [...state.todos, { text, completed: false, createdAt: new Date() }]
      }));
    },
    toggleTodo: (id: string) => {
      set((state) => ({
        todos: state.todos.map(todo =>
          todo.id === id ? { ...todo, completed: !todo.completed } : todo
        )
      }));
    }
  }))
);

// Initialize sync
await syncEngine.initialize(dbAdapter);
await syncEngine.loadInitialData('todos');
```

## Advanced Features

### Real-time Collaboration

```typescript
import { EnhancedSyncEngine } from '@sync-engine/core';

const enhancedEngine = new EnhancedSyncEngine(syncConfig, 'user-123');

// Start collaborative editing session
const sessionId = await enhancedEngine.startEditSession('todos', 'todo-1', ['text']);

// Queue field-level operations
enhancedEngine.queueFieldOperation(sessionId, 'text', 'insert', 'Hello', 0);

// End session
await enhancedEngine.endEditSession(sessionId);
```

### Schema Builder

```typescript
import { FieldBuilder, IndexBuilder } from '@sync-engine/core';

const userSchema = {
  fields: {
    email: FieldBuilder.email(true),
    username: FieldBuilder.string({
      required: true,
      unique: true,
      minLength: 3,
      maxLength: 20
    }),
    age: FieldBuilder.number({
      min: 13,
      max: 120,
      integer: true
    }),
    profile: FieldBuilder.object({
      firstName: '',
      lastName: ''
    }),
    tags: FieldBuilder.array('string', { maxLength: 10 })
  },
  indexes: [
    IndexBuilder.unique('idx_email', ['email']),
    IndexBuilder.composite('idx_username_age', ['username', 'age'])
  ]
};
```

## API Reference

### Core Classes

- **ZustandSurrealSyncEngine**: Main sync engine for basic functionality
- **EnhancedSyncEngine**: Advanced sync engine with collaboration features
- **SurrealDBAdapter**: Database adapter for SurrealDB integration

### Schema Builders

- **FieldBuilder**: Create type-safe field definitions
- **IndexBuilder**: Create database indexes

### Middleware

- **createSyncMiddleware**: Basic sync middleware for Zustand
- **createEnhancedSyncMiddleware**: Advanced middleware with collaboration

## Requirements

- Bun >= 1.0.0
- Zustand >= 4.5.0
- SurrealDB >= 1.3.0

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines for details.

## Support

- 📖 [Documentation](https://github.com/sync-engine/core/docs)
- 🐛 [Issues](https://github.com/sync-engine/core/issues)
- 💬 [Discussions](https://github.com/sync-engine/core/discussions)