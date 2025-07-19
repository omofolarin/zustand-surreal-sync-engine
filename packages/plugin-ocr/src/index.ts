/**
 * OCR Plugin for Sync Engine
 * Main entry point for the OCR collaboration plugin
 */

import { OCRCollaborationEngine } from './OCRPlugin';
import { VisualOverlaySystem } from './VisualOverlaySystem';
import {
  OCRPluginConfig,
  OCRTextBlock,
  OCRCollaborationSession,
  VisualOverlay,
  TextCorrection,
  BatchCorrectionJob,
  ValidationResult,
  ExportOptions,
  QualityAssuranceRule,
  OCRParticipant,
  DocumentLayout
} from './types';

// Default configuration
const defaultConfig: OCRPluginConfig = {
  confidenceThresholds: {
    low: 0.6,
    medium: 0.8,
    high: 0.95
  },
  qaRules: [
    {
      id: 'empty-text',
      name: 'Empty Text Check',
      description: 'Flag blocks with empty or whitespace-only text',
      enabled: true,
      threshold: 0,
      action: 'flag',
      validator: (text: string) => text.trim().length > 0
    },
    {
      id: 'special-chars',
      name: 'Special Characters Check',
      description: 'Flag blocks with unusual character patterns',
      enabled: true,
      threshold: 0.1,
      action: 'flag',
      pattern: /[^\w\s\.,!?;:'"()-]/g
    }
  ],
  sessionSettings: {
    autoSave: true,
    showConfidence: true,
    highlightLowConfidence: true,
    enableCollaborativeCursors: true,
    requireReviewForLowConfidence: true,
    batchCorrectionMode: false,
    visualOverlaysEnabled: true
  },
  exportOptions: {
    format: 'txt',
    includeMetadata: false,
    includeConfidence: false,
    preserveLayout: false,
    includeCorrections: false
  },
  enableRealTimeSync: true,
  maxConcurrentUsers: 10,
  autoLockTimeout: 30000, // 30 seconds
  batchSize: 50
};

// Plugin interface for sync-engine core
export interface Plugin {
  name: string;
  version: string;
  hooks: {
    beforeSync?: (data: any) => Promise<any>;
    afterSync?: (data: any) => Promise<void>;
    onConflict?: (conflict: any) => Promise<any>;
    onError?: (error: Error) => Promise<void>;
    onCollaborationStart?: (session: any) => Promise<void>;
    onUserJoined?: (user: any) => Promise<void>;
  };
  middleware?: any[];
  config?: Record<string, any>;
  dataModels?: Record<string, any>;
  operations?: Record<string, any>;
}

// Main OCR Plugin class
export class OCRPlugin implements Plugin {
  public readonly name = '@sync-engine/plugin-ocr';
  public readonly version = '1.0.0';
  
  private collaborationEngine: OCRCollaborationEngine;
  private overlaySystem: VisualOverlaySystem | null = null;
  private config_internal: OCRPluginConfig;
  public config: OCRPluginConfig;

  constructor(config: Partial<OCRPluginConfig> = {}) {
    this.config_internal = { ...defaultConfig, ...config };
    this.config = this.config_internal;
    this.collaborationEngine = new OCRCollaborationEngine(this.config_internal);
  }

  // Plugin interface implementation
  public hooks = {
    beforeSync: async (data: any) => {
      if (data.type === 'ocr-operation') {
        return this.validateOCROperation(data);
      }
      return data;
    },

    afterSync: async (data: any) => {
      if (data.type === 'ocr-text-correction') {
        await this.handleTextCorrectionSync(data);
      }
    },

    onConflict: async (conflict: any) => {
      if (conflict.type === 'ocr-text-conflict') {
        return this.resolveTextConflict(conflict);
      }
      return conflict;
    },

    onError: async (error: Error) => {
      console.error('OCR Plugin Error:', error);
      // Could implement error reporting/logging here
    },

    onCollaborationStart: async (session: any) => {
      if (session.type === 'ocr-session') {
        await this.initializeOCRCollaboration(session);
      }
    },

    onUserJoined: async (user: any) => {
      // Handle user joining OCR session
      if (user.sessionType === 'ocr') {
        await this.handleUserJoined(user);
      }
    }
  };

  public middleware = [];

  public dataModels = {
    // Export type references as strings for plugin system
    OCRTextBlock: 'OCRTextBlock',
    OCRCollaborationSession: 'OCRCollaborationSession', 
    VisualOverlay: 'VisualOverlay',
    TextCorrection: 'TextCorrection',
    BatchCorrectionJob: 'BatchCorrectionJob',
    ValidationResult: 'ValidationResult',
    ExportOptions: 'ExportOptions',
    ConfidenceThreshold: 'ConfidenceThreshold',
    QualityAssuranceRule: 'QualityAssuranceRule',
    OCRParticipant: 'OCRParticipant',
    BoundingBox: 'BoundingBox',
    OverlayStyle: 'OverlayStyle',
    DocumentLayout: 'DocumentLayout'
  };

  public operations = {
    'ocr-text-correction': this.handleTextCorrection.bind(this),
    'ocr-block-lock': this.handleBlockLock.bind(this),
    'ocr-visual-overlay': this.handleVisualOverlay.bind(this),
    'ocr-batch-correction': this.handleBatchCorrection.bind(this),
    'ocr-export': this.handleExport.bind(this)
  };

  // Public API methods
  async createOCRSession(
    documentId: string,
    documentImage: string,
    ocrBlocks: OCRTextBlock[],
    userId: string,
    documentLayout?: DocumentLayout
  ): Promise<OCRCollaborationSession> {
    const session = await this.collaborationEngine.createSession(
      documentId,
      documentImage,
      ocrBlocks,
      userId
    );

    // Initialize visual overlay system if layout provided
    if (documentLayout) {
      this.overlaySystem = new VisualOverlaySystem(documentLayout);
      this.setupOverlayEventHandlers();
    }

    return session;
  }

  async joinOCRSession(sessionId: string, participant: Omit<OCRParticipant, 'corrections' | 'accuracy'>): Promise<void> {
    return this.collaborationEngine.joinSession(sessionId, participant);
  }

  async leaveOCRSession(sessionId: string, userId: string): Promise<void> {
    return this.collaborationEngine.leaveSession(sessionId, userId);
  }

  async applyTextCorrection(
    sessionId: string,
    blockId: string,
    correction: Omit<TextCorrection, 'id' | 'timestamp'>
  ): Promise<void> {
    return this.collaborationEngine.applyTextCorrection(sessionId, blockId, correction);
  }

  async lockTextBlock(sessionId: string, blockId: string, userId: string): Promise<void> {
    return this.collaborationEngine.lockBlock(sessionId, blockId, userId);
  }

  async unlockTextBlock(sessionId: string, blockId: string, userId: string): Promise<void> {
    return this.collaborationEngine.unlockBlock(sessionId, blockId, userId);
  }

  async addVisualOverlay(
    sessionId: string,
    overlay: Omit<VisualOverlay, 'id' | 'timestamp'>
  ): Promise<string> {
    return this.collaborationEngine.addVisualOverlay(sessionId, overlay);
  }

  async removeVisualOverlay(sessionId: string, overlayId: string, userId: string): Promise<void> {
    return this.collaborationEngine.removeVisualOverlay(sessionId, overlayId, userId);
  }

  async runQualityAssurance(sessionId: string, blockIds?: string[]): Promise<ValidationResult> {
    return this.collaborationEngine.runQualityAssurance(sessionId, blockIds);
  }

  async createBatchJob(
    sessionId: string,
    blockIds: string[],
    rules: QualityAssuranceRule[],
    userId: string
  ): Promise<BatchCorrectionJob> {
    return this.collaborationEngine.createBatchCorrectionJob(sessionId, blockIds, rules, userId);
  }

  async exportDocument(sessionId: string, options: ExportOptions): Promise<string> {
    return this.collaborationEngine.exportDocument(sessionId, options);
  }

  // Visual overlay system access
  getOverlaySystem(): VisualOverlaySystem | null {
    return this.overlaySystem;
  }

  // Event handling
  on(event: string, handler: Function): void {
    this.collaborationEngine.on(event, handler);
  }

  off(event: string, handler: Function): void {
    this.collaborationEngine.off(event, handler);
  }

  // Private methods
  private async validateOCROperation(data: any): Promise<any> {
    // Validate OCR-specific operations
    if (data.operation === 'text-correction') {
      if (!data.blockId || !data.correctedText) {
        throw new Error('Invalid text correction operation');
      }
    }
    return data;
  }

  private async handleTextCorrectionSync(data: any): Promise<void> {
    // Handle post-sync operations for text corrections
    if (this.overlaySystem && data.blockId) {
      // Update any linked visual overlays
      const textBlock = data.textBlock;
      if (textBlock) {
        this.overlaySystem.syncTextBlockOverlays(textBlock);
      }
    }
  }

  private async resolveTextConflict(conflict: any): Promise<any> {
    // Implement OCR-specific conflict resolution
    // For now, use confidence-based resolution
    if (conflict.localConfidence > conflict.remoteConfidence) {
      return { resolution: 'local', reason: 'Higher confidence score' };
    } else if (conflict.remoteConfidence > conflict.localConfidence) {
      return { resolution: 'remote', reason: 'Higher confidence score' };
    } else {
      return { resolution: 'manual', reason: 'Equal confidence, manual review required' };
    }
  }

  private async initializeOCRCollaboration(session: any): Promise<void> {
    // Initialize OCR-specific collaboration features
    console.log('Initializing OCR collaboration for session:', session.id);
  }

  private async handleUserJoined(user: any): Promise<void> {
    // Handle user joining OCR session
    console.log('User joined OCR session:', user.userId);
  }

  private setupOverlayEventHandlers(): void {
    if (!this.overlaySystem) return;

    this.overlaySystem.on('overlay-created', (data: any) => {
      // Broadcast overlay creation to other participants
      this.collaborationEngine.emit('visual-overlay-created', data);
    });

    this.overlaySystem.on('overlay-updated', (data: any) => {
      // Broadcast overlay updates
      this.collaborationEngine.emit('visual-overlay-updated', data);
    });

    this.overlaySystem.on('overlay-deleted', (data: any) => {
      // Broadcast overlay deletion
      this.collaborationEngine.emit('visual-overlay-deleted', data);
    });
  }

  // Operation handlers
  private async handleTextCorrection(data: any): Promise<any> {
    const { sessionId, blockId, correction } = data;
    await this.applyTextCorrection(sessionId, blockId, correction);
    return { success: true, correctionId: correction.id };
  }

  private async handleBlockLock(data: any): Promise<any> {
    const { sessionId, blockId, userId, action } = data;
    if (action === 'lock') {
      await this.lockTextBlock(sessionId, blockId, userId);
    } else {
      await this.unlockTextBlock(sessionId, blockId, userId);
    }
    return { success: true, action, blockId };
  }

  private async handleVisualOverlay(data: any): Promise<any> {
    const { sessionId, overlay, action, userId } = data;
    if (action === 'add') {
      const overlayId = await this.addVisualOverlay(sessionId, overlay);
      return { success: true, overlayId };
    } else if (action === 'remove') {
      await this.removeVisualOverlay(sessionId, overlay.id, userId);
      return { success: true, overlayId: overlay.id };
    }
    return { success: false, error: 'Unknown overlay action' };
  }

  private async handleBatchCorrection(data: any): Promise<any> {
    const { sessionId, blockIds, rules, userId } = data;
    const job = await this.createBatchJob(sessionId, blockIds, rules, userId);
    return { success: true, jobId: job.id };
  }

  private async handleExport(data: any): Promise<any> {
    const { sessionId, options } = data;
    const result = await this.exportDocument(sessionId, options);
    return { success: true, data: result };
  }
}

// Factory function for easy plugin creation
export function createOCRPlugin(config?: Partial<OCRPluginConfig>): OCRPlugin {
  return new OCRPlugin(config);
}

// Export all types and classes
export * from './types';
export { OCRCollaborationEngine } from './OCRPlugin';
export { VisualOverlaySystem } from './VisualOverlaySystem';

// Default export
export default OCRPlugin;