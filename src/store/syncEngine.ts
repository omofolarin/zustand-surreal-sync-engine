import { type StateCreator, type StoreApi } from 'zustand';
import type { SyncConfig, TableConfig, ChangeRecord } from '../types';
import type { SurrealDBAdapter } from '../services/surrealdb';
import { StringRecordId } from 'surrealdb';


export interface FieldOperation {
  field: string;
  operation: 'set' | 'insert' | 'delete' | 'move';
  value: any;
  position?: number;
  timestamp: number;
  userId: string;
  operationId: string;
}

export interface ConflictResolution {
  strategy: 'last-write-wins' | 'field-merge' | 'manual' | 'operational-transform';
  resolver?: (conflicts: ConflictInfo[]) => any;
}

export interface ConflictInfo {
  field: string;
  localValue: any;
  remoteValue: any;
  localTimestamp: number;
  remoteTimestamp: number;
  localUserId: string;
  remoteUserId: string;
}

export interface EditSession {
  id: string;
  recordId: string;
  userId: string;
  fields: string[];
  startTime: number;
  heartbeat: number;
}






export class ZustandSurrealSyncEngine {
  protected dbAdapter: SurrealDBAdapter | null = null;
  protected stores = new Map<string, StoreApi<any>>();
  private changeQueue: ChangeRecord[] = [];
  private syncing = false;
  private syncTimer: number | null = null;
  private retryTimers = new Map<string, number>();
  readonly config: SyncConfig;

  constructor(config: SyncConfig) {
    this.config = config;
  }

  async initialize(dbAdapterInstance: SurrealDBAdapter): Promise<void> {
    this.dbAdapter = dbAdapterInstance;

    if (!this.dbAdapter) {
      throw new Error("SurrealDBAdapter instance not ready.");
    }

    if (!this.dbAdapter.isConnected()) {
      await this.dbAdapter.connect();
    }
    await this.setupLiveQueries();
    this.startSyncTimer();
  }

  async shutdown(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.retryTimers.forEach(timer => clearTimeout(timer));
    this.retryTimers.clear();
    await this.processPendingChanges();
    if (this.dbAdapter) {
      await this.dbAdapter.disconnect();
    }
  }


  createSyncMiddleware<T extends Record<string, any>>(
    tableName: string
  ): (config: StateCreator<T, [], []>) => StateCreator<T, [], []> {
    return (config) => (set, get, api) => {
      // Register store
      this.stores.set(tableName, api);

      // Wrap the set function that gets passed to the store creator
      const syncSet: typeof set = (partial, replace) => {
        const prevState = get();
        console.log('syncSet called with:', { partial, replace, prevState });

        // Call the original set function
        set(partial, replace);

        const nextState = get();
        console.log('State after set:', nextState);

        // If `replace` is true, this change likely came from the database via
        // `handleDatabaseChange`, so we prevent it from being re-queued to avoid loops
        if (replace) {
          console.log('Skipping sync queue due to replace=true');
          return;
        }

        // For regular changes, detect what changed and queue it for synchronization
        console.log('Queueing state changes...');
        this.queueStateChanges(tableName, prevState, nextState);
      };

      // Also wrap api.setState for completeness (catches direct setState calls)
      const originalSetState = api.setState;
      api.setState = (state, replace) => {
        const prevState = get();
        console.log('api.setState called with:', { state, replace, prevState });

        // Call original setState
        originalSetState(state, replace as any);

        const nextState = get();

        if (!replace) {
          console.log('Queueing changes from api.setState...');
          this.queueStateChanges(tableName, prevState, nextState);
        }
      };

      // Initialize the store with our wrapped set function
      const initializedStore = config(syncSet, get, api);
      console.log("Store initialized with methods:", Object.keys(initializedStore));

      return initializedStore;
    };
  }


