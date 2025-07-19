import { ZustandSurrealSyncEngine } from './SyncEngine';
import type { SyncConfig } from '../types';
import { StringRecordId } from 'surrealdb';
import { OperationalTransform } from './operational-transform';
import { CollaborationWebSocketClient, WebSocketConfig } from './websocket-client';
import { CollaborationEventManager } from './collaboration-events';
import { CommentManager } from '../features/comments';
import { FieldLockManager } from '../features/field-locking';
import { PluginManager, type Plugin } from '../features/plugins';
import {
  CollaborationSession,
  CollaborationParticipant,
  UserPresence,
  CursorPosition,
  SelectionRange,
  TextOperation,
  Comment,
  AwarenessState,
  ConflictResolution,
  CollaborationEvent,
  EventHandler,
  BatchOperationBuilder,
  HealthStatus,
  SyncMetrics,
  DeviceInfo
} from './collaboration';

export interface EnhancedSyncConfig extends SyncConfig {
  websocket?: WebSocketConfig;
  collaboration?: {
    enableRealTime?: boolean;
    enableComments?: boolean;
    enableFieldLocking?: boolean;
    autoLockDuration?: number;
  };
}

/**
 * Enhanced sync engine with real-time collaboration capabilities
 * 
 * Extends the base sync engine with Figma/Google Docs level collaboration features:
 * - Real-time cursor tracking and selections
 * - Operational transform for character-level synchronization
 * - User presence and awareness
 * - Comments and annotations with threading and mentions
 * - Field locking and permission management
 * - WebSocket-based real-time communication
 * - Plugin system
 */
export class EnhancedSyncEngine extends ZustandSurrealSyncEngine {
  private userId: string;
  private collaborationSessions = new Map<string, CollaborationSession>();
  private awarenessState = new Map<string, AwarenessState>();
  private conflictHandlers = new Map<string, ConflictResolution>();
  private operationQueue: TextOperation[] = [];
  private pluginManager: PluginManager;
  private collaborationMetrics = {
    activeUsers: 0,
    operationsPerSecond: 0,
    averageResponseTime: 0,
    conflictRate: 0
  };

  // Real-time collaboration components
  private wsClient: CollaborationWebSocketClient | null = null;
  private eventManager: CollaborationEventManager | null = null;
  private commentManager: CommentManager;
  private lockManager: FieldLockManager;
  private deviceInfo: DeviceInfo;

  constructor(config: EnhancedSyncConfig, userId: string) {
    super(config);
    this.userId = userId;
    this.commentManager = new CommentManager();
    this.lockManager = new FieldLockManager();
    this.pluginManager = new PluginManager(this);
    this.deviceInfo = this.detectDeviceInfo();
    this.initializeCollaboration(config);
  }

  private initializeCollaboration(config: EnhancedSyncConfig): void {
    // Initialize WebSocket client if configured
    if (config.websocket && config.collaboration?.enableRealTime !== false) {
      this.wsClient = new CollaborationWebSocketClient(config.websocket);
      this.eventManager = new CollaborationEventManager(this.wsClient, this.userId);
      this.setupCollaborationEventHandlers();
    }

    // Set up field locking event handlers
    this.setupFieldLockingHandlers();

    // Set up periodic cleanup of inactive sessions
    setInterval(() => this.cleanupInactiveSessions(), 30000); // Every 30 seconds

    // Set up metrics collection
    setInterval(() => this.updateCollaborationMetrics(), 5000); // Every 5 seconds
  }

  /**
   * Connect to real-time collaboration
   */
  async connectRealTime(): Promise<void> {
    if (this.wsClient) {
      await this.wsClient.connect();
    }
  }

  /**
   * Disconnect from real-time collaboration
   */
  disconnectRealTime(): void {
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
  }

