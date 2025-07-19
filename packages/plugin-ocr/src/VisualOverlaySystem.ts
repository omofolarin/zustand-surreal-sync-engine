/**
 * Visual Overlay System
 * Handles real-time synchronization of visual overlays and bounding boxes
 */

import { v4 as uuidv4 } from 'uuid';
import {
  VisualOverlay,
  BoundingBox,
  OverlayStyle,
  DocumentLayout,
  OCRTextBlock
} from './types';

export interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
}

export interface OverlayEvent {
  type: 'overlay-created' | 'overlay-updated' | 'overlay-deleted' | 'overlay-selected';
  overlay: VisualOverlay;
  userId: string;
  timestamp: number;
}

export class VisualOverlaySystem {
  private overlays: Map<string, VisualOverlay> = new Map();
  private eventHandlers: Map<string, Function[]> = new Map();
  private documentLayout: DocumentLayout;
  private currentTransform: ViewportTransform;

  constructor(documentLayout: DocumentLayout) {
    this.documentLayout = documentLayout;
    this.currentTransform = {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0
    };
  }

  // Overlay management
  createOverlay(
    type: VisualOverlay['type'],
    boundingBox: BoundingBox,
    style: OverlayStyle,
    userId: string,
    linkedTextId?: string
  ): VisualOverlay {
    const overlay: VisualOverlay = {
      id: uuidv4(),
      type,
      boundingBox: { ...boundingBox },
      style: { ...style },
      linkedTextId,
      userId,
      timestamp: Date.now(),
      visible: true,
      zIndex: this.getNextZIndex()
    };

    this.overlays.set(overlay.id, overlay);
    this.emit('overlay-created', { type: 'overlay-created', overlay, userId, timestamp: Date.now() });

    return overlay;
  }

  updateOverlay(overlayId: string, updates: Partial<VisualOverlay>, userId: string): boolean {
    const overlay = this.overlays.get(overlayId);
    if (!overlay) return false;

    // Only allow the creator or admin to update
    if (overlay.userId !== userId) return false;

    const updatedOverlay = { ...overlay, ...updates, timestamp: Date.now() };
    this.overlays.set(overlayId, updatedOverlay);

    this.emit('overlay-updated', {
      type: 'overlay-updated',
      overlay: updatedOverlay,
      userId,
      timestamp: Date.now()
    });

    return true;
  }

  deleteOverlay(overlayId: string, userId: string): boolean {
    const overlay = this.overlays.get(overlayId);
    if (!overlay) return false;

    // Only allow the creator or admin to delete
    if (overlay.userId !== userId) return false;

    this.overlays.delete(overlayId);
    this.emit('overlay-deleted', {
      type: 'overlay-deleted',
      overlay,
      userId,
      timestamp: Date.now()
    });

    return true;
  }

  getOverlay(overlayId: string): VisualOverlay | undefined {
    return this.overlays.get(overlayId);
  }

  getAllOverlays(): VisualOverlay[] {
    return Array.from(this.overlays.values()).sort((a, b) => a.zIndex - b.zIndex);
  }

  getOverlaysInRegion(boundingBox: BoundingBox): VisualOverlay[] {
    return this.getAllOverlays().filter(overlay =>
      this.boundingBoxesIntersect(overlay.boundingBox, boundingBox)
    );
  }

  getOverlaysForTextBlock(textBlockId: string): VisualOverlay[] {
    return this.getAllOverlays().filter(overlay =>
      overlay.linkedTextId === textBlockId
    );
  }

  // Coordinate transformation
  setViewportTransform(transform: ViewportTransform): void {
    this.currentTransform = { ...transform };
    this.emit('viewport-changed', { transform });
  }

  screenToDocument(screenX: number, screenY: number): { x: number; y: number } {
    const { scale, offsetX, offsetY, rotation } = this.currentTransform;

    // Apply inverse transform
    const x = (screenX - offsetX) / scale;
    const y = (screenY - offsetY) / scale;

    if (rotation !== 0) {
      const cos = Math.cos(-rotation);
      const sin = Math.sin(-rotation);
      return {
        x: x * cos - y * sin,
        y: x * sin + y * cos
      };
    }

    return { x, y };
  }

  documentToScreen(docX: number, docY: number): { x: number; y: number } {
    const { scale, offsetX, offsetY, rotation } = this.currentTransform;

    let x = docX;
    let y = docY;

    if (rotation !== 0) {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      x = docX * cos - docY * sin;
      y = docX * sin + docY * cos;
    }

    return {
      x: x * scale + offsetX,
      y: y * scale + offsetY
    };
  }