  protected queueStateChanges(tableName: string, prevState: any, nextState: any): void {
    console.log('queueStateChanges called with:', { tableName, prevState, nextState });

    const tableConfig = this.config.tables[tableName];
    if (!tableConfig?.syncEnabled) {
      console.log(`Sync disabled for table: ${tableName}`);
      return;
    }

    const changes = this.detectChanges(prevState, nextState, tableConfig);
    console.log(`Detected ${changes.length} changes for ${tableName}:`, changes);

    for (const change of changes) {
      console.log('Processing change:', change);

      const isDuplicate = this.changeQueue.some(
        q => q.id === change.id && q.table === tableName && q.operation === change.operation
      );

      if (isDuplicate && change.operation !== 'UPDATE') {
        console.log('Skipping duplicate change:', change);
        continue;
      }

      const changeRecord: ChangeRecord = {
        id: change.id,
        table: tableName,
        operation: change.operation,
        data: change.data,
        metadata: {
          id: `${Date.now()}-${Math.random()}`,
          lastModified: Date.now(),
          version: 1,
          source: 'zustand' as const
        },
        timestamp: Date.now()
      };

      console.log('Queueing change record:', JSON.stringify(changeRecord, null, 2));
      this.changeQueue.push(changeRecord);
    }
  }

  private detectChanges(prevState: any, nextState: any, config: TableConfig): { id: StringRecordId; operation: "CREATE" | "UPDATE" | "DELETE"; data: any }[] {
    console.log('detectChanges called with:', { prevState, nextState, config });

    const changes: { id: StringRecordId; operation: "CREATE" | "UPDATE" | "DELETE"; data: any }[] = [];
    const prevData = this.getNestedValue(prevState, config.zustandPath) || [];
    const nextData = this.getNestedValue(nextState, config.zustandPath) || [];

    console.log('Previous data:', prevData);
    console.log('Next data:', nextData);

    if (Array.isArray(nextData) && Array.isArray(prevData)) {
      console.log('Both previous and next data are arrays, comparing items...');

      const prevMap = new Map(prevData.map((item: any) => {
        const key = item[config.primaryKey];
        console.log(`Previous item key '${config.primaryKey}':`, key);
        return [key, item];
      }));

      const nextMap = new Map(nextData.map((item: any) => {
        const key = item[config.primaryKey];
        console.log(`Next item key '${config.primaryKey}':`, key);
        return [key, item];
      }));

      console.log('Previous items map:', Array.from(prevMap.entries()));
      console.log('Next items map:', Array.from(nextMap.entries()));

      // Check for new or updated items
      for (const [id, item] of nextMap) {
        console.log(`Processing item with ID: ${id}`, item);
        const prevItem = prevMap.get(id);

        if (!prevItem) {
          console.log(`CREATE detected - New item with ID: ${id}`, item);
          if (!id) {
            console.error('WARNING: CREATE operation with undefined ID!', item);
          }
          changes.push({ id, operation: 'CREATE', data: item });
        } else if (JSON.stringify(prevItem) !== JSON.stringify(item)) {
          console.log(`UPDATE detected - Changed item with ID: ${id}`, { before: prevItem, after: item });
          if (!id) {
            console.warn('WARNING: UPDATE operation with undefined ID!', { before: prevItem, after: item });
            console.warn('Creating item with undefined ID');
            changes.push({ id, operation: 'CREATE', data: item });
          } else {
            changes.push({ id, operation: 'UPDATE', data: item });
          }
        } else {
          console.log(`No changes detected for item with ID: ${id}`);
        }
      }

      // Check for deleted items
      for (const [id] of prevMap) {
        if (!nextMap.has(id)) {
          console.log(`DELETE detected - Removed item with ID: ${id}`);
          if (id) { // Only add DELETE for items with valid IDs
            changes.push({ id, operation: 'DELETE', data: null });
          } else {
            console.error('WARNING: Skipping DELETE operation for item with undefined ID');
          }
        }
      }
    }
    return changes;
  }

  private async setupLiveQueries(): Promise<void> {
    if (!this.dbAdapter) return;
    for (const tableName of Object.keys(this.config.tables)) {
      if (this.config.tables[tableName]?.syncEnabled) {
        await this.dbAdapter.startLiveQuery(tableName, ({ action, result }) => {
          this.handleDatabaseChange(tableName, action, result);
        });
      }
    }
  }

  private handleDatabaseChange(tableName: string, action: string, result: any): void {
    if (result.source === 'zustand') {
      return;
    }

    const store = this.stores.get(tableName);
    const tableConfig = this.config.tables[tableName];
    if (!store || !tableConfig) return;

    const currentState = store.getState();
    const newState = this.applyDatabaseChange(currentState, tableConfig, action.toUpperCase(), result);

    if (JSON.stringify(newState) !== JSON.stringify(currentState)) {
      store.setState(newState, true);
    }
  }