  /**
   * Start a collaboration session for real-time editing
   * 
   * @param recordId - ID of the record to collaborate on
   * @param userId - ID of the user starting the session
   * @returns Promise resolving to the collaboration session
   */
  async startCollaboration(recordId: string, userId: string): Promise<CollaborationSession> {
    const sessionId = `${recordId}:${userId}:${Date.now()}`;

    const participant: CollaborationParticipant = {
      userId,
      username: userId, // In real implementation, fetch from user service
      color: this.generateUserColor(userId),
      role: 'editor',
      presence: {
        status: 'active',
        isTyping: false,
        lastActivity: Date.now(),
        device: this.deviceInfo
      },
      lastSeen: Date.now(),
      isActive: true
    };

    const session: CollaborationSession = {
      id: sessionId,
      recordId: new StringRecordId(recordId),
      participants: [participant],
      startTime: Date.now(),
      lastActivity: Date.now(),
      permissions: {
        canEdit: true,
        canComment: true,
        canView: true
      },
      settings: {
        enableCursors: true,
        enableSelections: true,
        enableComments: true,
        enablePresence: true,
        autoSaveInterval: 2000,
        conflictResolution: { strategy: 'operational-transform' }
      },
      awareness: {
        participants: new Map([[userId, participant]]),
        cursors: new Map(),
        selections: new Map(),
        activeFields: new Map(),
        comments: []
      }
    };

    // Execute plugin hook for collaboration start
    await this.pluginManager.executeHook('onCollaborationStart', session);

    this.collaborationSessions.set(sessionId, session);
    this.awarenessState.set(sessionId, session.awareness);

    // Set session ID in event manager
    if (this.eventManager) {
      this.eventManager.setSessionId(sessionId);
    }

    // Broadcast session start
    if (this.eventManager) {
      this.eventManager.broadcastUserJoined(sessionId, participant);
    }

    return session;
  }

  /**
   * Update cursor position for real-time collaboration
   * 
   * @param sessionId - ID of the collaboration session
   * @param field - Field name where cursor is positioned
   * @param position - Character position in the field
   */
  async updateCursor(sessionId: string, field: string, position: number): Promise<void> {
    const session = this.collaborationSessions.get(sessionId);
    if (!session) return;

    const cursor: CursorPosition = {
      field,
      position,
      line: this.calculateLineNumber(field, position),
      column: this.calculateColumnNumber(field, position)
    };

    // Update awareness state
    const awareness = this.awarenessState.get(sessionId);
    if (awareness) {
      awareness.cursors.set(this.userId, cursor);

      // Update active fields
      if (!awareness.activeFields.has(field)) {
        awareness.activeFields.set(field, []);
      }
      const activeUsers = awareness.activeFields.get(field)!;
      if (!activeUsers.includes(this.userId)) {
        activeUsers.push(this.userId);
      }
    }

    // Update participant cursor
    const participant = session.participants.find(p => p.userId === this.userId);
    if (participant) {
      participant.cursor = cursor;
      participant.lastSeen = Date.now();
    }

    // Broadcast cursor update via event manager
    if (this.eventManager) {
      this.eventManager.broadcastCursorMoved(sessionId, cursor);
    }
  }

  /**
   * Update text selection for real-time collaboration
   * 
   * @param sessionId - ID of the collaboration session
   * @param field - Field name where selection is made
   * @param start - Start position of selection
   * @param end - End position of selection
   */
  async updateSelection(sessionId: string, field: string, start: number, end: number): Promise<void> {
    const session = this.collaborationSessions.get(sessionId);
    if (!session) return;

    const selection: SelectionRange = {
      field,
      start,
      end,
      startLine: this.calculateLineNumber(field, start),
      startColumn: this.calculateColumnNumber(field, start),
      endLine: this.calculateLineNumber(field, end),
      endColumn: this.calculateColumnNumber(field, end)
    };

    // Update awareness state
    const awareness = this.awarenessState.get(sessionId);
    if (awareness) {
      awareness.selections.set(this.userId, selection);
    }

    // Update participant selection
    const participant = session.participants.find(p => p.userId === this.userId);
    if (participant) {
      participant.selection = selection;
      participant.lastSeen = Date.now();
    }

    // Broadcast selection update via event manager
    if (this.eventManager) {
      this.eventManager.broadcastSelectionChanged(sessionId, selection);
    }
  }

