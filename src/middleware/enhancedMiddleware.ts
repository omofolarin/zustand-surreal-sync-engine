import { EnhancedSyncEngine } from '../core/EnhancedSyncEngine';
import type { SyncMiddleware } from '../core/types';
import type { Plugin } from '../features/plugins';
import { createPluginAwareMiddleware } from './pluginMiddleware';

/**
 * Create enhanced sync middleware with collaboration features
 * 
 * @param syncEngine - Enhanced sync engine instance
 * @param tableName - Table name
 * @returns Enhanced middleware with collaboration support
 */
export function createEnhancedSyncMiddleware<T extends Record<string, any>>(
  syncEngine: EnhancedSyncEngine,
  tableName: string
): SyncMiddleware<T> {
  return syncEngine.createSyncMiddleware<T>(tableName);
}

/**
 * Create collaboration-aware middleware
 * 
 * @param syncEngine - Enhanced sync engine instance
 * @param tableName - Table name
 * @param sessionId - Collaboration session ID
 * @returns Collaboration-aware middleware
 */
export function createCollaborationMiddleware<T extends Record<string, any>>(
  syncEngine: EnhancedSyncEngine,
  tableName: string,
  sessionId?: string
): SyncMiddleware<T> {
  return (config) => {
    return (set, get, api) => {
      const originalSet = set;
      
      const wrappedSet = (
        partial: T | Partial<T> | ((state: T) => T | Partial<T>),
        replace?: boolean | undefined
      ) => {
        // Track field changes for collaboration
        const currentState = get();
        const newState = typeof partial === 'function' ? partial(currentState) : partial;
        
        // Detect field changes
        if (typeof newState === 'object' && newState !== null) {
          for (const [field, value] of Object.entries(newState)) {
            if (currentState[field as keyof T] !== value && sessionId) {
              // Broadcast field change for collaboration
              syncEngine.broadcastPresence(sessionId, {
                status: 'active',
                currentField: field,
                isTyping: true,
                lastActivity: Date.now(),
                device: {
                  type: 'desktop',
                  os: 'unknown',
                  browser: 'unknown',
                  screenSize: { width: 1920, height: 1080 },
                  touchSupport: false,
                  penSupport: false
                }
              }).catch(error => {
                console.error('Failed to broadcast presence:', error);
              });
            }
          }
        }
        
        return originalSet(partial, replace);
      };
      
      return config(wrappedSet, get, api);
    };
  };
}

/**
 * Create enhanced middleware with plugin support
 * 
 * @param syncEngine - Enhanced sync engine instance
 * @param tableName - Table name
 * @param plugins - Array of plugins to include
 * @returns Enhanced middleware with plugin support
 */
export function createEnhancedPluginMiddleware<T extends Record<string, any>>(
  syncEngine: EnhancedSyncEngine,
  tableName: string,
  plugins: Plugin[] = []
): SyncMiddleware<T> {
  return createPluginAwareMiddleware<T>(syncEngine, tableName, plugins);
}