  private applyDatabaseChange(state: any, config: TableConfig, action: string, result: any): any {
    const currentData = this.getNestedValue(state, config.zustandPath);
    let newData;
    const pk = result[config.primaryKey] || result.id;

    if (!pk) return state; // Ignore changes without a primary key

    if (Array.isArray(currentData)) {
      newData = [...currentData];
      const index = newData.findIndex(item => item[config.primaryKey] === pk);

      switch (action) {
        case 'CREATE':
          if (index === -1) newData.push(result);
          break;
        case 'UPDATE':
          if (index !== -1) newData[index] = { ...newData[index], ...result };
          else newData.push(result);
          break;
        case 'DELETE':
          if (index !== -1) newData.splice(index, 1);
          break;
      }
    } else {
      newData = (action === 'DELETE') ? null : { ...currentData, ...result };
    }
    return this.setNestedValue(state, config.zustandPath, newData);
  }

  private async processPendingChanges(): Promise<void> {
    if (this.syncing || this.changeQueue.length === 0 || !this.dbAdapter) return;
    this.syncing = true;
    const changesToProcess = [...this.changeQueue];
    this.changeQueue = [];

    for (const change of changesToProcess) {
      const changeId = `${change.table}:${change.id}:${change.operation}`;
      try {
        await this.syncChangeToDatabase(change);
        this.retryTimers.delete(changeId);
      } catch (error) {
        console.error(`Failed to sync change`, error);
        const attempts = (change.metadata as any).retryAttempts || 0;
        if (attempts < (this.config.retryAttempts || 3)) {
          const delay = Math.pow(2, attempts) * 1000;
          (change.metadata as any).retryAttempts = attempts + 1;
          const timerId = setTimeout(() => {
            this.changeQueue.unshift(change);
            this.processPendingChanges();
          }, delay) as unknown as number;
          this.retryTimers.set(changeId, timerId);
        }
      }
    }
    this.syncing = false;
  }

  private async syncChangeToDatabase(change: ChangeRecord): Promise<void> {
    console.log('Processing change in syncChangeToDatabase:', JSON.stringify(change, null, 2));

    if (!this.dbAdapter) throw new Error("Database adapter not initialized.");

    // Log the full change object and its prototype chain
    console.log('Change object details:', {
      hasId: 'id' in change,
      id: change.id,
      operation: change.operation,
      table: change.table,
      dataKeys: change.data ? Object.keys(change.data) : 'no data',
      dataId: change.data?.id
    });

    switch (change.operation) {
      case 'CREATE':
        console.log(`syncChangeToDatabase CREATE`, change.data);
        await this.dbAdapter.create(change.table, change.data);
        break;

      case 'UPDATE':
        console.log(`syncChangeToDatabase UPDATE - checking ID:`, {
          changeId: change.id,
          dataId: change.data?.id,
          hasIdInData: 'id' in (change.data || {})
        });

        // Try to get ID from data if not in change object
        const updateId = change.id || change.data?.id;
        if (updateId) {
          console.log(`Updating record with ID:`, updateId);
          await this.dbAdapter.update(updateId, change.data);
        } else {
          console.error('Cannot update: No ID found in change:', change);
        }
        break;

      case 'DELETE': {
        const deleteId = change.id || change.data?.id;
        if (deleteId) {
          console.log(`Deleting record with ID:`, deleteId);
          await this.dbAdapter.delete(deleteId);
        } else {
          console.error('Cannot delete: No ID found in change:', change);
        }
        break;
      }
    }
  }

  private startSyncTimer(): void {
    const interval = this.config.syncInterval || 2000;
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(() => this.processPendingChanges(), interval) as unknown as number;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private setNestedValue(obj: any, path: string, value: any): any {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const result = JSON.parse(JSON.stringify(obj));
    let current = result;
    for (const key of keys) {
      current = current[key] = current[key] || {};
    }
    current[lastKey] = value;
    return result;
  }

  async loadInitialData(tableName: string): Promise<void> {
    const store = this.stores.get(tableName);
    const tableConfig = this.config.tables[tableName];
    if (!store || !tableConfig || !this.dbAdapter) return;

    try {
      const data = await this.dbAdapter.select(tableName);
      const currentState = store.getState();
      const newState = this.setNestedValue(currentState, tableConfig.zustandPath, data);
      console.log({ newState, data })

      store.setState({ ...store.getState(), ...newState }, true);
    } catch (error) {
      console.error(`Failed to load initial data for ${tableName}:`, error);
    }
  }

  getSyncStatus(): { pending: number; syncing: boolean } {
    return { pending: this.changeQueue.length, syncing: this.syncing };
  }
}




export class EnhancedSyncEngine extends ZustandSurrealSyncEngine {
  private activeSessions = new Map<string, EditSession>();
  private operationQueue = new Map<string, FieldOperation[]>();
  private conflictHandlers = new Map<string, ConflictResolution>();
  private userId: string;