  /**
   * Broadcast user presence information
   * 
   * @param sessionId - ID of the collaboration session
   * @param presence - User presence information
   */
  async broadcastPresence(sessionId: string, presence: UserPresence): Promise<void> {
    const session = this.collaborationSessions.get(sessionId);
    if (!session) return;

    // Update participant presence
    const participant = session.participants.find(p => p.userId === this.userId);
    if (participant) {
      participant.presence = { ...participant.presence, ...presence };
      participant.lastSeen = Date.now();
      participant.isActive = presence.status === 'active';
    }

    // Broadcast presence update via event manager
    if (this.eventManager) {
      this.eventManager.broadcastPresenceUpdated(sessionId, presence);
    }
  }

  /**
   * Send a comment on a specific field
   * 
   * @param recordId - ID of the record being commented on
   * @param comment - Comment data
   */
  async sendComment(recordId: string, comment: Omit<Comment, 'id' | 'timestamp'>): Promise<Comment> {
    const fullComment = await this.commentManager.createComment(
      new StringRecordId(recordId),
      comment.field,
      comment.position,
      comment.length,
      comment.content,
      comment.author,
      comment.mentions
    );

    // Execute plugin hook for comment added
    await this.pluginManager.executeHook('onCommentAdded', fullComment);

    // Add to awareness state
    const sessions = Array.from(this.collaborationSessions.values())
      .filter(session => String(session.recordId) === recordId);

    for (const session of sessions) {
      const awareness = this.awarenessState.get(session.id);
      if (awareness) {
        awareness.comments.push(fullComment);
      }
    }

    // Broadcast comment via event manager
    if (this.eventManager) {
      this.eventManager.broadcastCommentAdded(recordId, fullComment);
    }

    return fullComment;
  }

  /**
   * Register field-level conflict resolution strategy
   * 
   * @param table - Table name
   * @param resolution - Conflict resolution configuration
   */
  setConflictResolution(table: string, resolution: ConflictResolution): void {
    this.conflictHandlers.set(table, resolution);
  }

  /**
   * Apply a text operation with operational transform
   * 
   * @param sessionId - ID of the collaboration session
   * @param operation - Text operation to apply
   */
  async applyTextOperation(sessionId: string, operation: TextOperation): Promise<void> {
    if (!OperationalTransform.validate(operation)) {
      throw new Error('Invalid text operation');
    }

    const session = this.collaborationSessions.get(sessionId);
    if (!session) {
      throw new Error('Collaboration session not found');
    }

    // Execute plugin hook for text operation
    const processedOperation = await this.pluginManager.executeHook('onTextOperation', operation);

    // Check field lock before applying operation
    const recordId = String(session.recordId);
    if (this.lockManager.isFieldLocked(new StringRecordId(recordId), processedOperation.field)) {
      const lock = this.lockManager.getFieldLock(new StringRecordId(recordId), processedOperation.field);
      if (lock && lock.lockedBy !== this.userId) {
        throw new Error(`Field ${processedOperation.field} is locked by ${lock.lockedBy}`);
      }
    }

    // Transform operation against concurrent operations
    const transformedOp = await this.transformAgainstConcurrentOps(processedOperation);

    // Apply operation to local state
    await this.applyOperationToState(transformedOp);

    // Queue operation for synchronization
    this.operationQueue.push(transformedOp);

    // Broadcast operation via event manager
    if (this.eventManager) {
      this.eventManager.broadcastTextChanged(sessionId, transformedOp);
    }
  }

