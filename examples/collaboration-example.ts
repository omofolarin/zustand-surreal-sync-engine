/**
 * Enhanced Sync Engine Collaboration Example
 * 
 * This example demonstrates the real-time collaboration features of the Enhanced Sync Engine,
 * including cursor tracking, text operations, comments, and conflict resolution.
 */

import { create } from 'zustand';
import { EnhancedSyncEngine } from '../src/core/EnhancedSyncEngine';
import { SurrealDBAdapter } from '../src/adapters/SurrealDBAdapter';
import type { SyncConfig } from '../src/types';
import type {
  CollaborationSession,
  TextOperation,
  Comment,
  UserPresence
} from '../src/core/collaboration';

// Document store interface
interface DocumentState {
  documents: Array<{
    id: string;
    title: string;
    content: string;
    lastModified: number;
  }>;
  addDocument: (title: string, content: string) => void;
  updateDocument: (id: string, updates: Partial<{ title: string; content: string }>) => void;
  deleteDocument: (id: string) => void;
}

// Sync configuration
const syncConfig: SyncConfig = {
  dbName: 'collaboration_demo',
  namespace: 'demo',
  database: 'documents',
  tables: {
    documents: {
      zustandPath: 'documents',
      primaryKey: 'id',
      schema: {
        fields: {
          id: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          lastModified: { type: 'number' }
        }
      },
      syncEnabled: true
    }
  },
  syncInterval: 1000,
  retryAttempts: 3
};

// Initialize enhanced sync engine
const syncEngine = new EnhancedSyncEngine(syncConfig, 'user-alice');

// Create Zustand store with sync middleware
const useDocumentStore = create<DocumentState>()(
  syncEngine.createSyncMiddleware<DocumentState>('documents')((set, get) => ({
    documents: [],

    addDocument: (title: string, content: string) => {
      const newDoc = {
        id: crypto.randomUUID(),
        title,
        content,
        lastModified: Date.now()
      };

      set(state => ({
        documents: [...state.documents, newDoc]
      }));
    },

    updateDocument: (id: string, updates: Partial<{ title: string; content: string }>) => {
      set(state => ({
        documents: state.documents.map(doc =>
          doc.id === id
            ? { ...doc, ...updates, lastModified: Date.now() }
            : doc
        )
      }));
    },

    deleteDocument: (id: string) => {
      set(state => ({
        documents: state.documents.filter(doc => doc.id !== id)
      }));
    }
  }))
);

/**
 * Collaborative Document Editor Class
 * 
 * Demonstrates real-time collaboration features like Google Docs
 */
class CollaborativeDocumentEditor {
  private syncEngine: EnhancedSyncEngine;
  private currentSession: CollaborationSession | null = null;
  private userId: string;

  constructor(syncEngine: EnhancedSyncEngine, userId: string) {
    this.syncEngine = syncEngine;
    this.userId = userId;
    this.setupEventListeners();
  }

  /**
   * Start editing a document collaboratively
   */
  async startCollaborativeEditing(documentId: string): Promise<void> {
    console.log(`🚀 Starting collaborative editing for document: ${documentId}`);

    // Start collaboration session
    this.currentSession = await this.syncEngine.startCollaboration(documentId, this.userId);

    console.log(`✅ Collaboration session started: ${this.currentSession.id}`);
    console.log(`👥 Participants: ${this.currentSession.participants.length}`);

    // Set up conflict resolution
    this.syncEngine.setConflictResolution('documents', {
      strategy: 'operational-transform'
    });

    // Broadcast initial presence
    await this.syncEngine.broadcastPresence(this.currentSession.id, {
      status: 'active',
      isTyping: false,
      lastActivity: Date.now(),
      device: {
        type: 'desktop',
        os: 'macOS',
        browser: 'Chrome',
        screenSize: { width: 1920, height: 1080 },
        touchSupport: false,
        penSupport: false
      }
    });
  }

