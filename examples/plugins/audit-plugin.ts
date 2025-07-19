import type { Plugin, PluginHooks } from '../../src/features/plugins';
import type { ChangeRecord, ConflictInfo } from '../../src/core/types';
import type { Comment, TextOperation } from '../../src/core/collaboration';

/**
 * Audit Plugin - Tracks all changes and operations for compliance
 * 
 * This plugin demonstrates how to:
 * - Track all sync operations
 * - Log conflicts and resolutions
 * - Monitor collaboration activities
 * - Store audit trails
 */

interface AuditLog {
    id: string;
    timestamp: number;
    userId?: string;
    action: string;
    data: any;
    metadata?: Record<string, any>;
}

class AuditLogger {
    private logs: AuditLog[] = [];

    log(action: string, data: any, userId?: string, metadata?: Record<string, any>): void {
        const logEntry: AuditLog = {
            id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            userId,
            action,
            data: JSON.parse(JSON.stringify(data)), // Deep clone
            metadata
        };

        this.logs.push(logEntry);

        // In production, you would send this to a logging service
        console.log('AUDIT:', logEntry);
    }

    getLogs(filter?: { userId?: string; action?: string; since?: number }): AuditLog[] {
        let filteredLogs = this.logs;

        if (filter) {
            if (filter.userId) {
                filteredLogs = filteredLogs.filter(log => log.userId === filter.userId);
            }
            if (filter.action) {
                filteredLogs = filteredLogs.filter(log => log.action === filter.action);
            }
            if (filter.since) {
                filteredLogs = filteredLogs.filter(log => log.timestamp >= filter.since);
            }
        }

        return filteredLogs;
    }

    exportLogs(): string {
        return JSON.stringify(this.logs, null, 2);
    }
}

const auditLogger = new AuditLogger();

const hooks: PluginHooks = {
    beforeSync: async (data: ChangeRecord) => {
        auditLogger.log('sync_before', {
            table: data.table,
            operation: data.operation,
            recordId: data.id
        }, data.metadata.userId);

        return data;
    },

    afterSync: async (data: ChangeRecord) => {
        auditLogger.log('sync_after', {
            table: data.table,
            operation: data.operation,
            recordId: data.id,
            success: true
        }, data.metadata.userId);
    },

    onSyncError: async (error: Error, data: ChangeRecord) => {
        auditLogger.log('sync_error', {
            table: data.table,
            operation: data.operation,
            recordId: data.id,
            error: error.message
        }, data.metadata.userId);
    },

    onConflict: async (conflict: ConflictInfo) => {
        auditLogger.log('conflict_detected', {
            field: conflict.field,
            strategy: conflict.strategy,
            localTimestamp: conflict.localTimestamp,
            remoteTimestamp: conflict.remoteTimestamp
        });

        return conflict;
    },

    onConflictResolved: async (conflict: ConflictInfo, resolution: any) => {
        auditLogger.log('conflict_resolved', {
            field: conflict.field,
            strategy: conflict.strategy,
            resolution
        });
    },

    onTextOperation: async (operation: TextOperation) => {
        auditLogger.log('text_operation', {
            type: operation.type,
            field: operation.field,
            position: operation.position,
            length: operation.length || operation.content?.length
        }, operation.userId);

        return operation;
    },

    onCommentAdded: async (comment: Comment) => {
        auditLogger.log('comment_added', {
            recordId: comment.recordId,
            field: comment.field,
            contentLength: comment.content.length,
            mentions: comment.mentions
        }, comment.author);
    },

    onError: async (error: Error) => {
        auditLogger.log('general_error', {
            message: error.message,
            stack: error.stack
        });
    }
};

export const AuditPlugin: Plugin = {
    name: 'audit-logger',
    version: '1.0.0',
    description: 'Comprehensive audit logging for sync operations and collaboration',
    author: 'Sync Engine Team',

    hooks,

    config: {
        maxLogs: 10000,
        exportFormat: 'json',
        logLevel: 'all'
    },

    operations: {
        'get-audit-logs': async (data: any) => {
            return auditLogger.getLogs(data.filter);
        },

        'export-audit-logs': async () => {
            return auditLogger.exportLogs();
        },

        'clear-audit-logs': async () => {
            auditLogger['logs'] = [];
            return { success: true, message: 'Audit logs cleared' };
        }
    },

    initialize: async (syncEngine: any) => {
        console.log('Audit Plugin initialized - tracking all operations');

        // Log initialization
        auditLogger.log('plugin_initialized', {
            pluginName: 'audit-logger',
            version: '1.0.0'
        });
    },

    destroy: async () => {
        console.log('Audit Plugin destroyed');

        // Log destruction
        auditLogger.log('plugin_destroyed', {
            pluginName: 'audit-logger',
            totalLogs: auditLogger['logs'].length
        });
    },

    validateConfig: async (config: any) => {
        return typeof config === 'object' &&
            typeof config.maxLogs === 'number' &&
            config.maxLogs > 0;
    },

    healthCheck: async () => {
        // Check if logging is working
        const testId = `health_${Date.now()}`;
        auditLogger.log('health_check', { testId });

        const logs = auditLogger.getLogs({ action: 'health_check' });
        return logs.some(log => log.data.testId === testId);
    }
};

// Export the audit logger for external access
export { auditLogger };