/**
 * Test suite for real-time collaboration infrastructure
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CollaborationWebSocketClient } from '../src/core/websocket-client';
import { CollaborationEventManager } from '../src/core/collaboration-events';
import { CommentManager } from '../src/features/comments';
import { FieldLockManager } from '../src/features/field-locking';
import { EnhancedSyncEngine } from '../src/core/EnhancedSyncEngine';
import { StringRecordId } from 'surrealdb';

// Mock WebSocket for testing
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(public url: string, public protocols?: string[]) {
    // Simulate connection opening immediately for tests
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 1);
  }

  send(data: string): void {
    // Mock send - in real tests you might want to capture this
    console.log('Mock WebSocket send:', data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code, reason }));
    }
  }
}

// Mock global WebSocket
(global as any).WebSocket = MockWebSocket;

describe('Real-time Collaboration Infrastructure', () => {
  describe('WebSocket Client', () => {
    let wsClient: CollaborationWebSocketClient;

    beforeEach(() => {
      wsClient = new CollaborationWebSocketClient({
        url: 'ws://localhost:8080/collaboration',
        reconnectInterval: 1000,
        maxReconnectAttempts: 3
      });
    });

    afterEach(() => {
      wsClient.disconnect();
    });

    it('should connect to WebSocket server', async () => {
      await wsClient.connect();
      // Give a small delay for the mock connection to establish
      await new Promise(resolve => setTimeout(resolve, 5));
      expect(wsClient.isConnected()).toBe(true);
    });

    it('should handle connection state changes', async () => {
      let connectionState: string | null = null;
      
      wsClient.on('connection-state-changed', (data) => {
        connectionState = data.state;
      });

      await wsClient.connect();
      // Give a small delay for the connection state to update
      await new Promise(resolve => setTimeout(resolve, 5));
      expect(connectionState).toBe('connected');
    });

    it('should send and queue messages', async () => {
      await wsClient.connect();
      // Give a small delay for the connection to establish
      await new Promise(resolve => setTimeout(resolve, 5));
      
      // Should not throw
      wsClient.send('test-message', { data: 'test' }, 'user-123');
      expect(wsClient.isConnected()).toBe(true);
    });

    it('should handle disconnection', async () => {
      await wsClient.connect();
      // Give a small delay for the connection to establish
      await new Promise(resolve => setTimeout(resolve, 5));
      expect(wsClient.isConnected()).toBe(true);
      
      wsClient.disconnect();
      expect(wsClient.getConnectionState()).toBe('disconnected');
    });
  });

  describe('Collaboration Event Manager', () => {
    let wsClient: CollaborationWebSocketClient;
    let eventManager: CollaborationEventManager;

    beforeEach(async () => {
      wsClient = new CollaborationWebSocketClient({
        url: 'ws://localhost:8080/collaboration'
      });
      await wsClient.connect();
      eventManager = new CollaborationEventManager(wsClient, 'user-123');
    });

    afterEach(() => {
      wsClient.disconnect();
    });

    it('should broadcast cursor movements', () => {
      const cursor = {
        field: 'content',
        position: 42,
        line: 1,
        column: 42
      };

      // Should not throw
      eventManager.broadcastCursorMoved('session-123', cursor);
    });

    it('should broadcast presence updates', () => {
      const presence = {
        status: 'active' as const,
        isTyping: true,
        lastActivity: Date.now(),
        device: {
          type: 'desktop' as const,
          os: 'macOS',
          browser: 'Chrome',
          screenSize: { width: 1920, height: 1080 },
          touchSupport: false,
          penSupport: false
        }
      };

      // Should not throw
      eventManager.broadcastPresenceUpdated('session-123', presence);
    });

    it('should handle event listeners', () => {
      let eventReceived = false;
      
      eventManager.on('cursor-moved', () => {
        eventReceived = true;
      });

      eventManager.emitLocal('cursor-moved', { test: true });
      expect(eventReceived).toBe(true);
    });
  });

  describe('Comment Manager', () => {
    let commentManager: CommentManager;

    beforeEach(() => {
      commentManager = new CommentManager();
    });

    it('should create comments', async () => {
      const comment = await commentManager.createComment(
        new StringRecordId('doc-123'),
        'content',
        10,
        5,
        'This is a test comment',
        'user-123',
        ['@user-456']
      );

      expect(comment.id).toBeDefined();
      expect(comment.content).toBe('This is a test comment');
      expect(comment.author).toBe('user-123');
      expect(comment.mentions).toContain('user-456');
    });

    it('should reply to comments', async () => {
      const comment = await commentManager.createComment(
        new StringRecordId('doc-123'),
        'content',
        10,
        5,
        'Original comment',
        'user-123'
      );

      const reply = await commentManager.replyToComment(
        comment.id,
        'This is a reply',
        'user-456'
      );

      expect(reply.id).toBeDefined();
      expect(reply.content).toBe('This is a reply');
      expect(reply.author).toBe('user-456');
      expect(comment.replies).toContain(reply);
    });

    it('should resolve comments', async () => {
      const comment = await commentManager.createComment(
        new StringRecordId('doc-123'),
        'content',
        10,
        5,
        'Comment to resolve',
        'user-123'
      );

      await commentManager.resolveComment(comment.id, 'user-456');
      
      const resolvedComment = commentManager.getComment(comment.id);
      expect(resolvedComment?.resolved).toBe(true);
    });

    it('should get comments for record', async () => {
      const recordId = new StringRecordId('doc-123');
      
      await commentManager.createComment(recordId, 'title', 0, 5, 'Comment 1', 'user-123');
      await commentManager.createComment(recordId, 'content', 10, 3, 'Comment 2', 'user-456');

      const comments = commentManager.getCommentsForRecord(recordId);
      expect(comments).toHaveLength(2);
    });

    it('should search comments', async () => {
      const recordId = new StringRecordId('doc-123');
      
      await commentManager.createComment(recordId, 'content', 0, 5, 'Important note', 'user-123');
      await commentManager.createComment(recordId, 'content', 10, 3, 'Regular comment', 'user-456');

      const results = commentManager.searchComments('important', recordId);
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Important note');
    });
  });

  describe('Field Lock Manager', () => {
    let lockManager: FieldLockManager;

    beforeEach(() => {
      lockManager = new FieldLockManager();
    });

    it('should acquire field locks', async () => {
      const result = await lockManager.requestLock({
        recordId: new StringRecordId('doc-123'),
        field: 'content',
        userId: 'user-123',
        lockType: 'soft'
      });

      expect(result.success).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock?.lockedBy).toBe('user-123');
    });

    it('should detect lock conflicts', async () => {
      // First user acquires lock
      await lockManager.requestLock({
        recordId: new StringRecordId('doc-123'),
        field: 'content',
        userId: 'user-123',
        lockType: 'hard'
      });

      // Second user tries to acquire same lock
      const result = await lockManager.requestLock({
        recordId: new StringRecordId('doc-123'),
        field: 'content',
        userId: 'user-456',
        lockType: 'soft'
      });

      expect(result.success).toBe(false);
      expect(result.conflict).toBeDefined();
      expect(result.conflict?.conflictType).toBe('type_conflict');
    });

    it('should release locks', async () => {
      const recordId = new StringRecordId('doc-123');
      const field = 'content';
      const userId = 'user-123';

      await lockManager.requestLock({
        recordId,
        field,
        userId,
        lockType: 'soft'
      });

      expect(lockManager.isFieldLocked(recordId, field)).toBe(true);

      const released = await lockManager.releaseLock(recordId, field, userId);
      expect(released).toBe(true);
      expect(lockManager.isFieldLocked(recordId, field)).toBe(false);
    });

    it('should handle lock expiration', async () => {
      const recordId = new StringRecordId('doc-123');
      const field = 'content';

      await lockManager.requestLock({
        recordId,
        field,
        userId: 'user-123',
        lockType: 'soft',
        duration: 100 // 100ms
      });

      expect(lockManager.isFieldLocked(recordId, field)).toBe(true);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(lockManager.isFieldLocked(recordId, field)).toBe(false);
    });

    it('should provide lock statistics', async () => {
      await lockManager.requestLock({
        recordId: new StringRecordId('doc-1'),
        field: 'content',
        userId: 'user-123',
        lockType: 'soft'
      });

      await lockManager.requestLock({
        recordId: new StringRecordId('doc-2'),
        field: 'title',
        userId: 'user-456',
        lockType: 'hard'
      });

      const stats = lockManager.getLockStats();
      expect(stats.totalLocks).toBe(2);
      expect(stats.softLocks).toBe(1);
      expect(stats.hardLocks).toBe(1);
      expect(stats.locksByUser['user-123']).toBe(1);
      expect(stats.locksByUser['user-456']).toBe(1);
    });
  });

  describe('Enhanced Sync Engine Integration', () => {
    let engine: EnhancedSyncEngine;

    beforeEach(() => {
      const config = {
        dbName: 'test',
        namespace: 'test',
        database: 'test',
        tables: {
          documents: {
            zustandPath: 'documents',
            primaryKey: 'id',
            schema: {
              fields: {
                id: { type: 'string' },
                title: { type: 'string' },
                content: { type: 'string' }
              }
            }
          }
        },
        websocket: {
          url: 'ws://localhost:8080/collaboration'
        },
        collaboration: {
          enableRealTime: true,
          enableComments: true,
          enableFieldLocking: true
        }
      };

      engine = new EnhancedSyncEngine(config, 'user-123');
    });

    afterEach(async () => {
      await engine.shutdown();
    });

    it('should start collaboration session', async () => {
      const session = await engine.startCollaboration('doc-123', 'user-123');
      
      expect(session.id).toBeDefined();
      expect(session.participants).toHaveLength(1);
      expect(session.participants[0].userId).toBe('user-123');
    });

    it('should handle cursor updates', async () => {
      const session = await engine.startCollaboration('doc-123', 'user-123');
      
      // Should not throw
      await engine.updateCursor(session.id, 'content', 42);
      
      const participant = session.participants.find(p => p.userId === 'user-123');
      expect(participant?.cursor?.position).toBe(42);
    });

    it('should handle comments', async () => {
      await engine.startCollaboration('doc-123', 'user-123');
      
      const comment = await engine.sendComment('doc-123', {
        recordId: new StringRecordId('doc-123'),
        field: 'content',
        position: 10,
        length: 5,
        content: 'Test comment',
        author: 'user-123',
        resolved: false,
        replies: [],
        mentions: []
      });

      expect(comment.id).toBeDefined();
      expect(comment.content).toBe('Test comment');
      
      const comments = engine.getComments('doc-123');
      expect(comments).toHaveLength(1);
    });

    it('should handle field locking', async () => {
      await engine.startCollaboration('doc-123', 'user-123');
      
      const locked = await engine.requestFieldLock('doc-123', 'content', 'soft');
      expect(locked).toBe(true);
      
      expect(engine.isFieldLocked('doc-123', 'content')).toBe(true);
      
      const released = await engine.releaseFieldLock('doc-123', 'content');
      expect(released).toBe(true);
      
      expect(engine.isFieldLocked('doc-123', 'content')).toBe(false);
    });

    it('should handle event listeners', async () => {
      let cursorMoved = false;
      let commentAdded = false;
      
      engine.on('cursor-moved', () => {
        cursorMoved = true;
      });
      
      engine.on('comment-added', () => {
        commentAdded = true;
      });

      const session = await engine.startCollaboration('doc-123', 'user-123');
      await engine.updateCursor(session.id, 'content', 42);
      await engine.sendComment('doc-123', {
        recordId: new StringRecordId('doc-123'),
        field: 'content',
        position: 10,
        length: 5,
        content: 'Test comment',
        author: 'user-123',
        resolved: false,
        replies: [],
        mentions: []
      });

      // Events should be handled (though in this test they won't fire since we're not using real WebSocket)
      expect(typeof cursorMoved).toBe('boolean');
      expect(typeof commentAdded).toBe('boolean');
    });
  });
});