  /**
   * Simulate typing in a document field
   */
  async simulateTyping(field: string, text: string, position: number = 0): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active collaboration session');
    }

    console.log(`⌨️  ${this.userId} typing "${text}" at position ${position} in field "${field}"`);

    // Update presence to show typing
    await this.syncEngine.broadcastPresence(this.currentSession.id, {
      status: 'active',
      currentField: field,
      isTyping: true,
      lastActivity: Date.now(),
      device: {
        type: 'desktop',
        os: 'macOS',
        browser: 'Chrome',
        screenSize: { width: 1920, height: 1080 },
        touchSupport: false,
        penSupport: false
      }
    });

    // Simulate character-by-character typing
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const currentPos = position + i;

      // Update cursor position
      await this.syncEngine.updateCursor(this.currentSession.id, field, currentPos);

      // Create text operation
      const operation: TextOperation = {
        id: `${this.userId}-${Date.now()}-${i}`,
        type: 'insert',
        position: currentPos,
        content: char,
        userId: this.userId,
        timestamp: Date.now(),
        field
      };

      // Apply operation
      await this.syncEngine.applyTextOperation(this.currentSession.id, operation);

      // Small delay to simulate real typing
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Update presence to stop typing
    await this.syncEngine.broadcastPresence(this.currentSession.id, {
      status: 'active',
      currentField: field,
      isTyping: false,
      lastActivity: Date.now(),
      device: {
        type: 'desktop',
        os: 'macOS',
        browser: 'Chrome',
        screenSize: { width: 1920, height: 1080 },
        touchSupport: false,
        penSupport: false
      }
    });

    console.log(`✅ Finished typing "${text}"`);
  }

  /**
   * Select text in a document
   */
  async selectText(field: string, start: number, end: number): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active collaboration session');
    }

    console.log(`🔍 ${this.userId} selecting text from ${start} to ${end} in field "${field}"`);

    await this.syncEngine.updateSelection(this.currentSession.id, field, start, end);
  }

  /**
   * Add a comment to the document
   */
  async addComment(documentId: string, field: string, position: number, content: string, mentions: string[] = []): Promise<void> {
    console.log(`💬 ${this.userId} adding comment: "${content}" at position ${position}`);

    const comment: Omit<Comment, 'id' | 'timestamp'> = {
      recordId: documentId as any,
      field,
      position,
      length: 0,
      content,
      author: this.userId,
      resolved: false,
      replies: [],
      mentions
    };

    await this.syncEngine.sendComment(documentId, comment);
  }

  /**
   * Demonstrate batch operations
   */
  async performBatchEdit(field: string): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active collaboration session');
    }

    console.log(`📦 ${this.userId} performing batch operations`);

    const batch = this.syncEngine.createBatch();

    // Add multiple operations
    batch.addOperation({
      id: `batch-op-1-${Date.now()}`,
      type: 'insert',
      position: 0,
      content: '[BATCH] ',
      userId: this.userId,
      timestamp: Date.now(),
      field
    });

    batch.addOperation({
      id: `batch-op-2-${Date.now()}`,
      type: 'insert',
      position: 8,
      content: 'EDIT ',
      userId: this.userId,
      timestamp: Date.now(),
      field
    });

    // Update cursor
    batch.updateCursor({
      field,
      position: 13
    });

    // Execute all operations atomically
    await batch.execute();

    console.log('✅ Batch operations completed');
  }

  /**
   * Set up event listeners for collaboration events
   */
  private setupEventListeners(): void {
    // User joined/left events
    this.syncEngine.on('user-joined', (data) => {
      console.log(`👋 User joined: ${data.participant?.userId || 'unknown'}`);
    });

    this.syncEngine.on('user-left', (data) => {
      console.log(`👋 User left: ${data.userId || 'unknown'}`);
    });

    // Cursor and selection events
    this.syncEngine.on('cursor-moved', (data) => {
      if (data.cursor?.userId !== this.userId) {
        console.log(`👆 ${data.cursor?.userId || 'someone'} moved cursor to position ${data.cursor?.position} in ${data.cursor?.field}`);
      }
    });

    this.syncEngine.on('selection-changed', (data) => {
      if (data.selection && data.sessionId) {
        console.log(`🔍 Selection changed: ${data.selection.start}-${data.selection.end} in ${data.selection.field}`);
      }
    });

    // Text change events
    this.syncEngine.on('text-changed', (data) => {
      if (data.operation?.userId !== this.userId) {
        console.log(`📝 Text changed by ${data.operation?.userId}: ${data.operation?.type} "${data.operation?.content || ''}" at ${data.operation?.position}`);
      }
    });

    // Presence events
    this.syncEngine.on('presence-updated', (data) => {
      if (data.presence) {
        console.log(`👤 ${data.userId || 'someone'} presence: ${data.presence.status} ${data.presence.isTyping ? '(typing)' : ''}`);
      }
    });

    // Comment events
    this.syncEngine.on('comment-added', (data) => {
      console.log(`💬 Comment added by ${data.comment?.author}: "${data.comment?.content}"`);
    });
  }

  /**
   * Get collaboration metrics
   */
  getMetrics() {
    const metrics = this.syncEngine.getMetrics();
    console.log('📊 Collaboration Metrics:', {
      activeUsers: metrics.collaborationMetrics?.activeUsers,
      operationsPerSecond: metrics.collaborationMetrics?.operationsPerSecond,
      conflictRate: metrics.collaborationMetrics?.conflictRate,
      totalOperations: metrics.totalOperations
    });
    return metrics;
  }

  /**
   * Check health status
   */
  async checkHealth() {
    const health = await this.syncEngine.healthCheck();
    console.log('🏥 Health Status:', health);
    return health;
  }
}

