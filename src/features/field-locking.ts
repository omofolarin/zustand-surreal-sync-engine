/**
 * Field locking and permission management system
 * 
 * Provides fine-grained field-level locking and permissions for collaborative editing,
 * preventing conflicts and managing access control.
 */

import type { StringRecordId } from 'surrealdb';

export interface FieldLock {
  id: string;
  recordId: StringRecordId;
  field: string;
  lockedBy: string;
  lockType: 'soft' | 'hard';
  timestamp: number;
  expiresAt?: number;
  reason?: string;
  metadata: FieldLockMetadata;
}

export interface FieldLockMetadata {
  sessionId?: string;
  clientId?: string;
  lockDuration?: number;
  autoRelease: boolean;
  priority: number;
  context?: string;
}

export interface FieldPermission {
  recordId: StringRecordId;
  field: string;
  userId: string;
  permissions: {
    read: boolean;
    write: boolean;
    comment: boolean;
    lock: boolean;
    admin: boolean;
  };
  conditions?: PermissionCondition[];
  expiresAt?: number;
  grantedBy: string;
  grantedAt: number;
}

export interface PermissionCondition {
  type: 'time_range' | 'user_role' | 'field_value' | 'custom';
  condition: any;
  description: string;
}

export interface LockRequest {
  recordId: StringRecordId;
  field: string;
  userId: string;
  lockType: 'soft' | 'hard';
  duration?: number;
  reason?: string;
  force?: boolean;
}

export interface LockConflict {
  requestedLock: LockRequest;
  existingLock: FieldLock;
  conflictType: 'user_conflict' | 'type_conflict' | 'permission_denied';
  canOverride: boolean;
  resolution?: 'queue' | 'reject' | 'force' | 'negotiate';
}

export type LockEventType = 'lock_acquired' | 'lock_released' | 'lock_expired' | 'lock_conflict' | 'permission_changed';

export interface LockEventHandler {
  (event: LockEventType, data: any): void;
}

/**
 * Field locking and permission manager
 */
export class FieldLockManager {
  private locks = new Map<string, FieldLock>();
  private permissions = new Map<string, FieldPermission[]>();
  private lockQueue = new Map<string, LockRequest[]>();
  private eventHandlers = new Map<LockEventType, Set<LockEventHandler>>();
  private lockTimers = new Map<string, NodeJS.Timeout>();

  constructor() {
    // Start cleanup timer for expired locks
    setInterval(() => this.cleanupExpiredLocks(), 30000); // Every 30 seconds
  }

  /**
   * Request a field lock
   */
  async requestLock(request: LockRequest): Promise<{ success: boolean; lock?: FieldLock; conflict?: LockConflict }> {
    const lockKey = this.getLockKey(request.recordId, request.field);
    const existingLock = this.locks.get(lockKey);

    // Check permissions first
    if (!await this.hasPermission(request.recordId, request.field, request.userId, 'lock')) {
      return {
        success: false,
        conflict: {
          requestedLock: request,
          existingLock: existingLock!,
          conflictType: 'permission_denied',
          canOverride: false
        }
      };
    }

    // Check for existing lock
    if (existingLock && !this.isLockExpired(existingLock)) {
      const conflict = this.analyzeConflict(request, existingLock);

      if (!request.force && !conflict.canOverride) {
        // Queue the request if it's a soft lock conflict
        if (conflict.conflictType !== 'permission_denied') {
          this.queueLockRequest(lockKey, request);
        }

        this.emit('lock_conflict', { conflict });
        return { success: false, conflict };
      }

      // Force release existing lock if allowed
      if (request.force && conflict.canOverride) {
        await this.releaseLock(existingLock.recordId, existingLock.field, request.userId, 'forced');
      }
    }

    // Create the lock
    const lock = this.createLock(request);
    this.locks.set(lockKey, lock);

    // Set up auto-release timer if duration is specified
    if (lock.expiresAt) {
      const timeout = setTimeout(() => {
        this.releaseLock(lock.recordId, lock.field, lock.lockedBy, 'expired');
      }, lock.expiresAt - Date.now());

      this.lockTimers.set(lock.id, timeout);
    }

    this.emit('lock_acquired', { lock });
    return { success: true, lock };
  }

