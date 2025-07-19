/**
 * OCR Editor Example
 * Demonstrates collaborative OCR editing with visual overlays
 */

import { createOCRPlugin } from '../packages/plugin-ocr/src/index';
import {
  OCRTextBlock,
  TextCorrection,
  VisualOverlay,
  DocumentLayout,
  QualityAssuranceRule
} from '../packages/plugin-ocr/src/types';

// Sample OCR data (would typically come from OCR processing)
const sampleOCRBlocks: OCRTextBlock[] = [
  {
    id: 'block-1',
    text: 'Helo World! This is a sample document.',
    confidence: 0.85,
    boundingBox: { x: 50, y: 100, width: 300, height: 25 },
    wordBlocks: [
      {
        id: 'word-1',
        text: 'Helo',
        confidence: 0.7, // Low confidence - needs correction
        boundingBox: { x: 50, y: 100, width: 40, height: 25 }
      },
      {
        id: 'word-2', 
        text: 'World!',
        confidence: 0.95,
        boundingBox: { x: 95, y: 100, width: 50, height: 25 }
      }
    ],
    lineBlocks: [
      {
        id: 'line-1',
        text: 'Helo World! This is a sample document.',
        confidence: 0.85,
        boundingBox: { x: 50, y: 100, width: 300, height: 25 },
        words: []
      }
    ],
    corrections: [],
    metadata: {
      language: 'en',
      processingTime: 150,
      ocrEngine: 'tesseract-5.0',
      imageHash: 'sha256:abc123...',
      processingDate: Date.now(),
      quality: 'medium'
    }
  },
  {
    id: 'block-2',
    text: 'The quck brown fox jumps over the lazy dog.',
    confidence: 0.6, // Low confidence overall
    boundingBox: { x: 50, y: 150, width: 350, height: 25 },
    wordBlocks: [
      {
        id: 'word-3',
        text: 'quck', // Should be "quick"
        confidence: 0.4,
        boundingBox: { x: 75, y: 150, width: 40, height: 25 }
      }
    ],
    lineBlocks: [],
    corrections: [],
    metadata: {
      language: 'en',
      processingTime: 200,
      ocrEngine: 'tesseract-5.0',
      imageHash: 'sha256:def456...',
      processingDate: Date.now(),
      quality: 'low'
    }
  }
];

const documentLayout: DocumentLayout = {
  pageWidth: 800,
  pageHeight: 1000,
  dpi: 300,
  orientation: 'portrait',
  margins: { top: 50, right: 50, bottom: 50, left: 50 }
};

// Custom QA rules for this document type
const customQARules: QualityAssuranceRule[] = [
  {
    id: 'common-typos',
    name: 'Common Typos Check',
    description: 'Check for common OCR typos',
    enabled: true,
    threshold: 0.8,
    action: 'flag',
    validator: (text: string) => {
      const commonTypos = ['helo', 'quck', 'teh', 'adn'];
      return !commonTypos.some(typo => text.toLowerCase().includes(typo));
    }
  },
  {
    id: 'sentence-structure',
    name: 'Sentence Structure',
    description: 'Check for proper sentence structure',
    enabled: true,
    threshold: 0.7,
    action: 'flag',
    validator: (text: string) => {
      // Simple check for sentences ending with punctuation
      return /[.!?]$/.test(text.trim()) || text.length < 10;
    }
  }
];

