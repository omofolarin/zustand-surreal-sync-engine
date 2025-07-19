import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnhancedSyncEngine } from '../src/core/EnhancedSyncEngine';
import { OperationalTransform } from '../src/core/operational-transform';
import type { SyncConfig, DatabaseAdapter } from '../src/core/types';
import type { TextOperation, CollaborationSession } from '../src/core/collaboration';

// Mock database adapter
const mockAdapter: DatabaseAdapter = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  create: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
  startLiveQuery: vi.fn().mockResolvedValue(undefined),
  stopLiveQuery: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  healthCheck: vi.fn().mockResolvedValue(true)
};

const testConfig: SyncConfig = {
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
      },
      syncEnabled: true
    }
  }
};

describe('EnhancedSyncEngine', () => {
  let engine: EnhancedSyncEngine;

  beforeEach(async () => {
    engine = new EnhancedSyncEngine(testConfig, 'user1');
    await engine.initialize(mockAdapter);
  });

  describe('Collaboration Features', () => {
    it('should start a collaboration session', async () => {
      const session = await engine.startCollaboration('doc1', 'user1');
      
      expect(session).toBeDefined();
      expect(session.recordId.toString()).toBe('doc1');
      expect(session.participants).toHaveLength(1);
      expect(session.participants[0].userId).toBe('user1');
      expect(session.participants[0].role).toBe('editor');
    });

    it('should update cursor position', async () => {
      const session = await engine.startCollaboration('doc1', 'user1');
      
      await engine.updateCursor(session.id, 'content', 42);
      
      const updatedSession = engine.getActiveCollaborationSessions('doc1')[0];
      const participant = updatedSession.participants.find(p => p.userId === 'user1');
      
      expect(participant?.cursor).toBeDefined();
      expect(participant?.cursor?.field).toBe('content');
      expect(participant?.cursor?.position).toBe(42);
    });

    it('should update text selection', async () => {
      const session = await engine.startCollaboration('doc1', 'user1');
      
      await engine.updateSelection(session.id, 'content', 10, 20);
      
      const updatedSession = engine.getActiveCollaborationSessions('doc1')[0];
      const participant = updatedSession.participants.find(p => p.userId === 'user1');
      
      expect(participant?.selection).toBeDefined();
      expect(participant?.selection?.field).toBe('content');
      expect(participant?.selection?.start).toBe(10);
      expect(participant?.selection?.end).toBe(20);
    });

    it('should send comments', async () => {
      await engine.startCollaboration('doc1', 'user1');
      
      await engine.sendComment('doc1', {
        recordId: 'doc1' as any,
        field: 'content',
        position: 15,
        length: 5,
        content: 'This needs clarification',
        author: 'user1',
        resolved: false,
        replies: [],
        mentions: ['@user2']
      });
      
      const sessions = engine.getActiveCollaborationSessions('doc1');
      expect(sessions).toHaveLength(1);
      // Comments are stored in awareness state, which is tested separately
    });
  });

  describe('Operational Transform', () => {
    it('should apply text operations', async () => {
      const session = await engine.startCollaboration('doc1', 'user1');
      
      const operation: TextOperation = {
        id: 'op1',
        type: 'insert',
        position: 0,
        content: 'Hello',
        userId: 'user1',
        timestamp: Date.now(),
        field: 'content'
      };
      
      await engine.applyTextOperation(session.id, operation);
      
      // Operation should be queued
      expect(mockAdapter.create).toHaveBeenCalled();
    });

    it('should transform operations', async () => {
      const op1: TextOperation = {
        id: 'op1',
        type: 'insert',
        position: 5,
        content: 'Hello',
        userId: 'user1',
        timestamp: Date.now(),
        field: 'content'
      };

      const op2: TextOperation = {
        id: 'op2',
        type: 'insert',
        position: 3,
        content: 'World',
        userId: 'user2',
        timestamp: Date.now(),
        field: 'content'
      };

      const transformed = await engine.transformOperation(op1, op2);
      
      expect(transformed.position).toBe(10); // Position adjusted for op2's insertion
    });
  });

  describe('Conflict Resolution', () => {
    it('should set conflict resolution strategy', () => {
      engine.setConflictResolution('documents', {
        strategy: 'operational-transform'
      });
      
      // Strategy should be stored internally
      expect(() => engine.setConflictResolution('documents', {
        strategy: 'last-write-wins'
      })).not.toThrow();
    });
  });

  describe('Batch Operations', () => {
    it('should create and execute batch operations', async () => {
      const batch = engine.createBatch();
      
      const operation: TextOperation = {
        id: 'op1',
        type: 'insert',
        position: 0,
        content: 'Hello',
        userId: 'user1',
        timestamp: Date.now(),
        field: 'content'
      };
      
      batch.addOperation(operation);
      await batch.execute();
      
      expect(mockAdapter.create).toHaveBeenCalled();
    });
  });

  describe('Plugin System', () => {
    it('should register plugins', () => {
      const mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        initialize: vi.fn().mockResolvedValue(undefined)
      };
      
      engine.use(mockPlugin);
      
      expect(mockPlugin.initialize).toHaveBeenCalledWith(engine);
    });
  });

  describe('Monitoring', () => {
    it('should provide enhanced metrics', () => {
      const metrics = engine.getMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.collaborationMetrics).toBeDefined();
      expect(metrics.collaborationMetrics?.activeUsers).toBeDefined();
      expect(metrics.collaborationMetrics?.operationsPerSecond).toBeDefined();
    });

    it('should perform health checks', async () => {
      const health = await engine.healthCheck();
      
      expect(health).toBeDefined();
      expect(health.connected).toBe(true);
      expect(health.collaborationActive).toBeDefined();
      expect(health.activeSessions).toBeDefined();
    });
  });

  describe('Event System', () => {
    it('should handle collaboration events', () => {
      const handler = vi.fn();
      
      engine.on('cursor-moved', handler);
      engine.off('cursor-moved', handler);
      
      // Should not throw
      expect(() => engine.on('user-joined', handler)).not.toThrow();
    });
  });

  describe('Utility Methods', () => {
    it('should check if field is being edited', async () => {
      await engine.startCollaboration('doc1', 'user1');
      
      const isEditing = engine.isFieldBeingEdited('doc1', 'content');
      expect(typeof isEditing).toBe('boolean');
    });

    it('should get field editors', async () => {
      await engine.startCollaboration('doc1', 'user1');
      
      const editors = engine.getFieldEditors('doc1', 'content');
      expect(Array.isArray(editors)).toBe(true);
    });
  });
});