  constructor(config: SyncConfig, userId: string) {
    super(config);
    this.userId = userId;
  }



  // Register field-level conflict resolution
  /**
   * Example usage:
   * 
   * ```typescript
   * const enhancedSyncEngine = new EnhancedSyncEngine(syncConfig, 'user123');
   * 
   * // Configure field-level conflict resolution
   * enhancedSyncEngine.setConflictResolution('users', {
   *   strategy: 'field-merge',
   *   resolver: async (conflicts) => {
   *     // Custom conflict resolution logic
   *     const resolved: any = {};
   *     for (const conflict of conflicts) {
   *       // Show UI for user to resolve conflicts
   *       resolved[conflict.field] = await showConflictDialog(conflict);
   *     }
   *     return resolved;
   *   }
   * });
   * ```
   */
  setConflictResolution(table: string, resolution: ConflictResolution): void {
    this.conflictHandlers.set(table, resolution);
  }

  // Start editing session for specific fields
  async startEditSession(table: string, recordId: string, fields: string[]): Promise<string> {
    const sessionId = `${table}:${recordId}:${this.userId}:${Date.now()}`;

    const session: EditSession = {
      id: sessionId,
      recordId,
      userId: this.userId,
      fields,
      startTime: Date.now(),
      heartbeat: Date.now()
    };

    this.activeSessions.set(sessionId, session);

    // Notify other clients about edit session
    await this.broadcastEditSession(table, session, 'start');

    return sessionId;
  }

  // End editing session
  async endEditSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.activeSessions.delete(sessionId);

    // Apply queued operations
    const operations = this.operationQueue.get(sessionId) || [];
    if (operations.length > 0) {
      await this.applyOperations(session.recordId.split(':')[0], operations);
      this.operationQueue.delete(sessionId);
    }

    // Notify other clients
    await this.broadcastEditSession(session.recordId.split(':')[0], session, 'end');
  }

  // Queue field-level operation
  queueFieldOperation(
    sessionId: string,
    field: string,
    operation: FieldOperation['operation'],
    value: any,
    position?: number
  ): void {
    const fieldOp: FieldOperation = {
      field,
      operation,
      value,
      position,
      timestamp: Date.now(),
      userId: this.userId,
      operationId: crypto.randomUUID()
    };

    if (!this.operationQueue.has(sessionId)) {
      this.operationQueue.set(sessionId, []);
    }

    this.operationQueue.get(sessionId)!.push(fieldOp);
  }

  // Apply operations with conflict resolution
  private async applyOperations(table: string, operations: FieldOperation[]): Promise<void> {
    const resolution = this.conflictHandlers.get(table) || { strategy: 'last-write-wins' };

    // Group operations by record and field
    const recordOps = new Map<StringRecordId, Map<string, FieldOperation[]>>();

    for (const op of operations) {
      const recordKey = new StringRecordId(`${table}:${op.operationId.split(':')[1]}`);
      if (!recordOps.has(recordKey)) {
        recordOps.set(recordKey, new Map());
      }

      const fieldOps = recordOps.get(recordKey)!;
      if (!fieldOps.has(op.field)) {
        fieldOps.set(op.field, []);
      }

      fieldOps.get(op.field)!.push(op);
    }

    // Apply operations per record
    for (const [recordKey, fieldOps] of recordOps) {
      await this.applyRecordOperations(recordKey, fieldOps, resolution);
    }
  }