  /**
   * Release a field lock
   */
  async releaseLock(
    recordId: StringRecordId,
    field: string,
    userId: string,
    reason: 'manual' | 'expired' | 'forced' = 'manual'
  ): Promise<boolean> {
    const lockKey = this.getLockKey(recordId, field);
    const lock = this.locks.get(lockKey);

    if (!lock) {
      return false;
    }

    // Check if user can release this lock
    if (lock.lockedBy !== userId && !await this.hasPermission(recordId, field, userId, 'admin')) {
      return false;
    }

    // Clear timer if exists
    const timer = this.lockTimers.get(lock.id);
    if (timer) {
      clearTimeout(timer);
      this.lockTimers.delete(lock.id);
    }

    // Remove lock
    this.locks.delete(lockKey);

    this.emit('lock_released', { lock, reason });

    // Process queued requests
    await this.processQueuedRequests(lockKey);

    return true;
  }

  /**
   * Check if a field is locked
   */
  isFieldLocked(recordId: StringRecordId, field: string): boolean {
    const lockKey = this.getLockKey(recordId, field);
    const lock = this.locks.get(lockKey);

    return lock ? !this.isLockExpired(lock) : false;
  }

  /**
   * Get field lock information
   */
  getFieldLock(recordId: StringRecordId, field: string): FieldLock | undefined {
    const lockKey = this.getLockKey(recordId, field);
    const lock = this.locks.get(lockKey);

    return lock && !this.isLockExpired(lock) ? lock : undefined;
  }

  /**
   * Get all locks for a record
   */
  getRecordLocks(recordId: StringRecordId): FieldLock[] {
    return Array.from(this.locks.values())
      .filter(lock => String(lock.recordId) === String(recordId) && !this.isLockExpired(lock));
  }

  /**
   * Get all locks held by a user
   */
  getUserLocks(userId: string): FieldLock[] {
    return Array.from(this.locks.values())
      .filter(lock => lock.lockedBy === userId && !this.isLockExpired(lock));
  }

  /**
   * Set field permissions for a user
   */
  async setFieldPermission(permission: Omit<FieldPermission, 'grantedAt'>): Promise<void> {
    const permissionKey = this.getPermissionKey(permission.recordId, permission.field);

    if (!this.permissions.has(permissionKey)) {
      this.permissions.set(permissionKey, []);
    }

    const permissions = this.permissions.get(permissionKey)!;
    const existingIndex = permissions.findIndex(p => p.userId === permission.userId);

    const fullPermission: FieldPermission = {
      ...permission,
      grantedAt: Date.now()
    };

    if (existingIndex >= 0) {
      permissions[existingIndex] = fullPermission;
    } else {
      permissions.push(fullPermission);
    }

    this.emit('permission_changed', { permission: fullPermission, action: 'granted' });
  }

  /**
   * Remove field permissions for a user
   */
  async removeFieldPermission(recordId: StringRecordId, field: string, userId: string): Promise<boolean> {
    const permissionKey = this.getPermissionKey(recordId, field);
    const permissions = this.permissions.get(permissionKey);

    if (!permissions) {
      return false;
    }

    const index = permissions.findIndex(p => p.userId === userId);
    if (index >= 0) {
      const removedPermission = permissions.splice(index, 1)[0];
      this.emit('permission_changed', { permission: removedPermission, action: 'revoked' });
      return true;
    }

    return false;
  }

