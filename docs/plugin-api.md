# Plugin System API Documentation

The Sync Engine plugin system provides a powerful way to extend core functionality without modifying the base library. Plugins can add custom data processing, validation, monitoring, and specialized features like OCR processing.

## Table of Contents

- [Plugin Interface](#plugin-interface)
- [Plugin Hooks](#plugin-hooks)
- [Plugin Manager](#plugin-manager)
- [Middleware Integration](#middleware-integration)
- [Creating Plugins](#creating-plugins)
- [Plugin Examples](#plugin-examples)
- [Best Practices](#best-practices)

## Plugin Interface

### Basic Plugin Structure

```typescript
interface Plugin {
  name: string;                    // Unique plugin identifier
  version: string;                 // Plugin version (semver recommended)
  description?: string;            // Plugin description
  author?: string;                 // Plugin author
  dependencies?: string[];         // Other plugins this depends on
  
  hooks?: PluginHooks;            // Lifecycle hooks
  middleware?: SyncMiddleware[];   // Custom middleware
  config?: PluginConfig;          // Plugin configuration
  dataModels?: PluginDataModels;  // Custom data models
  operations?: Record<string, OperationHandler>; // Custom operations
  
  initialize?: (syncEngine: any) => Promise<void>;  // Initialization
  destroy?: () => Promise<void>;                    // Cleanup
  validateConfig?: (config: PluginConfig) => Promise<boolean>;
  healthCheck?: () => Promise<boolean>;
}
```

### Plugin Configuration

```typescript
interface PluginConfig {
  [key: string]: any;
}
```

## Plugin Hooks

Plugin hooks allow you to intercept and modify sync engine operations at various points in the lifecycle.

### Available Hooks

#### Sync Lifecycle Hooks

```typescript
interface PluginHooks {
  // Called before any sync operation
  beforeSync?: (data: ChangeRecord) => Promise<ChangeRecord>;
  
  // Called after successful sync operation
  afterSync?: (data: ChangeRecord) => Promise<void>;
  
  // Called when sync operation fails
  onSyncError?: (error: Error, data: ChangeRecord) => Promise<void>;
}
```

#### Data Operation Hooks

```typescript
interface PluginHooks {
  // Called before creating a record
  beforeCreate?: (table: string, data: any) => Promise<any>;
  
  // Called after creating a record
  afterCreate?: (table: string, data: any, result: any) => Promise<void>;
  
  // Called before updating a record
  beforeUpdate?: (table: string, id: string, data: any) => Promise<any>;
  
  // Called after updating a record
  afterUpdate?: (table: string, id: string, data: any, result: any) => Promise<void>;
  
  // Called before deleting a record
  beforeDelete?: (table: string, id: string) => Promise<void>;
  
  // Called after deleting a record
  afterDelete?: (table: string, id: string) => Promise<void>;
}
```

#### Collaboration Hooks

```typescript
interface PluginHooks {
  // Called when collaboration session starts
  onCollaborationStart?: (session: CollaborationSession) => Promise<void>;
  
  // Called when collaboration session ends
  onCollaborationEnd?: (session: CollaborationSession) => Promise<void>;
  
  // Called when user joins collaboration
  onUserJoined?: (session: CollaborationSession, user: CollaborationParticipant) => Promise<void>;
  
  // Called when user leaves collaboration
  onUserLeft?: (session: CollaborationSession, userId: string) => Promise<void>;
  
  // Called for text operations (operational transform)
  onTextOperation?: (operation: TextOperation) => Promise<TextOperation>;
  
  // Called when comment is added
  onCommentAdded?: (comment: Comment) => Promise<void>;
}
```

#### Conflict Resolution Hooks

```typescript
interface PluginHooks {
  // Called when conflict is detected
  onConflict?: (conflict: ConflictInfo) => Promise<ConflictInfo>;
  
  // Called when conflict is resolved
  onConflictResolved?: (conflict: ConflictInfo, resolution: any) => Promise<void>;
}
```

#### General Hooks

```typescript
interface PluginHooks {
  // Called for any sync engine event
  onEvent?: (event: SyncEngineEvent, data: any) => Promise<void>;
  
  // Called for any error
  onError?: (error: Error) => Promise<void>;
}
```

## Plugin Manager

The Plugin Manager handles plugin registration, lifecycle, and execution.

### Registration

```typescript
// Register a plugin
const result = await syncEngine.use(plugin);

// Check registration result
if (!result.success) {
  console.error('Plugin registration failed:', result.error);
}

// Unregister a plugin
const success = await syncEngine.unuse('plugin-name');
```

### Plugin Operations

```typescript
// Execute a plugin operation
const result = await syncEngine.executePluginOperation(
  'operation-name',
  { data: 'value' },
  'plugin-name' // optional - specific plugin
);

// Check if plugin is registered
const hasPlugin = syncEngine.hasPlugin('plugin-name');

// Get all registered plugins
const plugins = syncEngine.getPlugins();
```

### Plugin Health

```typescript
// Get health status of all plugins
const health = await syncEngine.pluginManager.getPluginHealth();

// Example result:
// {
//   'audit-logger': true,
//   'data-validator': true,
//   'ocr-processor': false
// }
```

## Middleware Integration

Plugins can provide custom middleware that integrates with the sync engine's middleware system.

### Plugin-Aware Middleware

```typescript
import { createPluginAwareMiddleware } from '@sync-engine/core';

const middleware = createPluginAwareMiddleware(
  syncEngine,
  'todos',
  [ValidationPlugin, AuditPlugin]
);

const useTodoStore = create(middleware((set, get) => ({
  todos: [],
  addTodo: (text: string) => {
    // This will trigger plugin hooks
    set(state => ({ todos: [...state.todos, { text }] }));
  }
})));
```

### Custom Plugin Middleware

```typescript
const customPlugin: Plugin = {
  name: 'custom-middleware',
  version: '1.0.0',
  
  middleware: [
    // Custom middleware function
    (config) => (set, get, api) => {
      const originalSet = set;
      
      const wrappedSet = (partial, replace) => {
        // Custom logic before state update
        console.log('State update:', partial);
        
        return originalSet(partial, replace);
      };
      
      return config(wrappedSet, get, api);
    }
  ]
};
```

## Creating Plugins

### Simple Plugin Example

```typescript
const SimplePlugin: Plugin = {
  name: 'simple-logger',
  version: '1.0.0',
  description: 'Simple logging plugin',
  
  hooks: {
    beforeSync: async (data) => {
      console.log('Syncing:', data.table, data.operation);
      return data;
    }
  },
  
  initialize: async (syncEngine) => {
    console.log('Simple plugin initialized');
  }
};
```

### Advanced Plugin Example

```typescript
const AdvancedPlugin: Plugin = {
  name: 'advanced-processor',
  version: '2.1.0',
  description: 'Advanced data processing plugin',
  author: 'Your Name',
  dependencies: ['audit-logger'],
  
  config: {
    processingMode: 'batch',
    batchSize: 100,
    enableCache: true
  },
  
  hooks: {
    beforeSync: async (data) => {
      // Transform data based on configuration
      if (this.config.processingMode === 'batch') {
        return await this.processBatch(data);
      }
      return data;
    },
    
    afterSync: async (data) => {
      // Update cache if enabled
      if (this.config.enableCache) {
        await this.updateCache(data);
      }
    }
  },
  
  operations: {
    'process-batch': async (data, context) => {
      // Custom batch processing logic
      return { processed: true, items: data.items.length };
    },
    
    'clear-cache': async () => {
      // Clear plugin cache
      return { success: true };
    }
  },
  
  initialize: async (syncEngine) => {
    // Initialize plugin resources
    this.cache = new Map();
    this.batchQueue = [];
  },
  
  destroy: async () => {
    // Cleanup resources
    this.cache?.clear();
    this.batchQueue = [];
  },
  
  validateConfig: async (config) => {
    return config.batchSize > 0 && typeof config.enableCache === 'boolean';
  },
  
  healthCheck: async () => {
    // Check if plugin is functioning correctly
    return this.cache !== undefined;
  }
};
```

### Plugin Factory Pattern

```typescript
export function createValidationPlugin(schemas: ValidationSchema[]): Plugin {
  const validator = new DataValidator();
  
  // Add schemas
  schemas.forEach(schema => validator.addSchema(schema));
  
  return {
    name: 'custom-validator',
    version: '1.0.0',
    
    hooks: {
      beforeSync: async (data) => {
        const result = validator.validate(data.table, data.data);
        if (!result.valid) {
          throw new Error(`Validation failed: ${result.errors.join(', ')}`);
        }
        return data;
      }
    },
    
    operations: {
      'validate': async (data) => validator.validate(data.table, data.data)
    }
  };
}

// Usage
const plugin = createValidationPlugin([
  {
    table: 'users',
    rules: [
      { field: 'email', type: 'required' },
      { field: 'email', type: 'email' }
    ]
  }
]);
```

## Plugin Examples

### Audit Plugin

Tracks all operations for compliance and monitoring:

```typescript
const AuditPlugin: Plugin = {
  name: 'audit-logger',
  version: '1.0.0',
  
  hooks: {
    beforeSync: async (data) => {
      this.log('sync_start', data);
      return data;
    },
    
    afterSync: async (data) => {
      this.log('sync_complete', data);
    },
    
    onError: async (error) => {
      this.log('error', { message: error.message });
    }
  },
  
  operations: {
    'get-logs': async (filter) => this.getLogs(filter),
    'export-logs': async () => this.exportLogs()
  }
};
```

### Validation Plugin

Validates data before sync operations:

```typescript
const ValidationPlugin: Plugin = {
  name: 'data-validator',
  version: '1.0.0',
  
  hooks: {
    beforeCreate: async (table, data) => {
      const validation = this.validate(table, data);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
      return this.transform(data);
    }
  },
  
  operations: {
    'add-schema': async (schema) => this.addSchema(schema),
    'validate': async (data) => this.validate(data.table, data.data)
  }
};
```

### OCR Plugin

Specialized plugin for OCR document processing:

```typescript
const OCRPlugin: Plugin = {
  name: 'ocr-processor',
  version: '1.0.0',
  
  dataModels: {
    OCRTextBlock: {
      id: 'string',
      text: 'string',
      confidence: 'number',
      boundingBox: 'object'
    }
  },
  
  hooks: {
    beforeUpdate: async (table, id, data) => {
      if (table === 'ocr_documents') {
        return this.processOCRData(data);
      }
      return data;
    }
  },
  
  operations: {
    'process-image': async (imageData) => this.processImage(imageData),
    'correct-text': async (correction) => this.applyCorrection(correction)
  }
};
```

## Best Practices

### Plugin Development

1. **Use Semantic Versioning**: Follow semver for plugin versions
2. **Handle Errors Gracefully**: Always catch and handle errors in hooks
3. **Validate Configuration**: Implement config validation
4. **Provide Health Checks**: Implement health check functionality
5. **Document Operations**: Clearly document custom operations
6. **Clean Up Resources**: Implement proper cleanup in destroy method

### Performance Considerations

1. **Async Operations**: Use async/await for all hook operations
2. **Avoid Blocking**: Don't perform long-running operations in hooks
3. **Batch Processing**: Use batching for bulk operations
4. **Memory Management**: Clean up resources and avoid memory leaks
5. **Error Handling**: Don't let plugin errors crash the sync engine

### Security

1. **Validate Input**: Always validate data in plugin operations
2. **Sanitize Data**: Sanitize user input before processing
3. **Access Control**: Implement proper access control for sensitive operations
4. **Audit Logging**: Log security-relevant operations

### Testing

```typescript
// Example plugin test
describe('ValidationPlugin', () => {
  let syncEngine: EnhancedSyncEngine;
  
  beforeEach(async () => {
    syncEngine = new EnhancedSyncEngine(config, 'test-user');
    await syncEngine.use(ValidationPlugin);
  });
  
  it('should validate data before sync', async () => {
    const store = create(
      createPluginAwareMiddleware(syncEngine, 'users', [ValidationPlugin])
      ((set) => ({
        users: [],
        addUser: (user) => set(state => ({ users: [...state.users, user] }))
      }))
    );
    
    // This should throw validation error
    expect(() => {
      store.getState().addUser({ email: 'invalid-email' });
    }).toThrow('Validation failed');
  });
});
```

### Plugin Distribution

1. **Package Structure**: Follow standard npm package structure
2. **Dependencies**: Clearly specify peer dependencies
3. **Documentation**: Provide comprehensive README and examples
4. **TypeScript**: Include TypeScript definitions
5. **Testing**: Include comprehensive test suite

```json
{
  "name": "@sync-engine/plugin-validation",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@sync-engine/core": "^1.0.0"
  },
  "files": ["dist", "README.md"]
}
```

This plugin system provides a powerful and flexible way to extend the sync engine's functionality while maintaining clean separation of concerns and excellent developer experience.