  /**
   * Transform one operation against another for concurrent editing
   * 
   * @param op1 - First operation
   * @param op2 - Second operation
   * @returns Transformed operation
   */
  async transformOperation(op1: TextOperation, op2: TextOperation): Promise<TextOperation> {
    return OperationalTransform.transform(op1, op2);
  }

  /**
   * Create a batch operation builder for grouping multiple operations
   * 
   * @returns Batch operation builder
   */
  createBatch(): BatchOperationBuilder {
    const operations: TextOperation[] = [];
    const comments: Comment[] = [];
    let cursor: CursorPosition | null = null;
    let selection: SelectionRange | null = null;

    const builder: BatchOperationBuilder = {
      addOperation: (operation: TextOperation) => {
        operations.push(operation);
        return builder;
      },

      addComment: (comment: Comment) => {
        comments.push(comment);
        return builder;
      },

      updateCursor: (cursorPos: CursorPosition) => {
        cursor = cursorPos;
        return builder;
      },

      updateSelection: (selectionRange: SelectionRange) => {
        selection = selectionRange;
        return builder;
      },

      execute: async () => {
        // Apply all operations in order
        for (const op of operations) {
          const transformedOp = await this.transformAgainstConcurrentOps(op);
          await this.applyOperationToState(transformedOp);
          this.operationQueue.push(transformedOp);
        }

        // Add comments
        for (const comment of comments) {
          // Find relevant sessions and add comment
          const sessions = Array.from(this.collaborationSessions.values())
            .filter(session => String(session.recordId) === String(comment.recordId));

          for (const session of sessions) {
            const awareness = this.awarenessState.get(session.id);
            if (awareness) {
              awareness.comments.push(comment);
            }
          }
        }

        // Update cursor and selection
        if (cursor || selection) {
          const sessionId = Array.from(this.collaborationSessions.keys())[0];
          if (sessionId) {
            if (cursor) await this.updateCursor(sessionId, cursor.field, cursor.position);
            if (selection) await this.updateSelection(sessionId, selection.field, selection.start, selection.end);
          }
        }
      },

      clear: () => {
        operations.length = 0;
        comments.length = 0;
        cursor = null;
        selection = null;
        return builder;
      }
    };

    this.batchOperations = builder;
    return builder;
  }

  /**
   * Register a plugin with the sync engine
   * 
   * @param plugin - Plugin to register
   */
  async use(plugin: Plugin): Promise<void> {
    const result = await this.pluginManager.register(plugin);
    
    if (!result.success) {
      throw new Error(`Failed to register plugin ${plugin.name}: ${result.error}`);
    }
    
    if (result.warnings && result.warnings.length > 0) {
      console.warn(`Plugin ${plugin.name} registered with warnings:`, result.warnings);
    }
  }

  /**
   * Unregister a plugin
   * 
   * @param pluginName - Name of plugin to unregister
   */
  async unuse(pluginName: string): Promise<boolean> {
    return await this.pluginManager.unregister(pluginName);
  }

  /**
   * Get registered plugins
   * 
   * @returns Array of registered plugins
   */
  getPlugins(): Plugin[] {
    return this.pluginManager.listPlugins();
  }

  /**
   * Check if a plugin is registered
   * 
   * @param pluginName - Name of plugin to check
   * @returns Whether plugin is registered
   */
  hasPlugin(pluginName: string): boolean {
    return this.pluginManager.hasPlugin(pluginName);
  }

  /**
   * Execute a plugin operation
   * 
   * @param operationName - Name of operation to execute
   * @param data - Data to pass to operation
   * @param pluginName - Specific plugin to execute operation on (optional)
   * @returns Operation result
   */
  async executePluginOperation(operationName: string, data: any, pluginName?: string): Promise<any> {
    return await this.pluginManager.executeOperation(operationName, data, pluginName);
  }

