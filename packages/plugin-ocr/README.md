# @sync-engine/plugin-ocr

A comprehensive OCR editing plugin for sync-engine that provides collaborative OCR correction capabilities with real-time synchronization, visual overlays, and advanced quality assurance features.

## Features

### 🔄 Real-time Collaborative OCR Editing
- **Multi-user OCR correction** with live cursor tracking
- **Block-level locking** to prevent editing conflicts
- **Real-time text synchronization** across all participants
- **User presence indicators** showing who's working on which text blocks

### 📍 Visual-Text Alignment
- **Bounding box synchronization** between image and text
- **Visual overlay system** for highlighting, annotations, and corrections
- **Coordinate transformation** support for zoom and pan operations
- **Multi-resolution image support** with pixel-perfect alignment

### 🎯 Confidence-Based Editing
- **Color-coded confidence indicators** (red/yellow/green)
- **Automatic flagging** of low-confidence text blocks
- **Smart correction workflows** based on OCR confidence scores
- **Alternative text suggestions** for uncertain recognitions

### 🔍 Quality Assurance
- **Configurable QA rules** for validation and correction
- **Batch correction workflows** for efficient document processing
- **Validation pipelines** with custom rules and thresholds
- **Export capabilities** with quality metrics

### 🚀 Advanced Collaboration
- **Operational transform** for conflict-free text editing
- **Comment and annotation system** with threading
- **Review and approval workflows** for corrections
- **Audit trail** for all editing activities

## Installation

```bash
npm install @sync-engine/plugin-ocr
# or
bun add @sync-engine/plugin-ocr
```

## Quick Start

```typescript
import { EnhancedSyncEngine } from '@sync-engine/core';
import { createOCRPlugin } from '@sync-engine/plugin-ocr';

// Create OCR plugin with custom configuration
const ocrPlugin = createOCRPlugin({
  confidenceThresholds: {
    low: 0.6,
    medium: 0.8,
    high: 0.95
  },
  sessionSettings: {
    enableCollaborativeCursors: true,
    highlightLowConfidence: true,
    requireReviewForLowConfidence: true
  }
});

// Initialize sync engine with OCR plugin
const syncEngine = new EnhancedSyncEngine(config, userId);
syncEngine.use(ocrPlugin);

// Create OCR collaboration session
const session = await ocrPlugin.createOCRSession(
  'document-123',
  'data:image/jpeg;base64,...', // Document image
  ocrBlocks, // Processed OCR blocks
  'user-1'
);

// Apply text correction
await ocrPlugin.applyTextCorrection(session.id, 'block-1', {
  originalText: 'Helo World',
  correctedText: 'Hello World',
  position: 0,
  length: 4,
  confidence: 0.95,
  userId: 'user-1',
  approved: true,
  type: 'manual'
});

// Add visual overlay
await ocrPlugin.addVisualOverlay(session.id, {
  type: 'highlight',
  boundingBox: { x: 100, y: 200, width: 150, height: 25 },
  style: { color: '#ffff00', opacity: 0.3 },
  userId: 'user-1',
  visible: true,
  zIndex: 1
});
```

## Core Concepts

### OCR Text Blocks

OCR text blocks represent recognized text regions with associated metadata:

```typescript
interface OCRTextBlock {
  id: string;
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  wordBlocks: OCRWord[];
  lineBlocks: OCRLine[];
  corrections: TextCorrection[];
  metadata: OCRMetadata;
  locked?: boolean;
  lockedBy?: string;
}
```

### Visual Overlays

Visual overlays provide synchronized annotations on the document image:

```typescript
interface VisualOverlay {
  id: string;
  type: 'highlight' | 'underline' | 'strikethrough' | 'box' | 'arrow' | 'note';
  boundingBox: BoundingBox;
  style: OverlayStyle;
  linkedTextId?: string;
  userId: string;
  visible: boolean;
  zIndex: number;
}
```

### Text Corrections

Text corrections track all changes made to OCR text:

```typescript
interface TextCorrection {
  id: string;
  originalText: string;
  correctedText: string;
  position: number;
  length: number;
  confidence: number;
  userId: string;
  approved: boolean;
  type: 'manual' | 'suggestion' | 'auto';
}
```

## API Reference

### OCRPlugin

#### Methods

##### `createOCRSession(documentId, documentImage, ocrBlocks, userId, documentLayout?)`
Creates a new collaborative OCR editing session.

##### `joinOCRSession(sessionId, participant)`
Adds a participant to an existing OCR session.

##### `applyTextCorrection(sessionId, blockId, correction)`
Applies a text correction to an OCR block.

##### `lockTextBlock(sessionId, blockId, userId)`
Locks a text block for exclusive editing.

