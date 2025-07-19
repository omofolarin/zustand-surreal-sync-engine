import { type StateCreator, type StoreApi } from 'zustand';
import type { SyncConfig, TableConfig } from '../types';
import type { 
  DatabaseAdapter, 
  SyncStatus, 
  ChangeRecord, 
  SyncEngineConfig,
  SyncEngineEvent,
  SyncEngineEventHandler,
  SyncEngineMetrics
} from './types';
import { ConfigValidator } from './config';
import { StringRecordId } from 'surrealdb';

/**
 * Core sync engine for synchronizing Zustand state with SurrealDB
 * 
 * This class provides the fundamental synchronization capabilities between
 * client-side Zustand stores and SurrealDB, including:
 * - Bidirectional data synchronization
 * - Conflict resolution
 * - Offline-first capabilities
 * - Real-time updates via live queries
 * 
 * @example
 * ```typescript
 * const syncEngine = new ZustandSurrealSyncEngine(config);
 * await syncEngine.initialize(new SurrealDBAdapter(config));
 * 
 * const todoMiddleware = syncEngine.createSyncMiddleware<TodoState>('todos');
 * const useTodoStore = create(todoMiddleware((set, get) => ({
 *   todos: [],
 *   addTodo: (text) => set(state => ({ todos: [...state.todos, { text, completed: false }] }))
 * })));
 * ```
 */
export class ZustandSurrealSyncEngine {
  protected dbAdapter: DatabaseAdapter | null = null;
  protected stores = new Map<string, StoreApi<any>>();
  private changeQueue: ChangeRecord[] = [];
  private syncing = false;
  private syncTimer: number | null = null;
  private retryTimers = new Map<string, number>();
  private eventHandlers = new Map<SyncEngineEvent, Set<SyncEngineEventHandler>>();
  private metrics: SyncEngineMetrics = {
    totalOperations: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    conflictsResolved: 0,
    averageSyncTime: 0,
    dataTransferred: 0,
    lastSyncTimestamp: 0,
    networkLatency: 0,
    errorRate: 0
  };
  readonly config: SyncConfig;

  constructor(config: SyncConfig) {
    this.config = this.validateAndNormalizeConfig(config);
  }

  async initialize(dbAdapterInstance: DatabaseAdapter): Promise<void> {
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
      this.emit('change-queued', { change: changeRecord });
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
        await this.dbAdapter.startLiveQuery(tableName, (notification) => {
          this.handleDatabaseChange(tableName, notification);
        });
      }
    }
  }

  private handleDatabaseChange(tableName: string, notification: any): void {
    const { action, result, metadata } = notification;
    
    // Skip changes that originated from this sync engine
    if (result.source === 'zustand') {
      return;
    }

    const store = this.stores.get(tableName);
    const tableConfig = this.config.tables[tableName];
    if (!store || !tableConfig) return;

    const currentState = store.getState();
    const newState = this.applyDatabaseChange(currentState, tableConfig, action, result);

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
    this.emit('sync-start', { pendingChanges: this.changeQueue.length });
    
    const startTime = Date.now();
    const changesToProcess = [...this.changeQueue];
    this.changeQueue = [];

    let hasErrors = false;
    let successCount = 0;

    for (const change of changesToProcess) {
      const changeId = `${change.table}:${change.id}:${change.operation}`;
      try {
        await this.syncChangeToDatabase(change);
        this.retryTimers.delete(changeId);
        successCount++;
        this.emit('change-synced', { change });
      } catch (error) {
        hasErrors = true;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to sync change`, error);
        this.recordSyncError(`Failed to sync ${change.operation} for ${change.table}:${change.id}: ${errorMessage}`);
        
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

    // Update metrics
    const syncTime = Date.now() - startTime;
    this.metrics.totalOperations += changesToProcess.length;
    this.metrics.successfulSyncs += successCount;
    this.metrics.failedSyncs += (changesToProcess.length - successCount);
    this.metrics.lastSyncTimestamp = Date.now();
    
    // Update average sync time
    if (this.metrics.totalOperations > 0) {
      this.metrics.averageSyncTime = 
        (this.metrics.averageSyncTime * (this.metrics.totalOperations - changesToProcess.length) + syncTime) / 
        this.metrics.totalOperations;
    }

    // Update error rate
    this.metrics.errorRate = this.metrics.totalOperations > 0 ? 
      (this.metrics.failedSyncs / this.metrics.totalOperations) * 100 : 0;

    if (!hasErrors && changesToProcess.length > 0) {
      this.recordSyncSuccess();
      this.emit('sync-complete', { 
        processedChanges: changesToProcess.length,
        syncTime 
      });
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

  /**
   * Get current synchronization status
   * 
   * @returns Current sync status including pending changes, errors, and connection state
   */
  getSyncStatus(): SyncStatus {
    const status: SyncStatus = { 
      pending: this.changeQueue.length, 
      syncing: this.syncing,
      errors: this.syncErrors,
      connected: this.dbAdapter?.isConnected() ?? false,
      liveQueries: this.stores.size
    };
    
    if (this.lastSyncTime !== undefined) {
      status.lastSync = this.lastSyncTime;
    }
    
    return status;
  }

  updateConfig(config: Partial<SyncConfig>): void {
    const newConfig = { ...this.config, ...config };
    const validatedConfig = this.validateAndNormalizeConfig(newConfig);
    (this as any).config = validatedConfig;
    
    // Restart sync timer if interval changed
    if (config.syncInterval !== undefined) {
      this.startSyncTimer();
    }
  }

  private validateAndNormalizeConfig(config: SyncConfig): SyncConfig {
    const validation = ConfigValidator.validate(config);
    
    if (!validation.valid) {
      throw new Error(`Invalid sync configuration: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      console.warn('Configuration warnings:', validation.warnings);
    }

    return ConfigValidator.normalize(config);
  }

  // Add tracking for sync status
  private lastSyncTime?: number;
  private syncErrors: string[] = [];

  private recordSyncSuccess(): void {
    this.lastSyncTime = Date.now();
    this.syncErrors = []; // Clear errors on successful sync
  }

  private recordSyncError(error: string): void {
    this.syncErrors.push(error);
    // Keep only last 10 errors
    if (this.syncErrors.length > 10) {
      this.syncErrors = this.syncErrors.slice(-10);
    }
    this.emit('sync-error', { error });
  }

  /**
   * Add an event listener for sync engine events
   * 
   * @param event - The event type to listen for
   * @param handler - The handler function to call when the event occurs
   */
  on(event: SyncEngineEvent, handler: SyncEngineEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove an event listener
   * 
   * @param event - The event type to stop listening for
   * @param handler - The handler function to remove
   */
  off(event: SyncEngineEvent, handler: SyncEngineEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
  }

  /**
   * Emit an event to all registered listeners
   * 
   * @param event - The event type to emit
   * @param data - Optional data to pass to the event handlers
   */
  private emit(event: SyncEngineEvent, data?: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event, data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Get current sync engine metrics
   * 
   * @returns Current metrics including operation counts and performance data
   */
  getMetrics(): SyncEngineMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset sync engine metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalOperations: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      conflictsResolved: 0,
      averageSyncTime: 0,
      dataTransferred: 0,
      lastSyncTimestamp: 0,
      networkLatency: 0,
      errorRate: 0
    };
  }
}