describe('OperationalTransform', () => {
  describe('Transform Operations', () => {
    it('should transform insert operations', () => {
      const op1: TextOperation = {
        id: 'op1',
        type: 'insert',
        position: 5,
        content: 'Hello',
        userId: 'user1',
        timestamp: Date.now(),
        field: 'content'
      };

      const op2: TextOperation = {
        id: 'op2',
        type: 'insert',
        position: 3,
        content: 'World',
        userId: 'user2',
        timestamp: Date.now(),
        field: 'content'
      };

      const transformed = OperationalTransform.transform(op1, op2);
      expect(transformed.position).toBe(10); // Adjusted for op2's insertion
    });

    it('should handle different fields', () => {
      const op1: TextOperation = {
        id: 'op1',
        type: 'insert',
        position: 5,
        content: 'Hello',
        userId: 'user1',
        timestamp: Date.now(),
        field: 'title'
      };

      const op2: TextOperation = {
        id: 'op2',
        type: 'insert',
        position: 3,
        content: 'World',
        userId: 'user2',
        timestamp: Date.now(),
        field: 'content'
      };

      const transformed = OperationalTransform.transform(op1, op2);
      expect(transformed.position).toBe(5); // No change for different fields
    });
  });

  describe('Apply Operations', () => {
    it('should apply insert operations', () => {
      const text = 'Hello World';
      const operation: TextOperation = {
        id: 'op1',
        type: 'insert',
        position: 6,
        content: 'Beautiful ',
        userId: 'user1',
        timestamp: Date.now(),
        field: 'content'
      };

      const result = OperationalTransform.apply(text, operation);
      expect(result).toBe('Hello Beautiful World');
    });

    it('should apply delete operations', () => {
      const text = 'Hello Beautiful World';
      const operation: TextOperation = {
        id: 'op1',
        type: 'delete',
        position: 6,
        length: 10, // 'Beautiful '
        userId: 'user1',
        timestamp: Date.now(),
        field: 'content'
      };

      const result = OperationalTransform.apply(text, operation);
      expect(result).toBe('Hello World');
    });
  });

  describe('Validation', () => {
    it('should validate operations', () => {
      const validOp: TextOperation = {
        id: 'op1',
        type: 'insert',
        position: 0,
        content: 'Hello',
        userId: 'user1',
        timestamp: Date.now(),
        field: 'content'
      };

      expect(OperationalTransform.validate(validOp)).toBe(true);

      const invalidOp = {
        ...validOp,
        position: -1
      };

      expect(OperationalTransform.validate(invalidOp)).toBe(false);
    });
  });
});