  private async applyRecordOperations(
    recordKey: StringRecordId,
    fieldOps: Map<string, FieldOperation[]>,
    resolution: ConflictResolution
  ): Promise<void> {

    const table = String(recordKey).split(':')[0];
    // Get current record
    const currentRecord = await this.dbAdapter?.select(table, recordKey);
    if (!currentRecord) return;

    const updates: any = {};
    const conflicts: ConflictInfo[] = [];

    // Process each field
    for (const [field, ops] of fieldOps) {
      const result = await this.resolveFieldOperations(
        field,
        currentRecord[field],
        ops,
        resolution
      );

      if (result.conflicts.length > 0) {
        conflicts.push(...result.conflicts);
      }

      updates[field] = result.value;
    }

    // Handle conflicts
    if (conflicts.length > 0) {
      const resolvedUpdates = await this.handleConflicts(conflicts, resolution, updates);
      Object.assign(updates, resolvedUpdates);
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      await this.dbAdapter?.update(recordKey, updates);
    }
  }

  private async resolveFieldOperations(
    field: string,
    currentValue: any,
    operations: FieldOperation[],
    resolution: ConflictResolution
  ): Promise<{ value: any; conflicts: ConflictInfo[] }> {
    const conflicts: ConflictInfo[] = [];
    let value = currentValue;

    switch (resolution.strategy) {
      case 'field-merge':
        // Apply operations in timestamp order
        const sortedOps = operations.sort((a, b) => a.timestamp - b.timestamp);

        for (const op of sortedOps) {
          switch (op.operation) {
            case 'set':
              // Check for conflicts with other recent operations
              const recentOps = sortedOps.filter(
                o => o.operationId !== op.operationId &&
                  Math.abs(o.timestamp - op.timestamp) < 1000 // 1 second window
              );

              if (recentOps.length > 0) {
                conflicts.push({
                  field,
                  localValue: op.value,
                  remoteValue: value,
                  localTimestamp: op.timestamp,
                  remoteTimestamp: recentOps[0].timestamp,
                  localUserId: op.userId,
                  remoteUserId: recentOps[0].userId
                });
              } else {
                value = op.value;
              }
              break;

            case 'insert':
              if (typeof value === 'string') {
                const pos = op.position || value.length;
                value = value.slice(0, pos) + op.value + value.slice(pos);
              } else if (Array.isArray(value)) {
                const pos = op.position || value.length;
                value = [...value.slice(0, pos), op.value, ...value.slice(pos)];
              }
              break;

            case 'delete':
              if (typeof value === 'string' && op.position !== undefined) {
                value = value.slice(0, op.position) + value.slice(op.position + 1);
              } else if (Array.isArray(value) && op.position !== undefined) {
                value = [...value.slice(0, op.position), ...value.slice(op.position + 1)];
              }
              break;
          }
        }
        break;

      case 'operational-transform':
        // Implement operational transform for text editing
        value = this.applyOperationalTransform(currentValue, operations);
        break;

      case 'last-write-wins':
      default:
        // Use the most recent operation
        const latestOp = operations.reduce((latest, op) =>
          op.timestamp > latest.timestamp ? op : latest
        );
        value = latestOp.value;
        break;
    }

    return { value, conflicts };
  }

  private async handleConflicts(
    conflicts: ConflictInfo[],
    resolution: ConflictResolution,
    updates: any
  ): Promise<any> {
    switch (resolution.strategy) {
      case 'manual':
        if (resolution.resolver) {
          return await resolution.resolver(conflicts);
        }
        // Emit event for manual resolution
        this.emitConflictEvent(conflicts);
        return {};

      case 'field-merge':
        // Merge non-conflicting fields, use latest for conflicts
        const resolved: any = {};
        for (const conflict of conflicts) {
          resolved[conflict.field] = conflict.localTimestamp > conflict.remoteTimestamp
            ? conflict.localValue
            : conflict.remoteValue;
        }
        return resolved;

      default:
        return {};
    }
  }

  private applyOperationalTransform(text: string, operations: FieldOperation[]): string {
    // Simplified operational transform for text
    // In production, use libraries like ShareJS or Yjs
    let result = text;

    // Sort operations by position (reverse order for deletions)
    const sortedOps = operations.sort((a, b) => {
      if (a.operation === 'delete' && b.operation === 'insert') return 1;
      if (a.operation === 'insert' && b.operation === 'delete') return -1;
      return (b.position || 0) - (a.position || 0);
    });

    for (const op of sortedOps) {
      switch (op.operation) {
        case 'insert':
          const insertPos = op.position || result.length;
          result = result.slice(0, insertPos) + op.value + result.slice(insertPos);
          break;
        case 'delete':
          if (op.position !== undefined) {
            result = result.slice(0, op.position) + result.slice(op.position + 1);
          }
          break;
      }
    }

    return result;
  }

