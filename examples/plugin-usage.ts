/**
 * Plugin System Usage Example
 * 
 * This example demonstrates how to:
 * - Register and use plugins with the sync engine
 * - Create custom plugins
 * - Use plugin operations
 * - Handle plugin lifecycle
 */

import { EnhancedSyncEngine } from '../src/core/EnhancedSyncEngine';
import { SurrealDBAdapter } from '../src/adapters/SurrealDBAdapter';
import { AuditPlugin } from './plugins/audit-plugin';
import { ValidationPlugin } from './plugins/validation-plugin';
import type { Plugin } from '../src/features/plugins';
import { create } from 'zustand';
import { createEnhancedPluginMiddleware } from '../src/middleware/enhancedMiddleware';

// Example: Custom OCR Plugin (simplified version)
const OCRPlugin: Plugin = {
  name: 'ocr-processor',
  version: '1.0.0',
  description: 'OCR text processing and correction plugin',
  
  hooks: {
    beforeUpdate: async (table: string, id: string, data: any) => {
      // Process OCR-specific data
      if (table === 'ocr_documents' && data.ocrText) {
        // Apply OCR confidence filtering
        data.processedText = data.ocrText
          .filter((block: any) => block.confidence > 0.8)
          .map((block: any) => block.text)
          .join(' ');
      }
      return data;
    },
    
    onTextOperation: async (operation: any) => {
      // Track OCR corrections
      if (operation.field.includes('ocr')) {
        console.log('OCR correction applied:', operation);
      }
      return operation;
    }
  },
  
  operations: {
    'process-ocr': async (data: { imageData: string; confidence: number }) => {
      // Simulate OCR processing
      return {
        blocks: [
          {
            text: 'Sample OCR text',
            confidence: data.confidence || 0.9,
            boundingBox: { x: 0, y: 0, width: 100, height: 20 }
          }
        ],
        processedAt: Date.now()
      };
    },
    
    'correct-ocr-text': async (data: { blockId: string; correctedText: string }) => {
      console.log(`OCR correction: ${data.blockId} -> ${data.correctedText}`);
      return { success: true, correctedText: data.correctedText };
    }
  },
  
  initialize: async (syncEngine: any) => {
    console.log('OCR Plugin initialized');
  }
};

// Example: Performance Monitoring Plugin
const PerformancePlugin: Plugin = {
  name: 'performance-monitor',
  version: '1.0.0',
  description: 'Performance monitoring and optimization plugin',
  
  hooks: {
    beforeSync: async (data: any) => {
      data._perfStart = Date.now();
      return data;
    },
    
    afterSync: async (data: any) => {
      if (data._perfStart) {
        const duration = Date.now() - data._perfStart;
        console.log(`Sync operation took ${duration}ms for table ${data.table}`);
        
        // Log slow operations
        if (duration > 1000) {
          console.warn(`Slow sync operation detected: ${duration}ms`);
        }
      }
    },
    
    onError: async (error: Error) => {
      console.error('Performance Plugin caught error:', error.message);
    }
  },
  
  operations: {
    'get-performance-stats': async () => {
      return {
        averageResponseTime: 150,
        slowOperations: 3,
        totalOperations: 1250,
        uptime: Date.now() - startTime
      };
    }
  }
};

const startTime = Date.now();