  /**
   * Check if user has specific permission for a field
   */
  async hasPermission(
    recordId: StringRecordId,
    field: string,
    userId: string,
    action: keyof FieldPermission['permissions']
  ): Promise<boolean> {
    const permissionKey = this.getPermissionKey(recordId, field);
    const permissions = this.permissions.get(permissionKey) || [];

    const userPermission = permissions.find(p => p.userId === userId);
    if (!userPermission) {
      // Default permissions if none specified - allow all actions by default
      return true;
    }

    // Check if permission is expired
    if (userPermission.expiresAt && Date.now() > userPermission.expiresAt) {
      return false;
    }

    // Check conditions
    if (userPermission.conditions && !await this.evaluateConditions(userPermission.conditions, { userId, recordId, field })) {
      return false;
    }

    return userPermission.permissions[action];
  }

  /**
   * Get field permissions for a user
   */
  getFieldPermissions(recordId: StringRecordId, field: string, userId: string): FieldPermission | undefined {
    const permissionKey = this.getPermissionKey(recordId, field);
    const permissions = this.permissions.get(permissionKey) || [];

    return permissions.find(p => p.userId === userId);
  }

  /**
   * Get all permissions for a record
   */
  getRecordPermissions(recordId: StringRecordId): FieldPermission[] {
    const allPermissions: FieldPermission[] = [];

    for (const [key, permissions] of this.permissions) {
      if (key.startsWith(String(recordId))) {
        allPermissions.push(...permissions);
      }
    }

    return allPermissions;
  }

  /**
   * Extend lock duration
   */
  async extendLock(recordId: StringRecordId, field: string, userId: string, additionalTime: number): Promise<boolean> {
    const lockKey = this.getLockKey(recordId, field);
    const lock = this.locks.get(lockKey);

    if (!lock || lock.lockedBy !== userId) {
      return false;
    }

    if (lock.expiresAt) {
      lock.expiresAt += additionalTime;

      // Update timer
      const timer = this.lockTimers.get(lock.id);
      if (timer) {
        clearTimeout(timer);
      }

      const newTimeout = setTimeout(() => {
        this.releaseLock(lock.recordId, lock.field, lock.lockedBy, 'expired');
      }, lock.expiresAt - Date.now());

      this.lockTimers.set(lock.id, newTimeout);
    }

    return true;
  }