  transformBoundingBox(boundingBox: BoundingBox, toScreen: boolean = true): BoundingBox {
    const transform = toScreen ? this.documentToScreen : this.screenToDocument;

    const topLeft = transform(boundingBox.x, boundingBox.y);
    const bottomRight = transform(
      boundingBox.x + boundingBox.width,
      boundingBox.y + boundingBox.height
    );

    return {
      x: Math.min(topLeft.x, bottomRight.x),
      y: Math.min(topLeft.y, bottomRight.y),
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y),
      rotation: boundingBox.rotation || undefined
    };
  }

  // Bounding box utilities
  boundingBoxesIntersect(box1: BoundingBox, box2: BoundingBox): boolean {
    return !(
      box1.x + box1.width < box2.x ||
      box2.x + box2.width < box1.x ||
      box1.y + box1.height < box2.y ||
      box2.y + box2.height < box1.y
    );
  }

  boundingBoxContainsPoint(box: BoundingBox, x: number, y: number): boolean {
    return x >= box.x && x <= box.x + box.width &&
      y >= box.y && y <= box.y + box.height;
  }

  mergeBoundingBoxes(boxes: BoundingBox[]): BoundingBox {
    if (boxes.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = boxes[0].x;
    let minY = boxes[0].y;
    let maxX = boxes[0].x + boxes[0].width;
    let maxY = boxes[0].y + boxes[0].height;

    for (let i = 1; i < boxes.length; i++) {
      const box = boxes[i];
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  // Text-visual alignment
  alignOverlayWithText(overlayId: string, textBlock: OCRTextBlock): boolean {
    const overlay = this.overlays.get(overlayId);
    if (!overlay || !overlay.linkedTextId || overlay.linkedTextId !== textBlock.id) {
      return false;
    }

    // Update overlay bounding box to match text block
    overlay.boundingBox = { ...textBlock.boundingBox };
    overlay.timestamp = Date.now();

    this.emit('overlay-aligned', { overlay, textBlock });
    return true;
  }

  syncTextBlockOverlays(textBlock: OCRTextBlock): void {
    const linkedOverlays = this.getOverlaysForTextBlock(textBlock.id);

    linkedOverlays.forEach(overlay => {
      this.alignOverlayWithText(overlay.id, textBlock);
    });
  }

  // Collaborative features
  highlightUserSelection(userId: string, boundingBox: BoundingBox, color: string): string {
    const selectionOverlay = this.createOverlay(
      'highlight',
      boundingBox,
      {
        color,
        opacity: 0.3,
        fillColor: color
      },
      userId
    );

    // Auto-remove selection after timeout
    setTimeout(() => {
      this.deleteOverlay(selectionOverlay.id, userId);
    }, 5000);

    return selectionOverlay.id;
  }

  showUserCursor(userId: string, x: number, y: number, color: string): string {
    const cursorSize = 2;
    const cursorOverlay = this.createOverlay(
      'box',
      {
        x: x - cursorSize / 2,
        y: y - cursorSize / 2,
        width: cursorSize,
        height: cursorSize
      },
      {
        color,
        opacity: 1.0,
        fillColor: color,
        strokeWidth: 1
      },
      userId
    );

    return cursorOverlay.id;
  }

  // Batch operations
  createMultipleOverlays(overlayData: Array<{
    type: VisualOverlay['type'];
    boundingBox: BoundingBox;
    style: OverlayStyle;
    linkedTextId?: string;
  }>, userId: string): VisualOverlay[] {
    const overlays = overlayData.map(data =>
      this.createOverlay(data.type, data.boundingBox, data.style, userId, data.linkedTextId)
    );

    this.emit('batch-overlays-created', { overlays, userId, timestamp: Date.now() });
    return overlays;
  }

  deleteOverlaysInRegion(boundingBox: BoundingBox, userId: string): string[] {
    const overlaysToDelete = this.getOverlaysInRegion(boundingBox)
      .filter(overlay => overlay.userId === userId);

    const deletedIds = overlaysToDelete.map(overlay => {
      this.deleteOverlay(overlay.id, userId);
      return overlay.id;
    });

    return deletedIds;
  }

  // Export and serialization
  exportOverlays(): any {
    return {
      overlays: Array.from(this.overlays.values()),
      documentLayout: this.documentLayout,
      transform: this.currentTransform,
      exportedAt: Date.now()
    };
  }

  importOverlays(data: any): void {
    if (data.overlays) {
      this.overlays.clear();
      data.overlays.forEach((overlay: VisualOverlay) => {
        this.overlays.set(overlay.id, overlay);
      });
    }

    if (data.documentLayout) {
      this.documentLayout = data.documentLayout;
    }

    if (data.transform) {
      this.currentTransform = data.transform;
    }

    this.emit('overlays-imported', { count: this.overlays.size });
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

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  private getNextZIndex(): number {
    const maxZ = Math.max(0, ...Array.from(this.overlays.values()).map(o => o.zIndex));
    return maxZ + 1;
  }

  // Cleanup
  clear(): void {
    this.overlays.clear();
    this.emit('overlays-cleared', {});
  }

  dispose(): void {
    this.clear();
    this.eventHandlers.clear();
  }
}