  /**
   * Get enhanced sync metrics including collaboration data
   * 
   * @returns Enhanced sync metrics
   */
  override getMetrics(): SyncMetrics {
    const baseMetrics = super.getMetrics();

    return {
      ...baseMetrics,
      collaborationMetrics: { ...this.collaborationMetrics }
    };
  }

  /**
   * Perform health check on collaboration features
   * 
   * @returns Health status
   */
  async healthCheck(): Promise<HealthStatus> {
    const errors: string[] = [];
    let latency = 0;

    try {
      // Test database connection
      if (!this.dbAdapter?.isConnected()) {
        errors.push('Database not connected');
      }

      // Measure latency with a simple ping
      const start = Date.now();
      await this.dbAdapter?.select('ping_test');
      latency = Date.now() - start;

    } catch (error) {
      errors.push(`Health check failed: ${error}`);
    }

    return {
      connected: this.dbAdapter?.isConnected() ?? false,
      latency,
      collaborationActive: this.collaborationSessions.size > 0,
      activeSessions: this.collaborationSessions.size,
      errors
    };
  }

  /**
   * Reply to a comment
   */
  async replyToComment(commentId: string, content: string, mentions: string[] = []): Promise<void> {
    await this.commentManager.replyToComment(commentId, content, this.userId, mentions);
  }

  /**
   * Resolve a comment
   */
  async resolveComment(commentId: string): Promise<void> {
    await this.commentManager.resolveComment(commentId, this.userId);
    
    if (this.eventManager) {
      const comment = this.commentManager.getComment(commentId);
      if (comment) {
        this.eventManager.broadcastCommentResolved(String(comment.recordId), commentId);
      }
    }
  }

  /**
   * Get comments for a record
   */
  getComments(recordId: string): Comment[] {
    return this.commentManager.getCommentsForRecord(new StringRecordId(recordId));
  }

  /**
   * Request field lock
   */
  async requestFieldLock(recordId: string, field: string, lockType: 'soft' | 'hard' = 'soft', duration?: number): Promise<boolean> {
    const result = await this.lockManager.requestLock({
      recordId: new StringRecordId(recordId),
      field,
      userId: this.userId,
      lockType,
      duration
    });

    if (result.success && this.eventManager) {
      this.eventManager.broadcastFieldLocked(recordId, field, lockType, duration);
    }

    return result.success;
  }

  /**
   * Release field lock
   */
  async releaseFieldLock(recordId: string, field: string): Promise<boolean> {
    const success = await this.lockManager.releaseLock(new StringRecordId(recordId), field, this.userId);
    
    if (success && this.eventManager) {
      this.eventManager.broadcastFieldUnlocked(recordId, field);
    }

    return success;
  }

  /**
   * Check if field is locked
   */
  isFieldLocked(recordId: string, field: string): boolean {
    return this.lockManager.isFieldLocked(new StringRecordId(recordId), field);
  }

  /**
   * Get field lock information
   */
  getFieldLock(recordId: string, field: string) {
    return this.lockManager.getFieldLock(new StringRecordId(recordId), field);
  }

  /**
   * Add event listener for collaboration events
   * 
   * @param event - Event type to listen for
   * @param handler - Event handler function
   */
  override on(event: CollaborationEvent, handler: EventHandler): void {
    if (this.eventManager) {
      this.eventManager.on(event, handler);
    }
  }

  /**
   * Remove event listener for collaboration events
   * 
   * @param event - Event type to stop listening for
   * @param handler - Event handler function to remove
   */
  override off(event: CollaborationEvent, handler: EventHandler): void {
    if (this.eventManager) {
      this.eventManager.off(event, handler);
    }
  }