/**
 * Demo function to showcase collaboration features
 */
async function runCollaborationDemo() {
  console.log('🎬 Starting Enhanced Sync Engine Collaboration Demo\n');

  try {
    // Initialize database adapter
    const dbAdapter = new SurrealDBAdapter({
      url: 'ws://localhost:8000/rpc',
      namespace: 'demo',
      database: 'documents',
      auth: {
        username: 'root',
        password: 'root'
      }
    });

    // Initialize sync engine
    await syncEngine.initialize(dbAdapter);
    await syncEngine.loadInitialData('documents');

    // Create collaborative editor
    const editor = new CollaborativeDocumentEditor(syncEngine, 'user-alice');

    // Create a test document
    const store = useDocumentStore.getState();
    store.addDocument('Collaboration Demo', 'This is a collaborative document.');

    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 1000));

    const documents = useDocumentStore.getState().documents;
    if (documents.length === 0) {
      console.log('❌ No documents found. Creating a demo document...');
      store.addDocument('Demo Document', 'Hello, world!');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const document = useDocumentStore.getState().documents[0];
    console.log(`📄 Working with document: ${document.title} (${document.id})\n`);

    // Start collaborative editing
    await editor.startCollaborativeEditing(document.id);

    // Simulate various collaboration scenarios
    console.log('\n🎭 Simulating collaboration scenarios...\n');

    // 1. Typing simulation
    await editor.simulateTyping('content', ' Welcome to collaborative editing!', 13);

    // 2. Text selection
    await editor.selectText('content', 0, 5);

    // 3. Add comment
    await editor.addComment(document.id, 'content', 0, 'This is a great start!', ['@user-bob']);

    // 4. Batch operations
    await editor.performBatchEdit('title');

    // 5. Show metrics
    await new Promise(resolve => setTimeout(resolve, 1000));
    editor.getMetrics();

    // 6. Health check
    await editor.checkHealth();

    console.log('\n✅ Collaboration demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    // Cleanup
    await syncEngine.shutdown();
  }
}

// Export for use in other examples
export {
  CollaborativeDocumentEditor,
  useDocumentStore,
  syncEngine,
  runCollaborationDemo
};

// Run demo if this file is executed directly
if (import.meta.main) {
  runCollaborationDemo().catch(console.error);
}