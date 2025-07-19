/**
 * OCR Plugin Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OCRCollaborationEngine } from '../OCRPlugin';
import { VisualOverlaySystem } from '../VisualOverlaySystem';
import { OCRPlugin, createOCRPlugin } from '../index';
import {
  OCRTextBlock,
  OCRPluginConfig,
  TextCorrection,
  VisualOverlay,
  DocumentLayout,
  BoundingBox
} from '../types';

describe('OCRCollaborationEngine', () => {
  let engine: OCRCollaborationEngine;
  let config: OCRPluginConfig;

  beforeEach(() => {
    config = {
      confidenceThresholds: {
        low: 0.6,
        medium: 0.8,
        high: 0.95
      },
      qaRules: [],
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
      autoLockTimeout: 30000,
      batchSize: 50
    };

    engine = new OCRCollaborationEngine(config);
  });

  it('should create a collaboration session', async () => {
    const documentId = 'doc-123';
    const documentImage = 'data:image/jpeg;base64,test';
    const ocrBlocks: OCRTextBlock[] = [
      {
        id: 'block-1',
        text: 'Hello World',
        confidence: 0.95,
        boundingBox: { x: 10, y: 10, width: 100, height: 20 },
        wordBlocks: [],
        lineBlocks: [],
        corrections: [],
        metadata: {
          language: 'en',
          processingTime: 100,
          ocrEngine: 'tesseract',
          imageHash: 'hash123',
          processingDate: Date.now(),
          quality: 'high'
        }
      }
    ];
    const userId = 'user-1';

    const session = await engine.createSession(documentId, documentImage, ocrBlocks, userId);

    expect(session).toBeDefined();
    expect(session.documentId).toBe(documentId);
    expect(session.documentImage).toBe(documentImage);
    expect(session.ocrBlocks).toHaveLength(1);
    expect(session.participants).toHaveLength(1);
    expect(session.participants[0].userId).toBe(userId);
  });

  it('should apply text corrections', async () => {
    const session = await engine.createSession('doc-1', 'image', [
      {
        id: 'block-1',
        text: 'Helo World',
        confidence: 0.8,
        boundingBox: { x: 0, y: 0, width: 100, height: 20 },
        wordBlocks: [],
        lineBlocks: [],
        corrections: [],
        metadata: {
          language: 'en',
          processingTime: 100,
          ocrEngine: 'tesseract',
          imageHash: 'hash123',
          processingDate: Date.now(),
          quality: 'medium'
        }
      }
    ], 'user-1');

    const correction: Omit<TextCorrection, 'id' | 'timestamp'> = {
      originalText: 'Helo',
      correctedText: 'Hello',
      position: 0,
      length: 4,
      confidence: 0.95,
      userId: 'user-1',
      approved: true,
      type: 'manual'
    };

    await engine.applyTextCorrection(session.id, 'block-1', correction);

    const updatedSession = engine['sessions'].get(session.id);
    expect(updatedSession).toBeDefined();
    expect(updatedSession!.ocrBlocks[0].corrections).toHaveLength(1);
    expect(updatedSession!.ocrBlocks[0].text).toBe('Hello World');
  });

  it('should handle block locking', async () => {
    const session = await engine.createSession('doc-1', 'image', [
      {
        id: 'block-1',
        text: 'Test',
        confidence: 0.9,
        boundingBox: { x: 0, y: 0, width: 50, height: 20 },
        wordBlocks: [],
        lineBlocks: [],
        corrections: [],
        metadata: {
          language: 'en',
          processingTime: 100,
          ocrEngine: 'tesseract',
          imageHash: 'hash123',
          processingDate: Date.now(),
          quality: 'high'
        }
      }
    ], 'user-1');

    await engine.lockBlock(session.id, 'block-1', 'user-1');

    const updatedSession = engine['sessions'].get(session.id);
    expect(updatedSession!.ocrBlocks[0].locked).toBe(true);
    expect(updatedSession!.ocrBlocks[0].lockedBy).toBe('user-1');

    await engine.unlockBlock(session.id, 'block-1', 'user-1');
    expect(updatedSession!.ocrBlocks[0].locked).toBe(false);
  });

  it('should manage visual overlays', async () => {
    const session = await engine.createSession('doc-1', 'image', [], 'user-1');

    const overlay: Omit<VisualOverlay, 'id' | 'timestamp'> = {
      type: 'highlight',
      boundingBox: { x: 10, y: 10, width: 50, height: 20 },
      style: { color: '#ffff00', opacity: 0.5 },
      userId: 'user-1',
      visible: true,
      zIndex: 1
    };

    const overlayId = await engine.addVisualOverlay(session.id, overlay);

    const updatedSession = engine['sessions'].get(session.id);
    expect(updatedSession!.visualOverlays).toHaveLength(1);
    expect(updatedSession!.visualOverlays[0].id).toBe(overlayId);

    await engine.removeVisualOverlay(session.id, overlayId, 'user-1');
    expect(updatedSession!.visualOverlays).toHaveLength(0);
  });

  it('should run quality assurance', async () => {
    const session = await engine.createSession('doc-1', 'image', [
      {
        id: 'block-1',
        text: 'Low confidence text',
        confidence: 0.5, // Below low threshold
        boundingBox: { x: 0, y: 0, width: 100, height: 20 },
        wordBlocks: [],
        lineBlocks: [],
        corrections: [],
        metadata: {
          language: 'en',
          processingTime: 100,
          ocrEngine: 'tesseract',
          imageHash: 'hash123',
          processingDate: Date.now(),
          quality: 'low'
        }
      }
    ], 'user-1');

    const result = await engine.runQualityAssurance(session.id);

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('low-confidence');
    expect(result.score).toBeLessThan(100);
  });
});

describe('VisualOverlaySystem', () => {
  let overlaySystem: VisualOverlaySystem;
  let documentLayout: DocumentLayout;

  beforeEach(() => {
    documentLayout = {
      pageWidth: 800,
      pageHeight: 1000,
      dpi: 300,
      orientation: 'portrait',
      margins: { top: 50, right: 50, bottom: 50, left: 50 }
    };

    overlaySystem = new VisualOverlaySystem(documentLayout);
  });

  it('should create and manage overlays', () => {
    const boundingBox: BoundingBox = { x: 10, y: 10, width: 100, height: 50 };
    const style = { color: '#ff0000', opacity: 0.7 };

    const overlay = overlaySystem.createOverlay('highlight', boundingBox, style, 'user-1');

    expect(overlay).toBeDefined();
    expect(overlay.type).toBe('highlight');
    expect(overlay.userId).toBe('user-1');
    expect(overlay.visible).toBe(true);

    const retrieved = overlaySystem.getOverlay(overlay.id);
    expect(retrieved).toEqual(overlay);
  });

  it('should handle coordinate transformations', () => {
    overlaySystem.setViewportTransform({
      scale: 2,
      offsetX: 100,
      offsetY: 50,
      rotation: 0
    });

    const docPoint = { x: 10, y: 20 };
    const screenPoint = overlaySystem.documentToScreen(docPoint.x, docPoint.y);

    expect(screenPoint.x).toBe(120); // 10 * 2 + 100
    expect(screenPoint.y).toBe(90);  // 20 * 2 + 50

    const backToDoc = overlaySystem.screenToDocument(screenPoint.x, screenPoint.y);
    expect(backToDoc.x).toBeCloseTo(docPoint.x);
    expect(backToDoc.y).toBeCloseTo(docPoint.y);
  });

  it('should detect bounding box intersections', () => {
    const box1: BoundingBox = { x: 0, y: 0, width: 50, height: 50 };
    const box2: BoundingBox = { x: 25, y: 25, width: 50, height: 50 };
    const box3: BoundingBox = { x: 100, y: 100, width: 50, height: 50 };

    expect(overlaySystem.boundingBoxesIntersect(box1, box2)).toBe(true);
    expect(overlaySystem.boundingBoxesIntersect(box1, box3)).toBe(false);
  });

  it('should merge bounding boxes', () => {
    const boxes: BoundingBox[] = [
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 25, y: 25, width: 50, height: 50 },
      { x: 10, y: 60, width: 30, height: 20 }
    ];

    const merged = overlaySystem.mergeBoundingBoxes(boxes);

    expect(merged.x).toBe(0);
    expect(merged.y).toBe(0);
    expect(merged.width).toBe(75); // 0 to 75
    expect(merged.height).toBe(80); // 0 to 80
  });
});

describe('OCRPlugin', () => {
  let plugin: OCRPlugin;

  beforeEach(() => {
    plugin = createOCRPlugin();
  });

  it('should create plugin with default config', () => {
    expect(plugin.name).toBe('@sync-engine/plugin-ocr');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.hooks).toBeDefined();
    expect(plugin.operations).toBeDefined();
    expect(plugin.dataModels).toBeDefined();
  });

  it('should validate OCR operations', async () => {
    const validData = {
      type: 'ocr-operation',
      operation: 'text-correction',
      blockId: 'block-1',
      correctedText: 'Hello'
    };

    const result = await plugin.hooks.beforeSync!(validData);
    expect(result).toEqual(validData);

    const invalidData = {
      type: 'ocr-operation',
      operation: 'text-correction'
      // Missing blockId and correctedText
    };

    await expect(plugin.hooks.beforeSync!(invalidData)).rejects.toThrow();
  });

  it('should resolve text conflicts based on confidence', async () => {
    const conflict = {
      type: 'ocr-text-conflict',
      localConfidence: 0.9,
      remoteConfidence: 0.7
    };

    const resolution = await plugin.hooks.onConflict!(conflict);
    expect(resolution.resolution).toBe('local');
    expect(resolution.reason).toBe('Higher confidence score');
  });

  it('should create OCR session', async () => {
    const documentId = 'doc-123';
    const documentImage = 'data:image/jpeg;base64,test';
    const ocrBlocks: OCRTextBlock[] = [];
    const userId = 'user-1';

    const session = await plugin.createOCRSession(documentId, documentImage, ocrBlocks, userId);

    expect(session).toBeDefined();
    expect(session.documentId).toBe(documentId);
    expect(session.participants).toHaveLength(1);
  });
});