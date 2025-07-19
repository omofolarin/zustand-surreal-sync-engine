/**
 * Real-time collaboration event system
 * 
 * Handles all collaboration events including cursor movements, presence updates,
 * comments, field locking, and other real-time collaboration features.
 */

import { CollaborationWebSocketClient, WebSocketMessage } from './websocket-client';
import type {
  CollaborationEvent,
  EventHandler,
  CursorPosition,
  SelectionRange,
  UserPresence,
  Comment,
  CollaborationParticipant,
  TextOperation
} from './collaboration';

export interface CollaborationEventData {
  sessionId: string;
  userId: string;
  timestamp: number;
  [key: string]: any;
}

export interface CursorEventData extends CollaborationEventData {
  cursor: CursorPosition;
}

export interface SelectionEventData extends CollaborationEventData {
  selection: SelectionRange;
}

export interface PresenceEventData extends CollaborationEventData {
  presence: UserPresence;
}

export interface CommentEventData extends CollaborationEventData {
  comment: Comment;
  recordId: string;
}

export interface TextOperationEventData extends CollaborationEventData {
  operation: TextOperation;
}

export interface UserJoinedEventData extends CollaborationEventData {
  participant: CollaborationParticipant;
}

export interface FieldLockEventData extends CollaborationEventData {
  field: string;
  recordId: string;
  lockType: 'soft' | 'hard';
  duration?: number; // in milliseconds
}

/**
 * Real-time collaboration event manager
 */
export class CollaborationEventManager {
  private wsClient: CollaborationWebSocketClient;
  private eventHandlers = new Map<CollaborationEvent, Set<EventHandler>>();
  private userId: string;
  private sessionId: string | null = null;

  constructor(wsClient: CollaborationWebSocketClient, userId: string) {
    this.wsClient = wsClient;
    this.userId = userId;
    this.setupWebSocketHandlers();
  }

  /**
   * Set the current collaboration session ID
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Add event listener for collaboration events
   */
  on(event: CollaborationEvent, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove event listener for collaboration events
   */
  off(event: CollaborationEvent, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
  }

  /**
   * Emit collaboration event locally and broadcast to other participants
   */
  emit(event: CollaborationEvent, data: CollaborationEventData): void {
    // Emit locally first
    this.emitLocal(event, data);

    // Broadcast to other participants
    this.broadcast(event, data);
  }

  /**
   * Emit event only locally (no broadcast)
   */
  emitLocal(event: CollaborationEvent, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in collaboration event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Broadcast event to other participants via WebSocket
   */
  broadcast(event: CollaborationEvent, data: CollaborationEventData): void {
    if (!this.wsClient.isConnected()) {
      console.warn('Cannot broadcast event: WebSocket not connected');
      return;
    }

    this.wsClient.send('collaboration-event', {
      event,
      data: {
        ...data,
        userId: this.userId,
        timestamp: Date.now()
      }
    }, this.userId);
  }

  /**
   * Broadcast cursor movement
   */
  broadcastCursorMoved(sessionId: string, cursor: CursorPosition): void {
    this.emit('cursor-moved', {
      sessionId,
      userId: this.userId,
      timestamp: Date.now(),
      cursor
    });
  }

  /**
   * Broadcast selection change
   */
  broadcastSelectionChanged(sessionId: string, selection: SelectionRange): void {
    this.emit('selection-changed', {
      sessionId,
      userId: this.userId,
      timestamp: Date.now(),
      selection
    });
  }

  /**
   * Broadcast presence update
   */
  broadcastPresenceUpdated(sessionId: string, presence: UserPresence): void {
    this.emit('presence-updated', {
      sessionId,
      userId: this.userId,
      timestamp: Date.now(),
      presence
    });
  }

  /**
   * Broadcast text operation
   */
  broadcastTextChanged(sessionId: string, operation: TextOperation): void {
    this.emit('text-changed', {
      sessionId,
      userId: this.userId,
      timestamp: Date.now(),
      operation
    });
  }

  /**
   * Broadcast comment addition
   */
  broadcastCommentAdded(recordId: string, comment: Comment): void {
    this.emit('comment-added', {
      sessionId: this.sessionId || '',
      userId: this.userId,
      timestamp: Date.now(),
      recordId,
      comment
    });
  }

  /**
   * Broadcast comment resolution
   */
  broadcastCommentResolved(recordId: string, commentId: string): void {
    this.emit('comment-resolved', {
      sessionId: this.sessionId || '',
      userId: this.userId,
      timestamp: Date.now(),
      recordId,
      commentId
    });
  }

  /**
   * Broadcast user joined event
   */
  broadcastUserJoined(sessionId: string, participant: CollaborationParticipant): void {
    this.emit('user-joined', {
      sessionId,
      userId: this.userId,
      timestamp: Date.now(),
      participant
    });
  }

  /**
   * Broadcast user left event
   */
  broadcastUserLeft(sessionId: string, leftUserId: string): void {
    this.emit('user-left', {
      sessionId,
      userId: this.userId,
      timestamp: Date.now(),
      leftUserId
    });
  }

  /**
   * Broadcast field lock
   */
  broadcastFieldLocked(recordId: string, field: string, lockType: 'soft' | 'hard' = 'soft', duration?: number): void {
    this.emit('field-locked', {
      sessionId: this.sessionId || '',
      userId: this.userId,
      timestamp: Date.now(),
      recordId,
      field,
      lockType,
      duration
    });
  }

  /**
   * Broadcast field unlock
   */
  broadcastFieldUnlocked(recordId: string, field: string): void {
    this.emit('field-unlocked', {
      sessionId: this.sessionId || '',
      userId: this.userId,
      timestamp: Date.now(),
      recordId,
      field
    });
  }

  /**
   * Setup WebSocket message handlers
   */
  private setupWebSocketHandlers(): void {
    this.wsClient.on('collaboration-event', (message: WebSocketMessage) => {
      const { event, data } = message.payload;
      
      // Don't handle our own events
      if (data.userId === this.userId) {
        return;
      }

      // Emit the event locally
      this.emitLocal(event, data);
    });

    // Handle connection state changes
    this.wsClient.on('connection-state-changed', (data) => {
      if (data.state === 'connected') {
        this.emitLocal('connection-restored', { timestamp: Date.now() });
      } else if (data.state === 'disconnected' || data.state === 'failed') {
        this.emitLocal('connection-lost', { timestamp: Date.now(), reason: data.reason });
      }
    });
  }

  /**
   * Get WebSocket connection state
   */
  getConnectionState() {
    return this.wsClient.getConnectionState();
  }

  /**
   * Get connection latency
   */
  getLatency(): number {
    return this.wsClient.getLatency();
  }

  /**
   * Check if connected to real-time collaboration
   */
  isConnected(): boolean {
    return this.wsClient.isConnected();
  }

  /**
   * Disconnect from real-time collaboration
   */
  disconnect(): void {
    this.wsClient.disconnect();
  }
}