async function demonstrateOCRCollaboration() {
  console.log('🔍 OCR Collaboration Demo Starting...\n');

  // Create OCR plugin with custom configuration
  const ocrPlugin = createOCRPlugin({
    confidenceThresholds: {
      low: 0.6,
      medium: 0.8,
      high: 0.95
    },
    qaRules: customQARules,
    sessionSettings: {
      autoSave: true,
      showConfidence: true,
      highlightLowConfidence: true,
      enableCollaborativeCursors: true,
      requireReviewForLowConfidence: true,
      batchCorrectionMode: false,
      visualOverlaysEnabled: true
    },
    maxConcurrentUsers: 5,
    autoLockTimeout: 30000
  });

  // Create OCR collaboration session
  console.log('📄 Creating OCR collaboration session...');
  const session = await ocrPlugin.createOCRSession(
    'sample-document-123',
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...', // Sample base64 image
    sampleOCRBlocks,
    'editor-1',
    documentLayout
  );

  console.log(`✅ Session created: ${session.id}`);
  console.log(`📊 Initial blocks: ${session.ocrBlocks.length}`);
  console.log(`👥 Participants: ${session.participants.length}\n`);

  // Add second participant
  console.log('👤 Adding second participant...');
  await ocrPlugin.joinOCRSession(session.id, {
    userId: 'editor-2',
    username: 'Jane Smith',
    color: '#4ECDC4',
    role: 'editor',
    isActive: true,
    lastSeen: Date.now()
  });

  // Set up event listeners
  ocrPlugin.on('text-corrected', (data) => {
    console.log(`✏️  Text corrected in block ${data.blockId}: "${data.correction.originalText}" → "${data.correction.correctedText}"`);
  });

  ocrPlugin.on('block-locked', (data) => {
    console.log(`🔒 Block ${data.blockId} locked by ${data.userId}`);
  });

  ocrPlugin.on('visual-overlay-created', (data) => {
    console.log(`🎨 Visual overlay created: ${data.overlay.type} by ${data.overlay.userId}`);
  });

  // Demonstrate text corrections
  console.log('🔧 Applying text corrections...');
  
  // Fix "Helo" → "Hello"
  const correction1: Omit<TextCorrection, 'id' | 'timestamp'> = {
    originalText: 'Helo',
    correctedText: 'Hello',
    position: 0,
    length: 4,
    confidence: 0.98,
    userId: 'editor-1',
    approved: true,
    type: 'manual'
  };

  await ocrPlugin.applyTextCorrection(session.id, 'block-1', correction1);

  // Fix "quck" → "quick"
  const correction2: Omit<TextCorrection, 'id' | 'timestamp'> = {
    originalText: 'quck',
    correctedText: 'quick',
    position: 4,
    length: 4,
    confidence: 0.95,
    userId: 'editor-2',
    approved: true,
    type: 'manual'
  };

  await ocrPlugin.applyTextCorrection(session.id, 'block-2', correction2);

  // Demonstrate block locking
  console.log('\n🔐 Demonstrating block locking...');
  await ocrPlugin.lockTextBlock(session.id, 'block-1', 'editor-1');
  
  // Try to edit locked block (should handle gracefully)
  try {
    await ocrPlugin.applyTextCorrection(session.id, 'block-1', {
      originalText: 'sample',
      correctedText: 'example',
      position: 20,
      length: 6,
      confidence: 0.9,
      userId: 'editor-2', // Different user
      approved: true,
      type: 'manual'
    });
  } catch (error) {
    console.log(`❌ Expected error: ${(error as Error).message}`);
  }

  await ocrPlugin.unlockTextBlock(session.id, 'block-1', 'editor-1');
  console.log('🔓 Block unlocked');

  // Demonstrate visual overlays
  console.log('\n🎨 Adding visual overlays...');
  
  // Highlight low-confidence word
  const highlightOverlay: Omit<VisualOverlay, 'id' | 'timestamp'> = {
    type: 'highlight',
    boundingBox: { x: 75, y: 150, width: 40, height: 25 },
    style: {
      color: '#ffff00',
      opacity: 0.4,
      fillColor: '#ffff00'
    },
    linkedTextId: 'block-2',
    userId: 'editor-1',
    visible: true,
    zIndex: 1
  };

  await ocrPlugin.addVisualOverlay(session.id, highlightOverlay);

  // Add annotation box
  const annotationOverlay: Omit<VisualOverlay, 'id' | 'timestamp'> = {
    type: 'box',
    boundingBox: { x: 45, y: 95, width: 310, height: 35 },
    style: {
      color: '#ff0000',
      opacity: 0.8,
      strokeWidth: 2
    },
    linkedTextId: 'block-1',
    userId: 'editor-2',
    visible: true,
    zIndex: 2
  };

  await ocrPlugin.addVisualOverlay(session.id, annotationOverlay);

  // Run quality assurance
  console.log('\n🔍 Running quality assurance...');
  const qaResult = await ocrPlugin.runQualityAssurance(session.id);
  
  console.log(`📊 QA Results:`);
  console.log(`   Valid: ${qaResult.isValid}`);
  console.log(`   Score: ${qaResult.score}/100`);
  console.log(`   Errors: ${qaResult.errors.length}`);
  console.log(`   Warnings: ${qaResult.warnings.length}`);

  if (qaResult.errors.length > 0) {
    console.log('\n❌ Errors found:');
    qaResult.errors.forEach(error => {
      console.log(`   - ${error.message} (${error.type})`);
    });
  }

  if (qaResult.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    qaResult.warnings.forEach(warning => {
      console.log(`   - ${warning.message} (${warning.type})`);
    });
  }

  // Demonstrate batch correction
  console.log('\n⚡ Creating batch correction job...');
  const batchJob = await ocrPlugin.createBatchJob(
    session.id,
    ['block-1', 'block-2'],
    customQARules,
    'editor-1'
  );

  console.log(`📋 Batch job created: ${batchJob.id}`);
  console.log(`   Status: ${batchJob.status}`);
  console.log(`   Blocks: ${batchJob.blocks.length}`);

  // Export document
  console.log('\n📤 Exporting document...');
  
  // Export as text
  const textExport = await ocrPlugin.exportDocument(session.id, {
    format: 'txt',
    includeMetadata: false,
    includeConfidence: false,
    preserveLayout: false,
    includeCorrections: false
  });

  console.log('📄 Text export:');
  console.log(textExport);

  // Export as JSON with metadata
  const jsonExport = await ocrPlugin.exportDocument(session.id, {
    format: 'json',
    includeMetadata: true,
    includeConfidence: true,
    includeCorrections: true,
    preserveLayout: true
  });

  console.log('\n📋 JSON export (first 200 chars):');
  console.log(jsonExport.substring(0, 200) + '...');

  // Demonstrate visual overlay system
  const overlaySystem = ocrPlugin.getOverlaySystem();
  if (overlaySystem) {
    console.log('\n🎯 Visual overlay system demo...');
    
    // Set viewport transform (zoom and pan)
    overlaySystem.setViewportTransform({
      scale: 1.5,
      offsetX: 100,
      offsetY: 50,
      rotation: 0
    });

    // Convert coordinates
    const docPoint = { x: 100, y: 200 };
    const screenPoint = overlaySystem.documentToScreen(docPoint.x, docPoint.y);
    console.log(`📍 Document point (${docPoint.x}, ${docPoint.y}) → Screen point (${screenPoint.x}, ${screenPoint.y})`);

    // Get overlays in region
    const regionOverlays = overlaySystem.getOverlaysInRegion({
      x: 40, y: 90, width: 320, height: 100
    });
    console.log(`🎨 Found ${regionOverlays.length} overlays in region`);
  }

  console.log('\n✅ OCR Collaboration Demo Complete!');
  console.log('\n📈 Final Statistics:');
  console.log(`   - Total corrections applied: 2`);
  console.log(`   - Visual overlays created: 2`);
  console.log(`   - QA score: ${qaResult.score}/100`);
  console.log(`   - Participants: ${session.participants.length}`);
}

// Run the demonstration
if (import.meta.main) {
  demonstrateOCRCollaboration().catch(console.error);
}

export { demonstrateOCRCollaboration };