  private async broadcastEditSession(table: string, session: EditSession, action: 'start' | 'end'): Promise<void> {
    // Broadcast to other clients via SurrealDB
    await this.dbAdapter?.create(table ?? 'edit_sessions', {
      ...session,
      action,
      timestamp: Date.now()
    });
  }

  private emitConflictEvent(conflicts: ConflictInfo[]): void {
    // Emit custom event for UI to handle
    window.dispatchEvent(new CustomEvent('sync-conflict', {
      detail: { conflicts }
    }));
  }

  // Enhanced Zustand middleware with field-level tracking
  /**
   * Enhanced Zustand middleware with field-level tracking
   * 
   * Creates a middleware that enables field-level synchronization and collaborative editing
   * by tracking changes at the field level and supporting edit sessions.
   * 
   * @param tableName - The name of the table to synchronize with
   * @returns A Zustand middleware function
   */

  /**
   * Creates a middleware that enables field-level synchronization and collaborative editing
   * by tracking changes at the field level and supporting edit sessions.
   * 
   * @param tableName - The name of the table to synchronize with
   * @returns A Zustand middleware function
   * 
   * @example
   * // Enhanced store with field-aware editing
   * export const useCollaborativeStore = create<AppState>()(
   *   enhancedSyncEngine.createFieldAwareSyncMiddleware<AppState>('users')(
   *     (set, get) => ({
   *       users: [],
   *       currentUser: null,
   *       // Start editing a specific field
   *       startEditingField: async (userId: string, field: string) => {
   *         const sessionId = await enhancedSyncEngine.startEditSession('users', userId, [field]);
   *         return sessionId;
   *       },
   *       // Update with field-level operations
   *       updateUserField: (id: string, field: string, value: any, sessionId?: string) => {
   *         if (sessionId) {
   *           enhancedSyncEngine.queueFieldOperation(sessionId, field, 'set', value);
   *         }
   *         set((state) => ({
   *           users: state.users.map(user =>
   *             user.id === id ? { ...user, [field]: value } : user
   *           )
   *         }));
   *       },
   *       // End editing session
   *       stopEditingField: async (sessionId: string) => {
   *         await enhancedSyncEngine.endEditSession(sessionId);
   *       }
   *     })
   *   ))
   */

  createFieldAwareSyncMiddleware<T extends Record<string, any>>(
    tableName: string
  ): (config: StateCreator<T>) => StateCreator<T> {
    return (config) => (set, get, api) => {
      this.stores.set(tableName, api);

      const syncSet = (
        partial: Partial<T> | ((state: T) => Partial<T>),
        replace?: boolean,
        fieldPath?: string
      ) => {
        const prevState = get();
        set(partial, replace);
        const nextState = get();

        // More granular change tracking
        if (fieldPath) {
          this.queueFieldLevelChanges(tableName, prevState, nextState, fieldPath);
        } else {
          this.queueStateChanges(tableName, prevState, nextState);
        }
      };

      return config(syncSet, get, api);
    };
  }

  private queueFieldLevelChanges(tableName: string, prevState: any, nextState: any, fieldPath: string): void {
    // Implementation for field-level change tracking
    const tableConfig = this.config.tables[tableName];
    if (!tableConfig?.syncEnabled) return;

    // Extract changed fields and queue appropriate operations
    // This would integrate with the field operation system
  }

  // Utility methods for collaborative editing
  async getLiveEditSessions(table: string, recordId: string): Promise<EditSession[]> {
    const sessions = await this.dbAdapter?.select(table ?? 'edit_sessions');
    return sessions.filter((s: any) =>
      s.recordId === recordId &&
      s.action === 'start' &&
      Date.now() - s.heartbeat < 30000 // Active within 30 seconds
    );
  }

  async isFieldBeingEdited(table: string, recordId: string, field: string): Promise<boolean> {
    const sessions = await this.getLiveEditSessions(table, recordId);
    return sessions.some(session =>
      session.fields.includes(field) &&
      session.userId !== this.userId
    );
  }
}