async function demonstratePluginSystem() {
  console.log('=== Plugin System Demonstration ===\n');
  
  // 1. Initialize Enhanced Sync Engine
  const adapter = new SurrealDBAdapter({
    url: 'ws://localhost:8000/rpc',
    namespace: 'test',
    database: 'plugin_demo'
  });
  
  const syncEngine = new EnhancedSyncEngine({
    adapter,
    syncInterval: 2000
  }, 'demo-user');
  
  try {
    // 2. Register plugins
    console.log('Registering plugins...');
    await syncEngine.use(AuditPlugin);
    await syncEngine.use(ValidationPlugin);
    await syncEngine.use(OCRPlugin);
    await syncEngine.use(PerformancePlugin);
    
    console.log('Registered plugins:', syncEngine.getPlugins().map(p => p.name));
    console.log();
    
    // 3. Create stores with plugin-aware middleware
    interface TodoState {
      todos: Array<{ id: string; text: string; completed: boolean }>;
      addTodo: (text: string) => void;
      toggleTodo: (id: string) => void;
    }
    
    const useTodoStore = create<TodoState>(
      createEnhancedPluginMiddleware(
        syncEngine,
        'todos',
        [ValidationPlugin, AuditPlugin]
      )((set, get) => ({
        todos: [],
        
        addTodo: (text: string) => {
          const newTodo = {
            id: `todo_${Date.now()}`,
            text,
            completed: false
          };
          
          set(state => ({
            todos: [...state.todos, newTodo]
          }));
        },
        
        toggleTodo: (id: string) => {
          set(state => ({
            todos: state.todos.map(todo =>
              todo.id === id ? { ...todo, completed: !todo.completed } : todo
            )
          }));
        }
      }))
    );
    
    // 4. Demonstrate plugin operations
    console.log('=== Plugin Operations ===');
    
    // OCR processing
    const ocrResult = await syncEngine.executePluginOperation('process-ocr', {
      imageData: 'base64-image-data',
      confidence: 0.85
    });
    console.log('OCR processing result:', ocrResult);
    
    // Performance stats
    const perfStats = await syncEngine.executePluginOperation('get-performance-stats');
    console.log('Performance stats:', perfStats);
    
    // Validation
    const validationResult = await syncEngine.executePluginOperation('validate-data', {
      table: 'todos',
      data: { text: 'Valid todo item' }
    });
    console.log('Validation result:', validationResult);
    
    console.log();
    
    // 5. Test store operations (will trigger plugin hooks)
    console.log('=== Testing Store Operations ===');
    
    const store = useTodoStore.getState();
    
    // This will trigger validation and audit plugins
    store.addTodo('Learn about plugin system');
    store.addTodo('Build awesome apps');
    
    // Try invalid data (will be caught by validation plugin)
    try {
      store.addTodo(''); // Empty text should fail validation
    } catch (error) {
      console.log('Validation caught invalid data:', error.message);
    }
    
    console.log('Current todos:', useTodoStore.getState().todos);
    console.log();
    
    // 6. Get audit logs
    console.log('=== Audit Logs ===');
    const auditLogs = await syncEngine.executePluginOperation('get-audit-logs', {
      filter: { action: 'sync_before' }
    });
    console.log('Recent audit logs:', auditLogs.slice(-3));
    console.log();
    
    // 7. Add custom validation schema
    console.log('=== Custom Validation Schema ===');
    await syncEngine.executePluginOperation('add-validation-schema', {
      schema: {
        table: 'projects',
        rules: [
          { field: 'name', type: 'required' },
          { field: 'name', type: 'minLength', value: 3 },
          { field: 'budget', type: 'custom', validator: (value: number) => value > 0, message: 'Budget must be positive' }
        ]
      }
    });
    
    // Test the new schema
    const projectValidation = await syncEngine.executePluginOperation('validate-data', {
      table: 'projects',
      data: { name: 'My Project', budget: 1000 }
    });
    console.log('Project validation result:', projectValidation);
    
    // 8. Plugin health check
    console.log('=== Plugin Health Check ===');
    const pluginHealth = await syncEngine['pluginManager'].getPluginHealth();
    console.log('Plugin health status:', pluginHealth);
    
    // 9. Demonstrate collaboration with plugins
    console.log('=== Collaboration with Plugins ===');
    const session = await syncEngine.startCollaboration('todo_123', 'user_1');
    console.log('Collaboration session started:', session.id);
    
    // Apply text operation (will trigger plugin hooks)
    await syncEngine.applyTextOperation(session.id, {
      id: 'op_1',
      type: 'insert',
      position: 0,
      content: 'Hello, world!',
      field: 'todos.text',
      userId: 'user_1',
      timestamp: Date.now()
    });
    
    console.log('Text operation applied with plugin processing');
    
  } catch (error) {
    console.error('Demo error:', error);
  } finally {
    // 10. Cleanup
    console.log('\n=== Cleanup ===');
    
    // Unregister plugins
    await syncEngine.unuse('performance-monitor');
    console.log('Performance plugin unregistered');
    
    console.log('Remaining plugins:', syncEngine.getPlugins().map(p => p.name));
  }
}

// Example: Creating a plugin factory
export function createLoggingPlugin(logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'): Plugin {
  return {
    name: `logger-${logLevel}`,
    version: '1.0.0',
    description: `Logging plugin with ${logLevel} level`,
    
    config: { logLevel },
    
    hooks: {
      beforeSync: async (data: any) => {
        if (logLevel === 'debug') {
          console.log(`[${logLevel.toUpperCase()}] Before sync:`, data.table, data.operation);
        }
        return data;
      },
      
      onError: async (error: Error) => {
        if (['error', 'warn', 'info', 'debug'].includes(logLevel)) {
          console.error(`[${logLevel.toUpperCase()}] Error:`, error.message);
        }
      }
    },
    
    initialize: async () => {
      console.log(`Logging plugin initialized with level: ${logLevel}`);
    }
  };
}

// Run the demonstration
if (require.main === module) {
  demonstratePluginSystem().catch(console.error);
}

export { demonstratePluginSystem };