##### `addVisualOverlay(sessionId, overlay)`
Adds a visual overlay to the document.

##### `runQualityAssurance(sessionId, blockIds?)`
Runs quality assurance checks on specified blocks.

##### `exportDocument(sessionId, options)`
Exports the corrected document in various formats.

### VisualOverlaySystem

#### Methods

##### `createOverlay(type, boundingBox, style, userId, linkedTextId?)`
Creates a new visual overlay.

##### `setViewportTransform(transform)`
Sets the viewport transformation for coordinate mapping.

##### `documentToScreen(docX, docY)`
Converts document coordinates to screen coordinates.

##### `screenToDocument(screenX, screenY)`
Converts screen coordinates to document coordinates.

## Configuration

```typescript
interface OCRPluginConfig {
  confidenceThresholds: {
    low: number;    // Below this = needs attention
    medium: number; // Below this = review recommended  
    high: number;   // Above this = good quality
  };
  qaRules: QualityAssuranceRule[];
  sessionSettings: {
    autoSave: boolean;
    showConfidence: boolean;
    highlightLowConfidence: boolean;
    enableCollaborativeCursors: boolean;
    requireReviewForLowConfidence: boolean;
    batchCorrectionMode: boolean;
    visualOverlaysEnabled: boolean;
  };
  exportOptions: ExportOptions;
  enableRealTimeSync: boolean;
  maxConcurrentUsers: number;
  autoLockTimeout: number;
  batchSize: number;
}
```

## Events

The OCR plugin emits various events for real-time collaboration:

```typescript
// Listen for text corrections
ocrPlugin.on('text-corrected', (data) => {
  console.log('Text corrected:', data.correction);
});

// Listen for block locking
ocrPlugin.on('block-locked', (data) => {
  console.log('Block locked by:', data.userId);
});

// Listen for visual overlay changes
ocrPlugin.on('visual-overlay-created', (data) => {
  console.log('Overlay created:', data.overlay);
});

// Listen for quality assurance results
ocrPlugin.on('qa-completed', (data) => {
  console.log('QA results:', data.result);
});
```

## Advanced Usage

### Custom Quality Assurance Rules

```typescript
const customQARule: QualityAssuranceRule = {
  id: 'email-validation',
  name: 'Email Format Check',
  description: 'Validate email address format',
  enabled: true,
  threshold: 0.8,
  action: 'flag',
  validator: (text: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(text) || !text.includes('@');
  }
};

const ocrPlugin = createOCRPlugin({
  qaRules: [customQARule]
});
```

### Batch Processing

```typescript
// Create batch correction job
const job = await ocrPlugin.createBatchJob(
  sessionId,
  ['block-1', 'block-2', 'block-3'], // Block IDs to process
  qaRules,
  'user-1'
);

// Monitor job progress
ocrPlugin.on('batch-job-completed', (data) => {
  console.log('Batch job completed:', data.job.results);
});
```

### Export Options

```typescript
// Export as plain text
const textExport = await ocrPlugin.exportDocument(sessionId, {
  format: 'txt',
  includeMetadata: false,
  includeConfidence: false,
  minConfidenceThreshold: 0.8
});

// Export as JSON with full metadata
const jsonExport = await ocrPlugin.exportDocument(sessionId, {
  format: 'json',
  includeMetadata: true,
  includeConfidence: true,
  includeCorrections: true,
  preserveLayout: true
});
```

## Integration Examples

### React Component Integration

```typescript
import React, { useEffect, useState } from 'react';
import { createOCRPlugin } from '@sync-engine/plugin-ocr';

function OCREditor({ documentId, ocrBlocks, userId }) {
  const [ocrPlugin] = useState(() => createOCRPlugin());
  const [session, setSession] = useState(null);

  useEffect(() => {
    const initSession = async () => {
      const newSession = await ocrPlugin.createOCRSession(
        documentId,
        documentImage,
        ocrBlocks,
        userId
      );
      setSession(newSession);
    };

    initSession();
  }, [documentId]);

  const handleTextCorrection = async (blockId, correction) => {
    await ocrPlugin.applyTextCorrection(session.id, blockId, correction);
  };

  return (
    <div className="ocr-editor">
      {/* Your OCR editor UI */}
    </div>
  );
}
```

## Performance Considerations

- **Batch Operations**: Use batch correction jobs for processing multiple blocks
- **Overlay Management**: Limit the number of active visual overlays
- **Auto-lock Timeout**: Configure appropriate lock timeouts to prevent deadlocks
- **Quality Thresholds**: Set appropriate confidence thresholds for your use case

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

MIT License - see LICENSE file for details.

## Contributing

See the main sync-engine repository for contribution guidelines.

## Support

For issues and questions, please use the GitHub issues in the main sync-engine repository.