  /**
   * Setup collaboration event handlers
   */
  private setupCollaborationEventHandlers(): void {
    if (!this.eventManager) return;

    // Handle incoming collaboration events
    this.eventManager.on('cursor-moved', (data) => {
      this.handleRemoteCursorUpdate(data);
    });

    this.eventManager.on('selection-changed', (data) => {
      this.handleRemoteSelectionUpdate(data);
    });

    this.eventManager.on('text-changed', (data) => {
      this.handleRemoteTextOperation(data);
    });

    this.eventManager.on('presence-updated', (data) => {
      this.handleRemotePresenceUpdate(data);
    });

    this.eventManager.on('comment-added', (data) => {
      this.handleRemoteCommentAdded(data);
    });

    this.eventManager.on('user-joined', (data) => {
      this.handleUserJoined(data);
    });

    this.eventManager.on('user-left', (data) => {
      this.handleUserLeft(data);
    });

    this.eventManager.on('field-locked', (data) => {
      this.handleFieldLocked(data);
    });

    this.eventManager.on('field-unlocked', (data) => {
      this.handleFieldUnlocked(data);
    });
  }

  /**
   * Setup field locking event handlers
   */
  private setupFieldLockingHandlers(): void {
    this.lockManager.on('lock_acquired', (event, data) => {
      console.log(`Field lock acquired: ${data.lock.field} by ${data.lock.lockedBy}`);
    });

    this.lockManager.on('lock_released', (event, data) => {
      console.log(`Field lock released: ${data.lock.field} by ${data.lock.lockedBy}`);
    });

    this.lockManager.on('lock_conflict', (event, data) => {
      console.warn(`Field lock conflict: ${data.conflict.conflictType}`);
    });
  }

  /**
   * Transform operation against concurrent operations
   * 
   * @param operation - Operation to transform
   * @returns Transformed operation
   */
  private async transformAgainstConcurrentOps(operation: TextOperation): Promise<TextOperation> {
    let transformedOp = operation;

    // Get recent operations on the same field
    const recentOps = this.operationQueue.filter(op =>
      op.field === operation.field &&
      op.userId !== operation.userId &&
      Math.abs(op.timestamp - operation.timestamp) < 5000 // Within 5 seconds
    );

    // Transform against each concurrent operation
    for (const concurrentOp of recentOps) {
      transformedOp = OperationalTransform.transform(transformedOp, concurrentOp);
    }

    return transformedOp;
  }

  /**
   * Apply operation to local state
   * 
   * @param operation - Operation to apply
   */
  private async applyOperationToState(operation: TextOperation): Promise<void> {
    // Find the store and table for this operation
    const table = operation.field.split('.')[0]; // Assume field format is "table.field"
    const store = this.stores.get(table);

    if (!store) return;

    const currentState = store.getState();
    const fieldPath = operation.field.split('.').slice(1).join('.');
    const currentValue = this.getNestedValue(currentState, fieldPath);

    if (typeof currentValue === 'string') {
      const newValue = OperationalTransform.apply(currentValue, operation);
      const newState = this.setNestedValue(currentState, fieldPath, newValue);
      store.setState(newState, true); // Use replace=true to avoid sync loop
    }
  }

  /**
   * Handle remote cursor update
   */
  private handleRemoteCursorUpdate(data: any): void {
    const { sessionId, cursor } = data;
    const session = this.collaborationSessions.get(sessionId);
    if (!session) return;

    const awareness = this.awarenessState.get(sessionId);
    if (awareness) {
      awareness.cursors.set(data.userId, cursor);
    }

    // Update participant cursor
    const participant = session.participants.find(p => p.userId === data.userId);
    if (participant) {
      participant.cursor = cursor;
      participant.lastSeen = Date.now();
    }
  }

  /**
   * Handle remote selection update
   */
  private handleRemoteSelectionUpdate(data: any): void {
    const { sessionId, selection } = data;
    const session = this.collaborationSessions.get(sessionId);
    if (!session) return;

    const awareness = this.awarenessState.get(sessionId);
    if (awareness) {
      awareness.selections.set(data.userId, selection);
    }

    // Update participant selection
    const participant = session.participants.find(p => p.userId === data.userId);
    if (participant) {
      participant.selection = selection;
      participant.lastSeen = Date.now();
    }
  }

