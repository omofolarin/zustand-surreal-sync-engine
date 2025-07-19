import { TextOperation, TextAttributes } from './collaboration';

/**
 * Operational Transform implementation for character-level synchronization
 * 
 * This class provides sophisticated operational transform algorithms for
 * concurrent text editing, similar to what's used in Google Docs and Figma.
 */
export class OperationalTransform {
  /**
   * Transform two operations against each other for concurrent editing
   * 
   * @param op1 - First operation
   * @param op2 - Second operation
   * @returns Transformed operation that can be applied after op2
   */
  static transform(op1: TextOperation, op2: TextOperation): TextOperation {
    // If operations are on different fields, no transformation needed
    if (op1.field !== op2.field) {
      return op1;
    }

    const transformedOp = { ...op1 };

    // Transform based on operation types
    if (op1.type === 'insert' && op2.type === 'insert') {
      // Both insertions
      if (op2.position <= op1.position) {
        transformedOp.position += op2.content?.length || 0;
      }
    } else if (op1.type === 'insert' && op2.type === 'delete') {
      // Insert vs Delete
      if (op2.position < op1.position) {
        transformedOp.position -= op2.length || 1;
      } else if (op2.position === op1.position) {
        // Delete at same position - keep insert position
      }
    } else if (op1.type === 'delete' && op2.type === 'insert') {
      // Delete vs Insert
      if (op2.position <= op1.position) {
        transformedOp.position += op2.content?.length || 0;
      }
    } else if (op1.type === 'delete' && op2.type === 'delete') {
      // Both deletions
      if (op2.position < op1.position) {
        transformedOp.position -= op2.length || 1;
      } else if (op2.position === op1.position) {
        // Same position - operation becomes no-op
        return this.createNoOpOperation(op1);
      }
    } else if (op1.type === 'retain') {
      // Retain operations - adjust length based on other operation
      if (op2.type === 'insert' && op2.position <= op1.position) {
        transformedOp.position += op2.content?.length || 0;
      } else if (op2.type === 'delete' && op2.position < op1.position) {
        transformedOp.position -= Math.min(op2.length || 1, op1.position - op2.position);
      }
    }

    return transformedOp;
  }

  /**
   * Apply a text operation to a string
   * 
   * @param text - Original text
   * @param operation - Operation to apply
   * @returns Modified text
   */
  static apply(text: string, operation: TextOperation): string {
    switch (operation.type) {
      case 'insert':
        const insertPos = Math.max(0, Math.min(operation.position, text.length));
        return text.slice(0, insertPos) + (operation.content || '') + text.slice(insertPos);

      case 'delete':
        const deletePos = Math.max(0, Math.min(operation.position, text.length));
        const deleteLength = operation.length || 1;
        return text.slice(0, deletePos) + text.slice(deletePos + deleteLength);

      case 'retain':
        // Retain operations don't modify text, used for cursor positioning
        return text;

      default:
        return text;
    }
  }

  /**
   * Compose multiple operations into a single operation
   * 
   * @param operations - Array of operations to compose
   * @returns Single composed operation
   */
  static compose(operations: TextOperation[]): TextOperation | null {
    if (operations.length === 0) return null;
    if (operations.length === 1) return operations[0];

    // Sort operations by timestamp
    const sortedOps = operations.sort((a, b) => a.timestamp - b.timestamp);
    
    // For simplicity, return the last operation
    // In a full implementation, this would merge compatible operations
    return sortedOps[sortedOps.length - 1];
  }

  /**
   * Invert an operation for undo functionality
   * 
   * @param operation - Operation to invert
   * @param originalText - Text before the operation was applied
   * @returns Inverted operation
   */
  static invert(operation: TextOperation, originalText: string): TextOperation {
    const invertedOp: TextOperation = {
      ...operation,
      id: `invert-${operation.id}`,
      timestamp: Date.now()
    };

    switch (operation.type) {
      case 'insert':
        // Invert insert with delete
        invertedOp.type = 'delete';
        invertedOp.length = operation.content?.length || 0;
        delete invertedOp.content;
        break;

      case 'delete':
        // Invert delete with insert
        invertedOp.type = 'insert';
        const deleteLength = operation.length || 1;
        invertedOp.content = originalText.slice(operation.position, operation.position + deleteLength);
        delete invertedOp.length;
        break;

      case 'retain':
        // Retain operations are their own inverse
        break;
    }

    return invertedOp;
  }

  /**
   * Check if two operations can be merged
   * 
   * @param op1 - First operation
   * @param op2 - Second operation
   * @returns Whether operations can be merged
   */
  static canMerge(op1: TextOperation, op2: TextOperation): boolean {
    return (
      op1.field === op2.field &&
      op1.userId === op2.userId &&
      op1.type === op2.type &&
      Math.abs(op1.timestamp - op2.timestamp) < 1000 && // Within 1 second
      this.arePositionsAdjacent(op1, op2)
    );
  }

  /**
   * Merge two compatible operations
   * 
   * @param op1 - First operation
   * @param op2 - Second operation
   * @returns Merged operation
   */
  static merge(op1: TextOperation, op2: TextOperation): TextOperation {
    if (!this.canMerge(op1, op2)) {
      throw new Error('Operations cannot be merged');
    }

    const mergedOp: TextOperation = {
      ...op1,
      id: `merged-${op1.id}-${op2.id}`,
      timestamp: Math.max(op1.timestamp, op2.timestamp)
    };

    if (op1.type === 'insert' && op2.type === 'insert') {
      if (op1.position + (op1.content?.length || 0) === op2.position) {
        // Sequential inserts
        mergedOp.content = (op1.content || '') + (op2.content || '');
      } else if (op2.position + (op2.content?.length || 0) === op1.position) {
        // Reverse sequential inserts
        mergedOp.position = op2.position;
        mergedOp.content = (op2.content || '') + (op1.content || '');
      }
    } else if (op1.type === 'delete' && op2.type === 'delete') {
      if (op1.position === op2.position) {
        // Deletions at same position
        mergedOp.length = (op1.length || 1) + (op2.length || 1);
      }
    }

    return mergedOp;
  }

  /**
   * Create a no-op operation
   * 
   * @param baseOp - Base operation to copy metadata from
   * @returns No-op operation
   */
  private static createNoOpOperation(baseOp: TextOperation): TextOperation {
    return {
      ...baseOp,
      type: 'retain',
      length: 0,
      content: undefined
    };
  }

  /**
   * Check if two operations have adjacent positions
   * 
   * @param op1 - First operation
   * @param op2 - Second operation
   * @returns Whether positions are adjacent
   */
  private static arePositionsAdjacent(op1: TextOperation, op2: TextOperation): boolean {
    if (op1.type === 'insert' && op2.type === 'insert') {
      return (
        op1.position + (op1.content?.length || 0) === op2.position ||
        op2.position + (op2.content?.length || 0) === op1.position
      );
    } else if (op1.type === 'delete' && op2.type === 'delete') {
      return op1.position === op2.position;
    }
    return false;
  }

  /**
   * Validate that an operation is well-formed
   * 
   * @param operation - Operation to validate
   * @returns Whether operation is valid
   */
  static validate(operation: TextOperation): boolean {
    if (!operation.id || !operation.field || !operation.userId) {
      return false;
    }

    if (operation.position < 0) {
      return false;
    }

    switch (operation.type) {
      case 'insert':
        return operation.content !== undefined && operation.content.length > 0;
      case 'delete':
        return (operation.length || 1) > 0;
      case 'retain':
        return true;
      default:
        return false;
    }
  }
}