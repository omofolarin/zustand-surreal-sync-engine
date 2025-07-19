// Offline-first capabilities
export interface OfflineConfig {
  enableOfflineMode: boolean;
  maxOfflineChanges: number;
  syncOnReconnect: boolean;
}

export interface OfflineChange {
  id: string;
  table: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  data: any;
  timestamp: number;
  synced: boolean;
}

// Placeholder for future offline features
export class OfflineManager {
  private offlineChanges: OfflineChange[] = [];
  private isOnline = true;
  
  constructor(private config: OfflineConfig) {
    // Initialize with config
    this.isOnline = !config.enableOfflineMode;
  }
  
  setOnlineStatus(online: boolean): void {
    this.isOnline = online;
  }
  
  queueOfflineChange(change: Omit<OfflineChange, 'id' | 'synced'>): void {
    if (!this.isOnline && this.offlineChanges.length < this.config.maxOfflineChanges) {
      this.offlineChanges.push({
        ...change,
        id: crypto.randomUUID(),
        synced: false
      });
    }
  }
  
  getPendingChanges(): OfflineChange[] {
    return this.offlineChanges.filter(change => !change.synced);
  }
  
  markChangesSynced(changeIds: string[]): void {
    for (const change of this.offlineChanges) {
      if (changeIds.includes(change.id)) {
        change.synced = true;
      }
    }
  }
}