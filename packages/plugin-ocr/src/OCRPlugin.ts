/**
 * OCR Plugin Implementation
 * Provides collaborative OCR editing capabilities for sync-engine
 */

import { v4 as uuidv4 } from 'uuid';
import {
  OCRTextBlock,
  OCRCollaborationSession,
  OCROperation,
  OCRCorrectionOperation,
  OCRBlockLockOperation,
  OCROverlayOperation,
  VisualOverlay,
  TextCorrection,
  OCRPluginConfig,
  BatchCorrectionJob,
  ValidationResult,
  ExportOptions,
  OCRParticipant,
  QualityAssuranceRule
} from './types';

export class OCRCollaborationEngine {
  private sessions: Map<string, OCRCollaborationSession> = new Map();
  private operations: Map<string, OCROperation[]> = new Map();
  private config: OCRPluginConfig;
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor(config: OCRPluginConfig) {
    this.config = config;
  }

  // Session management
  async createSession(
    documentId: string,
    documentImage: string,
    ocrBlocks: OCRTextBlock[],
    userId: string
  ): Promise<OCRCollaborationSession> {
    const sessionId = uuidv4();
    
    const session: OCRCollaborationSession = {
      id: sessionId,
      documentId,
      documentImage,
      ocrBlocks: [...ocrBlocks],
      visualOverlays: [],
      participants: [],
      correctionMode: 'individual',
      qualityThreshold: this.config.confidenceThresholds,
      qaRules: [...this.config.qaRules],
      startTime: Date.now(),
      lastActivity: Date.now(),
      settings: { ...this.config.sessionSettings }
    };

    this.sessions.set(sessionId, session);
    this.operations.set(sessionId, []);

    // Add initial participant
    await this.addParticipant(sessionId, {
      userId,
      username: userId, // In real implementation, fetch from user service
      color: this.generateUserColor(userId),
      role: 'editor',
      isActive: true,
      lastSeen: Date.now(),
      corrections: 0,
      accuracy: 1.0
    });

    this.emit('session-created', { sessionId, session });
    return session;
  }

  async joinSession(sessionId: string, participant: Omit<OCRParticipant, 'corrections' | 'accuracy'>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await this.addParticipant(sessionId, {
      ...participant,
      corrections: 0,
      accuracy: 1.0
    });

    this.emit('participant-joined', { sessionId, participant });
  }

  async leaveSession(sessionId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Unlock any blocks locked by this user
    await this.unlockUserBlocks(sessionId, userId);

    // Remove participant
    session.participants = session.participants.filter(p => p.userId !== userId);
    session.lastActivity = Date.now();

    this.emit('participant-left', { sessionId, userId });
  }

  // Text correction operations
  async applyTextCorrection(
    sessionId: string,
    blockId: string,
    correction: Omit<TextCorrection, 'id' | 'timestamp'>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const block = session.ocrBlocks.find(b => b.id === blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found`);
    }

    // Check if block is locked by another user
    if (block.locked && block.lockedBy !== correction.userId) {
      throw new Error(`Block ${blockId} is locked by another user`);
    }

    const correctionWithId: TextCorrection = {
      ...correction,
      id: uuidv4(),
      timestamp: Date.now()
    };

    // Apply correction to block
    block.corrections.push(correctionWithId);
    block.corrected = true;
    
    // Update text if approved or auto-approved
    if (correctionWithId.approved || correctionWithId.type === 'auto') {
      this.applyTextChange(block, correctionWithId);
    }

    // Create operation record
    const operation: OCRCorrectionOperation = {
      id: uuidv4(),
      type: 'text-correction',
      blockId,
      userId: correction.userId,
      timestamp: Date.now(),
      applied: true,
      data: {
        originalText: correction.originalText,
        correctedText: correction.correctedText,
        position: correction.position,
        length: correction.length,
        confidence: correction.confidence
      }
    };

    this.addOperation(sessionId, operation);
    this.updateParticipantStats(sessionId, correction.userId, 'correction');
    session.lastActivity = Date.now();

    this.emit('text-corrected', { sessionId, blockId, correction: correctionWithId });
  }

  // Block locking for collaborative editing
  async lockBlock(sessionId: string, blockId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const block = session.ocrBlocks.find(b => b.id === blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found`);
    }

    if (block.locked && block.lockedBy !== userId) {
      throw new Error(`Block ${blockId} is already locked by ${block.lockedBy}`);
    }