  /**
   * Handle remote text operation
   */
  private async handleRemoteTextOperation(data: any): Promise<void> {
    const { operation } = data;
    
    // Transform against local operations
    const transformedOp = await this.transformAgainstConcurrentOps(operation);
    
    // Apply to local state
    await this.applyOperationToState(transformedOp);
    
    // Add to operation queue
    this.operationQueue.push(transformedOp);
  }

  /**
   * Handle remote presence update
   */
  private handleRemotePresenceUpdate(data: any): void {
    const { sessionId, presence } = data;
    const session = this.collaborationSessions.get(sessionId);
    if (!session) return;

    // Update participant presence
    const participant = session.participants.find(p => p.userId === data.userId);
    if (participant) {
      participant.presence = { ...participant.presence, ...presence };
      participant.lastSeen = Date.now();
      participant.isActive = presence.status === 'active';
    }
  }

  /**
   * Handle remote comment added
   */
  private handleRemoteCommentAdded(data: any): void {
    const { comment } = data;
    
    // Add to awareness state
    const sessions = Array.from(this.collaborationSessions.values())
      .filter(session => String(session.recordId) === data.recordId);

    for (const session of sessions) {
      const awareness = this.awarenessState.get(session.id);
      if (awareness) {
        awareness.comments.push(comment);
      }
    }
  }

  /**
   * Handle user joined
   */
  private handleUserJoined(data: any): void {
    const { sessionId, participant } = data;
    const session = this.collaborationSessions.get(sessionId);
    if (!session) return;

    // Add participant if not already present
    const existingParticipant = session.participants.find(p => p.userId === participant.userId);
    if (!existingParticipant) {
      session.participants.push(participant);
      
      const awareness = this.awarenessState.get(sessionId);
      if (awareness) {
        awareness.participants.set(participant.userId, participant);
      }
    }
  }

  /**
   * Handle user left
   */
  private handleUserLeft(data: any): void {
    const { sessionId, leftUserId } = data;
    const session = this.collaborationSessions.get(sessionId);
    if (!session) return;

    // Remove participant
    session.participants = session.participants.filter(p => p.userId !== leftUserId);
    
    const awareness = this.awarenessState.get(sessionId);
    if (awareness) {
      awareness.participants.delete(leftUserId);
      awareness.cursors.delete(leftUserId);
      awareness.selections.delete(leftUserId);
    }
  }

  /**
   * Handle field locked
   */
  private handleFieldLocked(data: any): void {
    console.log(`Field ${data.field} locked by ${data.userId}`);
  }

  /**
   * Handle field unlocked
   */
  private handleFieldUnlocked(data: any): void {
    console.log(`Field ${data.field} unlocked by ${data.userId}`);
  }

