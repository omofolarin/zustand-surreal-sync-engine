/**
 * OCR Plugin Data Models
 * Comprehensive types for OCR editing with collaborative features
 */

// Core OCR data structures
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number | undefined;
}

export interface OCRMetadata {
  pageNumber?: number;
  language: string;
  processingTime: number;
  ocrEngine: string;
  imageHash: string;
  processingDate: number;
  quality: 'high' | 'medium' | 'low';
}

export interface OCRWord {
  id: string;
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  alternatives?: string[];
  corrected?: boolean;
  originalText?: string;
}

export interface OCRLine {
  id: string;
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  words: OCRWord[];
  baseline?: number;
}

export interface TextCorrection {
  id: string;
  originalText: string;
  correctedText: string;
  position: number;
  length: number;
  confidence: number;
  userId: string;
  timestamp: number;
  approved: boolean;
  type: 'manual' | 'suggestion' | 'auto';
  reviewerId?: string;
  reviewTimestamp?: number;
}

export interface OCRTextBlock {
  id: string;
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  wordBlocks: OCRWord[];
  lineBlocks: OCRLine[];
  corrected?: boolean;
  originalText?: string;
  corrections: TextCorrection[];
  metadata: OCRMetadata;
  locked?: boolean;
  lockedBy?: string;
  lockTimestamp?: number;
}

// Visual overlay system
export interface OverlayStyle {
  color: string;
  opacity: number;
  strokeWidth?: number;
  fillColor?: string;
  dashPattern?: number[];
}

export interface VisualOverlay {
  id: string;
  type: 'highlight' | 'underline' | 'strikethrough' | 'box' | 'arrow' | 'note';
  boundingBox: BoundingBox;
  style: OverlayStyle;
  linkedTextId?: string | undefined;
  userId: string;
  timestamp: number;
  visible: boolean;
  zIndex: number;
}

// Confidence-based editing
export interface ConfidenceThreshold {
  low: number;    // Below this = red (needs attention)
  medium: number; // Below this = yellow (review recommended)
  high: number;   // Above this = green (good quality)
}

export interface QualityAssuranceRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  threshold: number;
  action: 'flag' | 'auto-correct' | 'require-review';
  pattern?: RegExp;
  validator?: (text: string, block: OCRTextBlock) => boolean;
}

// Collaborative OCR features
export interface OCRCollaborationSession {
  id: string;
  documentId: string;
  documentImage: string; // Base64 or URL
  ocrBlocks: OCRTextBlock[];
  visualOverlays: VisualOverlay[];
  participants: OCRParticipant[];
  correctionMode: 'individual' | 'batch' | 'review';
  qualityThreshold: ConfidenceThreshold;
  qaRules: QualityAssuranceRule[];
  startTime: number;
  lastActivity: number;
  settings: OCRSessionSettings;
}

export interface OCRParticipant {
  userId: string;
  username: string;
  avatar?: string;
  color: string;
  role: 'editor' | 'reviewer' | 'viewer';
  currentBlock?: string;
  isActive: boolean;
  lastSeen: number;
  corrections: number; // Number of corrections made
  accuracy: number;    // Accuracy score (0-1)
}

export interface OCRSessionSettings {
  autoSave: boolean;
  showConfidence: boolean;
  highlightLowConfidence: boolean;
  enableCollaborativeCursors: boolean;
  requireReviewForLowConfidence: boolean;
  batchCorrectionMode: boolean;
  visualOverlaysEnabled: boolean;
}

// OCR operations and events
export interface OCROperation {
  id: string;
  type: 'text-correction' | 'block-lock' | 'block-unlock' | 'overlay-add' | 'overlay-remove' | 'confidence-update';
  blockId: string;
  userId: string;
  timestamp: number;
  data: any;
  applied: boolean;
}

export interface OCRCorrectionOperation extends OCROperation {
  type: 'text-correction';
  data: {
    originalText: string;
    correctedText: string;
    position: number;
    length: number;
    confidence: number;
  };
}

export interface OCRBlockLockOperation extends OCROperation {
  type: 'block-lock' | 'block-unlock';
  data: {
    lockDuration?: number;
  };
}

export interface OCROverlayOperation extends OCROperation {
  type: 'overlay-add' | 'overlay-remove';
  data: {
    overlay?: VisualOverlay;
    overlayId?: string;
  };
}

// Document structure and layout
export interface DocumentLayout {
  pageWidth: number;
  pageHeight: number;
  dpi: number;
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface OCRDocument {
  id: string;
  name: string;
  imageUrl: string;
  layout: DocumentLayout;
  blocks: OCRTextBlock[];
  metadata: OCRMetadata;
  processingStatus: 'pending' | 'processing' | 'completed' | 'error';
  createdAt: number;
  updatedAt: number;
  version: number;
}

// Batch processing and workflows
export interface BatchCorrectionJob {
  id: string;
  documentId: string;
  blocks: string[]; // Block IDs to process
  rules: QualityAssuranceRule[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  results: BatchCorrectionResult[];
  createdBy: string;
  createdAt: number;
  completedAt?: number;
}

export interface BatchCorrectionResult {
  blockId: string;
  originalText: string;
  suggestedText: string;
  confidence: number;
  applied: boolean;
  reviewRequired: boolean;
  errors?: string[];
}

// Export and validation
export interface ExportOptions {
  format: 'txt' | 'docx' | 'pdf' | 'json' | 'xml';
  includeMetadata: boolean;
  includeConfidence: boolean;
  minConfidenceThreshold?: number;
  preserveLayout: boolean;
  includeCorrections: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  score: number; // Overall quality score 0-100
}

export interface ValidationError {
  blockId: string;
  type: 'low-confidence' | 'invalid-format' | 'missing-text' | 'duplicate-content';
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

export interface ValidationWarning {
  blockId: string;
  type: 'review-recommended' | 'formatting-issue' | 'potential-error';
  message: string;
  suggestion?: string;
}

// Plugin configuration
export interface OCRPluginConfig {
  confidenceThresholds: ConfidenceThreshold;
  qaRules: QualityAssuranceRule[];
  sessionSettings: OCRSessionSettings;
  exportOptions: ExportOptions;
  enableRealTimeSync: boolean;
  maxConcurrentUsers: number;
  autoLockTimeout: number; // milliseconds
  batchSize: number;
}