  /**
   * Add event listener
   */
  on(event: LockEventType, handler: LockEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove event listener
   */
  off(event: LockEventType, handler: LockEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
  }

  /**
   * Get lock statistics
   */
  getLockStats(): {
    totalLocks: number;
    softLocks: number;
    hardLocks: number;
    expiredLocks: number;
    queuedRequests: number;
    locksByUser: Record<string, number>;
  } {
    const locks = Array.from(this.locks.values());
    const expiredLocks = locks.filter(lock => this.isLockExpired(lock));
    const activeLocks = locks.filter(lock => !this.isLockExpired(lock));

    const locksByUser: Record<string, number> = {};
    activeLocks.forEach(lock => {
      locksByUser[lock.lockedBy] = (locksByUser[lock.lockedBy] || 0) + 1;
    });

    const queuedRequests = Array.from(this.lockQueue.values())
      .reduce((total, queue) => total + queue.length, 0);

    return {
      totalLocks: activeLocks.length,
      softLocks: activeLocks.filter(lock => lock.lockType === 'soft').length,
      hardLocks: activeLocks.filter(lock => lock.lockType === 'hard').length,
      expiredLocks: expiredLocks.length,
      queuedRequests,
      locksByUser
    };
  }

  /**
   * Create a field lock
   */
  private createLock(request: LockRequest): FieldLock {
    const now = Date.now();
    const expiresAt = request.duration ? now + request.duration : undefined;

    return {
      id: crypto.randomUUID(),
      recordId: request.recordId,
      field: request.field,
      lockedBy: request.userId,
      lockType: request.lockType,
      timestamp: now,
      expiresAt,
      reason: request.reason,
      metadata: {
        lockDuration: request.duration,
        autoRelease: !!request.duration,
        priority: request.lockType === 'hard' ? 10 : 5,
        context: 'collaborative_editing'
      }
    };
  }

  /**
   * Analyze lock conflict
   */
  private analyzeConflict(request: LockRequest, existingLock: FieldLock): LockConflict {
    let conflictType: LockConflict['conflictType'];
    let canOverride = false;

    if (existingLock.lockedBy === request.userId) {
      // Same user, can always override
      conflictType = 'user_conflict';
      canOverride = true;
    } else if (request.lockType === 'hard' && existingLock.lockType === 'soft') {
      // Hard lock can override soft lock
      conflictType = 'type_conflict';
      canOverride = true;
    } else if (request.lockType === 'soft' && existingLock.lockType === 'hard') {
      // Soft lock cannot override hard lock
      conflictType = 'type_conflict';
      canOverride = false;
    } else {
      // Same lock type, different users
      conflictType = 'user_conflict';
      canOverride = request.force || false;
    }

    return {
      requestedLock: request,
      existingLock,
      conflictType,
      canOverride,
      resolution: canOverride ? 'force' : 'queue'
    };
  }

  /**
   * Queue a lock request
   */
  private queueLockRequest(lockKey: string, request: LockRequest): void {
    if (!this.lockQueue.has(lockKey)) {
      this.lockQueue.set(lockKey, []);
    }

    const queue = this.lockQueue.get(lockKey)!;

    // Insert based on priority (hard locks first, then by timestamp)
    const insertIndex = queue.findIndex(queuedRequest =>
      queuedRequest.lockType === 'soft' && request.lockType === 'hard'
    );

    if (insertIndex >= 0) {
      queue.splice(insertIndex, 0, request);
    } else {
      queue.push(request);
    }
  }

  /**
   * Process queued lock requests
   */
  private async processQueuedRequests(lockKey: string): Promise<void> {
    const queue = this.lockQueue.get(lockKey);
    if (!queue || queue.length === 0) {
      return;
    }

    const nextRequest = queue.shift()!;
    const result = await this.requestLock(nextRequest);

    if (!result.success && result.conflict) {
      // If still conflicts, put back in queue
      queue.unshift(nextRequest);
    }
  }

  /**
   * Check if lock is expired
   */
  private isLockExpired(lock: FieldLock): boolean {
    return lock.expiresAt ? Date.now() > lock.expiresAt : false;
  }

  /**
   * Clean up expired locks
   */
  private cleanupExpiredLocks(): void {
    const now = Date.now();
    const expiredLocks: FieldLock[] = [];

    for (const [key, lock] of this.locks) {
      if (this.isLockExpired(lock)) {
        expiredLocks.push(lock);
        this.locks.delete(key);

        // Clear timer
        const timer = this.lockTimers.get(lock.id);
        if (timer) {
          clearTimeout(timer);
          this.lockTimers.delete(lock.id);
        }
      }
    }

    // Emit expired events and process queues
    expiredLocks.forEach(lock => {
      this.emit('lock_expired', { lock });
      const lockKey = this.getLockKey(lock.recordId, lock.field);
      this.processQueuedRequests(lockKey);
    });
  }

  /**
   * Evaluate permission conditions
   */
  private async evaluateConditions(conditions: PermissionCondition[], context: any): Promise<boolean> {
    for (const condition of conditions) {
      switch (condition.type) {
        case 'time_range':
          const now = Date.now();
          const { start, end } = condition.condition;
          if (now < start || now > end) {
            return false;
          }
          break;

        case 'user_role':
          // This would integrate with your user role system
          // For now, assume it passes
          break;

        case 'field_value':
          // This would check field values
          // For now, assume it passes
          break;

        case 'custom':
          // Custom condition evaluation
          if (typeof condition.condition === 'function') {
            if (!await condition.condition(context)) {
              return false;
            }
          }
          break;
      }
    }

    return true;
  }

  /**
   * Emit event to handlers
   */
  private emit(event: LockEventType, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event, data);
        } catch (error) {
          console.error(`Error in lock event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Generate lock key
   */
  private getLockKey(recordId: StringRecordId, field: string): string {
    return `${String(recordId)}:${field}`;
  }

  /**
   * Generate permission key
   */
  private getPermissionKey(recordId: StringRecordId, field: string): string {
    return `${String(recordId)}:${field}`;
  }
}