  /**
   * Generate a unique color for a user
   * 
   * @param userId - User ID
   * @returns Hex color string
   */
  private generateUserColor(userId: string): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];

    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Calculate line number for a position in text
   * 
   * @param field - Field name
   * @param position - Character position
   * @returns Line number (1-based)
   */
  private calculateLineNumber(field: string, position: number): number {
    // This would need access to the actual text content
    // For now, return a simple calculation
    return Math.floor(position / 80) + 1; // Assume 80 chars per line
  }

  /**
   * Calculate column number for a position in text
   * 
   * @param field - Field name
   * @param position - Character position
   * @returns Column number (1-based)
   */
  private calculateColumnNumber(field: string, position: number): number {
    // This would need access to the actual text content
    // For now, return a simple calculation
    return (position % 80) + 1; // Assume 80 chars per line
  }

  /**
   * Detect device information
   * 
   * @returns Device information
   */
  private detectDeviceInfo(): DeviceInfo {
    if (typeof window === 'undefined') {
      return {
        type: 'desktop',
        os: 'unknown',
        browser: 'unknown',
        screenSize: { width: 1920, height: 1080 },
        touchSupport: false,
        penSupport: false
      };
    }

    return {
      type: window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
      os: navigator.platform,
      browser: navigator.userAgent.split(' ')[0],
      screenSize: { width: window.screen.width, height: window.screen.height },
      touchSupport: 'ontouchstart' in window,
      penSupport: 'onpointerdown' in window
    };
  }

  /**
   * Clean up inactive collaboration sessions
   */
  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [sessionId, session] of this.collaborationSessions) {
      if (now - session.lastActivity > inactiveThreshold) {
        this.collaborationSessions.delete(sessionId);
        this.awarenessState.delete(sessionId);

        this.emitCollaborationEvent('user-left', {
          sessionId,
          userId: this.userId,
          timestamp: now
        });
      }
    }
  }

  /**
   * Update collaboration metrics
   */
  private updateCollaborationMetrics(): void {
    this.collaborationMetrics.activeUsers = Array.from(this.collaborationSessions.values())
      .reduce((total, session) => total + session.participants.filter(p => p.isActive).length, 0);

    // Calculate operations per second from recent operations
    const now = Date.now();
    const recentOps = this.operationQueue.filter(op => now - op.timestamp < 1000);
    this.collaborationMetrics.operationsPerSecond = recentOps.length;

    // Update conflict rate (simplified calculation)
    const totalOps = this.operationQueue.length;
    const conflicts = this.operationQueue.filter(op =>
      this.operationQueue.some(other =>
        other.id !== op.id &&
        other.field === op.field &&
        Math.abs(other.timestamp - op.timestamp) < 1000
      )
    ).length;

    this.collaborationMetrics.conflictRate = totalOps > 0 ? (conflicts / totalOps) * 100 : 0;
  }

  /**
   * Shutdown the enhanced sync engine and clean up resources
   */
  override async shutdown(): Promise<void> {
    // Disconnect from real-time collaboration
    this.disconnectRealTime();

    // Clean up plugins
    for (const plugin of this.plugins.values()) {
      if (plugin.destroy) {
        try {
          await plugin.destroy();
        } catch (error) {
          console.error(`Error destroying plugin ${plugin.name}:`, error);
        }
      }
    }

    // Clear collaboration sessions
    this.collaborationSessions.clear();
    this.awarenessState.clear();
    this.operationQueue.length = 0;

    // Call parent shutdown
    await super.shutdown();
  }

  /**
   * Get active collaboration sessions for a record
   * 
   * @param recordId - Record ID to check
   * @returns Array of active collaboration sessions
   */
  getActiveCollaborationSessions(recordId: string): CollaborationSession[] {
    return Array.from(this.collaborationSessions.values())
      .filter(session => String(session.recordId) === recordId);
  }

  /**
   * Check if a field is currently being edited by another user
   * 
   * @param recordId - Record ID
   * @param field - Field name
   * @returns Whether field is being edited by another user
   */
  isFieldBeingEdited(recordId: string, field: string): boolean {
    const sessions = this.getActiveCollaborationSessions(recordId);

    for (const session of sessions) {
      const awareness = this.awarenessState.get(session.id);
      if (awareness) {
        const activeUsers = awareness.activeFields.get(field) || [];
        if (activeUsers.some(userId => userId !== this.userId)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get users currently editing a specific field
   * 
   * @param recordId - Record ID
   * @param field - Field name
   * @returns Array of user IDs editing the field
   */
  getFieldEditors(recordId: string, field: string): string[] {
    const sessions = this.getActiveCollaborationSessions(recordId);
    const editors: string[] = [];

    for (const session of sessions) {
      const awareness = this.awarenessState.get(session.id);
      if (awareness) {
        const activeUsers = awareness.activeFields.get(field) || [];
        editors.push(...activeUsers.filter(userId => userId !== this.userId));
      }
    }

    return [...new Set(editors)]; // Remove duplicates
  }
}