    block.locked = true;
    block.lockedBy = userId;
    block.lockTimestamp = Date.now();

    const operation: OCRBlockLockOperation = {
      id: uuidv4(),
      type: 'block-lock',
      blockId,
      userId,
      timestamp: Date.now(),
      applied: true,
      data: {
        lockDuration: this.config.autoLockTimeout
      }
    };

    this.addOperation(sessionId, operation);
    session.lastActivity = Date.now();

    // Set auto-unlock timer
    setTimeout(() => {
      this.unlockBlock(sessionId, blockId, userId).catch(console.error);
    }, this.config.autoLockTimeout);

    this.emit('block-locked', { sessionId, blockId, userId });
  }

  async unlockBlock(sessionId: string, blockId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const block = session.ocrBlocks.find(b => b.id === blockId);
    if (!block || !block.locked || block.lockedBy !== userId) return;

    block.locked = false;
    delete block.lockedBy;
    delete block.lockTimestamp;

    const operation: OCRBlockLockOperation = {
      id: uuidv4(),
      type: 'block-unlock',
      blockId,
      userId,
      timestamp: Date.now(),
      applied: true,
      data: {}
    };

    this.addOperation(sessionId, operation);
    session.lastActivity = Date.now();

    this.emit('block-unlocked', { sessionId, blockId, userId });
  }

  // Visual overlay management
  async addVisualOverlay(sessionId: string, overlay: Omit<VisualOverlay, 'id' | 'timestamp'>): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const overlayWithId: VisualOverlay = {
      ...overlay,
      id: uuidv4(),
      timestamp: Date.now()
    };

    session.visualOverlays.push(overlayWithId);

    const operation: OCROverlayOperation = {
      id: uuidv4(),
      type: 'overlay-add',
      blockId: overlay.linkedTextId || '',
      userId: overlay.userId,
      timestamp: Date.now(),
      applied: true,
      data: { overlay: overlayWithId }
    };

    this.addOperation(sessionId, operation);
    session.lastActivity = Date.now();

    this.emit('overlay-added', { sessionId, overlay: overlayWithId });
    return overlayWithId.id;
  }

  async removeVisualOverlay(sessionId: string, overlayId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const overlayIndex = session.visualOverlays.findIndex(o => o.id === overlayId);
    if (overlayIndex === -1) return;

    const overlay = session.visualOverlays[overlayIndex];
    if (overlay.userId !== userId) {
      throw new Error('Cannot remove overlay created by another user');
    }

    session.visualOverlays.splice(overlayIndex, 1);

    const operation: OCROverlayOperation = {
      id: uuidv4(),
      type: 'overlay-remove',
      blockId: overlay.linkedTextId || '',
      userId,
      timestamp: Date.now(),
      applied: true,
      data: { overlayId }
    };

    this.addOperation(sessionId, operation);
    session.lastActivity = Date.now();

    this.emit('overlay-removed', { sessionId, overlayId });
  }

  // Quality assurance and batch processing
  async runQualityAssurance(sessionId: string, blockIds?: string[]): Promise<ValidationResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const blocksToCheck = blockIds 
      ? session.ocrBlocks.filter(b => blockIds.includes(b.id))
      : session.ocrBlocks;

    const errors: any[] = [];
    const warnings: any[] = [];
    let totalScore = 0;

    for (const block of blocksToCheck) {
      const blockResult = this.validateBlock(block, session.qaRules);
      errors.push(...blockResult.errors);
      warnings.push(...blockResult.warnings);
      totalScore += blockResult.score;
    }

    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: blocksToCheck.length > 0 ? totalScore / blocksToCheck.length : 0
    };

    this.emit('qa-completed', { sessionId, result });
    return result;
  }

  async createBatchCorrectionJob(
    sessionId: string,
    blockIds: string[],
    rules: QualityAssuranceRule[],
    userId: string
  ): Promise<BatchCorrectionJob> {
    const job: BatchCorrectionJob = {
      id: uuidv4(),
      documentId: sessionId,
      blocks: blockIds,
      rules,
      status: 'pending',
      progress: 0,
      results: [],
      createdBy: userId,
      createdAt: Date.now()
    };

    // Start processing asynchronously
    this.processBatchJob(sessionId, job);

    this.emit('batch-job-created', { sessionId, job });
    return job;
  }

  // Export functionality
  async exportDocument(sessionId: string, options: ExportOptions): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const filteredBlocks = options.minConfidenceThreshold
      ? session.ocrBlocks.filter(b => b.confidence >= options.minConfidenceThreshold!)
      : session.ocrBlocks;

    switch (options.format) {
      case 'txt':
        return this.exportAsText(filteredBlocks, options);
      case 'json':
        return this.exportAsJSON(filteredBlocks, options);
      default:
        throw new Error(`Export format ${options.format} not supported`);
    }
  }

  // Event system
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  // Helper methods
  private async addParticipant(sessionId: string, participant: OCRParticipant): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Remove existing participant with same userId
    session.participants = session.participants.filter(p => p.userId !== participant.userId);
    session.participants.push(participant);
  }

  private generateUserColor(userId: string): string {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
    const hash = userId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  }

  private applyTextChange(block: OCRTextBlock, correction: TextCorrection): void {
    const { position, length, correctedText } = correction;
    const before = block.text.substring(0, position);
    const after = block.text.substring(position + length);
    block.text = before + correctedText + after;
    
    // Update confidence based on correction confidence
    block.confidence = Math.max(block.confidence, correction.confidence);
  }

  private addOperation(sessionId: string, operation: OCROperation): void {
    const operations = this.operations.get(sessionId) || [];
    operations.push(operation);
    this.operations.set(sessionId, operations);
  }

  private updateParticipantStats(sessionId: string, userId: string, action: 'correction'): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.find(p => p.userId === userId);
    if (!participant) return;

    if (action === 'correction') {
      participant.corrections++;
      participant.lastSeen = Date.now();
    }
  }

  private async unlockUserBlocks(sessionId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const lockedBlocks = session.ocrBlocks.filter(b => b.locked && b.lockedBy === userId);
    for (const block of lockedBlocks) {
      await this.unlockBlock(sessionId, block.id, userId);
    }
  }

  private validateBlock(block: OCRTextBlock, rules: QualityAssuranceRule[]): ValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];
    let score = 100;

    // Check confidence thresholds
    if (block.confidence < this.config.confidenceThresholds.low) {
      errors.push({
        blockId: block.id,
        type: 'low-confidence',
        message: `Block confidence ${block.confidence} is below threshold`,
        severity: 'error',
        suggestion: 'Manual review required'
      });
      score -= 30;
    } else if (block.confidence < this.config.confidenceThresholds.medium) {
      warnings.push({
        blockId: block.id,
        type: 'review-recommended',
        message: `Block confidence ${block.confidence} is below recommended threshold`,
        suggestion: 'Review recommended'
      });
      score -= 10;
    }

    // Apply custom QA rules
    for (const rule of rules.filter(r => r.enabled)) {
      if (rule.validator && !rule.validator(block.text, block)) {
        if (rule.action === 'flag') {
          warnings.push({
            blockId: block.id,
            type: 'formatting-issue',
            message: rule.description,
            suggestion: `Rule: ${rule.name}`
          });
          score -= 5;
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: Math.max(0, score)
    };
  }

  private async processBatchJob(sessionId: string, job: BatchCorrectionJob): Promise<void> {
    // Simulate batch processing
    job.status = 'running';
    
    for (let i = 0; i < job.blocks.length; i++) {
      // Process each block
      job.progress = Math.round(((i + 1) / job.blocks.length) * 100);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    job.status = 'completed';
    job.completedAt = Date.now();
    
    this.emit('batch-job-completed', { sessionId, job });
  }

  private exportAsText(blocks: OCRTextBlock[], _options: ExportOptions): string {
    return blocks
      .sort((a, b) => a.boundingBox.y - b.boundingBox.y)
      .map(block => block.text)
      .join('\n');
  }

  private exportAsJSON(blocks: OCRTextBlock[], options: ExportOptions): string {
    const data = {
      blocks: blocks.map(block => ({
        id: block.id,
        text: block.text,
        confidence: options.includeConfidence ? block.confidence : undefined,
        boundingBox: options.preserveLayout ? block.boundingBox : undefined,
        corrections: options.includeCorrections ? block.corrections : undefined,
        metadata: options.includeMetadata ? block.metadata : undefined
      })),
      exportedAt: Date.now(),
      options
    };
    
    return JSON.stringify(data, null, 2);
  }
}