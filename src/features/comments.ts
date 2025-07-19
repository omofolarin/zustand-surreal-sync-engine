/**
 * Comment and annotation system with threading and mentions
 * 
 * Provides Google Docs-style commenting with threading, mentions,
 * resolution workflows, and real-time collaboration.
 */

import type { StringRecordId } from 'surrealdb';
import type { Comment, CommentReply } from '../core/collaboration';

export interface CommentThread {
  id: string;
  recordId: StringRecordId;
  field: string;
  position: number;
  length: number;
  rootComment: Comment;
  replies: CommentReply[];
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: number;
  participants: string[];
  lastActivity: number;
  metadata: CommentMetadata;
}

export interface CommentMetadata {
  createdAt: number;
  updatedAt: number;
  version: number;
  tags: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  linkedComments: string[];
}

export interface MentionInfo {
  userId: string;
  username: string;
  position: number;
  length: number;
  notified: boolean;
}

export interface CommentNotification {
  id: string;
  type: 'mention' | 'reply' | 'resolution' | 'assignment';
  commentId: string;
  threadId: string;
  recipientId: string;
  senderId: string;
  message: string;
  read: boolean;
  timestamp: number;
}

export interface CommentFilter {
  resolved?: boolean;
  author?: string;
  field?: string;
  priority?: CommentMetadata['priority'];
  category?: string;
  dateRange?: { start: number; end: number };
  mentions?: string;
}

/**
 * Comment and annotation manager
 */
export class CommentManager {
  private comments = new Map<string, Comment>();
  private threads = new Map<string, CommentThread>();
  private notifications = new Map<string, CommentNotification[]>();
  private mentionPattern = /@(\w+)/g;

  /**
   * Create a new comment
   */
  async createComment(
    recordId: StringRecordId,
    field: string,
    position: number,
    length: number,
    content: string,
    author: string,
    mentions: string[] = []
  ): Promise<Comment> {
    const comment: Comment = {
      id: crypto.randomUUID(),
      recordId,
      field,
      position,
      length,
      content,
      author,
      timestamp: Date.now(),
      resolved: false,
      replies: [],
      mentions: this.extractMentions(content, mentions)
    };

    this.comments.set(comment.id, comment);

    // Create thread for this comment
    const thread = this.createThread(comment);
    this.threads.set(thread.id, thread);

    // Process mentions and send notifications
    await this.processMentions(comment, thread.id);

    return comment;
  }

  /**
   * Reply to a comment
   */
  async replyToComment(
    commentId: string,
    content: string,
    author: string,
    mentions: string[] = []
  ): Promise<CommentReply> {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    const reply: CommentReply = {
      id: crypto.randomUUID(),
      content,
      author,
      timestamp: Date.now(),
      mentions: this.extractMentions(content, mentions)
    };

    comment.replies.push(reply);

    // Update thread
    const thread = this.findThreadByCommentId(commentId);
    if (thread) {
      thread.replies.push(reply);
      thread.lastActivity = Date.now();
      thread.participants = this.updateParticipants(thread.participants, author);
      thread.metadata.updatedAt = Date.now();
      thread.metadata.version++;
    }

    // Process mentions in reply
    await this.processMentions(reply, thread?.id || '', 'reply');

    return reply;
  }

  /**
   * Resolve a comment thread
   */
  async resolveComment(commentId: string, resolvedBy: string): Promise<void> {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    comment.resolved = true;

    const thread = this.findThreadByCommentId(commentId);
    if (thread) {
      thread.resolved = true;
      thread.resolvedBy = resolvedBy;
      thread.resolvedAt = Date.now();
      thread.lastActivity = Date.now();
      thread.metadata.updatedAt = Date.now();
      thread.metadata.version++;

      // Notify participants
      await this.notifyParticipants(thread, 'resolution', resolvedBy, 
        `Comment thread resolved by ${resolvedBy}`);
    }
  }

  /**
   * Reopen a resolved comment thread
   */
  async reopenComment(commentId: string, reopenedBy: string): Promise<void> {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    comment.resolved = false;

    const thread = this.findThreadByCommentId(commentId);
    if (thread) {
      thread.resolved = false;
      thread.resolvedBy = undefined;
      thread.resolvedAt = undefined;
      thread.lastActivity = Date.now();
      thread.metadata.updatedAt = Date.now();
      thread.metadata.version++;

      // Notify participants
      await this.notifyParticipants(thread, 'resolution', reopenedBy,
        `Comment thread reopened by ${reopenedBy}`);
    }
  }

  /**
   * Edit a comment
   */
  async editComment(commentId: string, newContent: string, editorId: string): Promise<void> {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.author !== editorId) {
      throw new Error('Only comment author can edit');
    }

    const oldContent = comment.content;
    comment.content = newContent;
    comment.mentions = this.extractMentions(newContent);

    const thread = this.findThreadByCommentId(commentId);
    if (thread) {
      thread.lastActivity = Date.now();
      thread.metadata.updatedAt = Date.now();
      thread.metadata.version++;

      // Process new mentions
      await this.processMentions(comment, thread.id);
    }
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string, deleterId: string): Promise<void> {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.author !== deleterId) {
      throw new Error('Only comment author can delete');
    }

    this.comments.delete(commentId);

    // Remove from thread or delete thread if root comment
    const thread = this.findThreadByCommentId(commentId);
    if (thread) {
      if (thread.rootComment.id === commentId) {
        // Delete entire thread
        this.threads.delete(thread.id);
      } else {
        // Remove reply from thread
        thread.replies = thread.replies.filter(reply => reply.id !== commentId);
        thread.lastActivity = Date.now();
        thread.metadata.updatedAt = Date.now();
        thread.metadata.version++;
      }
    }
  }

  /**
   * Get comments for a record
   */
  getCommentsForRecord(recordId: StringRecordId, filter?: CommentFilter): Comment[] {
    const comments = Array.from(this.comments.values())
      .filter(comment => String(comment.recordId) === String(recordId));

    return this.applyFilter(comments, filter);
  }

  /**
   * Get comment threads for a record
   */
  getThreadsForRecord(recordId: StringRecordId, filter?: CommentFilter): CommentThread[] {
    const threads = Array.from(this.threads.values())
      .filter(thread => String(thread.recordId) === String(recordId));

    return this.applyThreadFilter(threads, filter);
  }

  /**
   * Get comments for a specific field
   */
  getCommentsForField(recordId: StringRecordId, field: string, filter?: CommentFilter): Comment[] {
    const comments = this.getCommentsForRecord(recordId, filter)
      .filter(comment => comment.field === field);

    return comments.sort((a, b) => a.position - b.position);
  }

  /**
   * Get comment by ID
   */
  getComment(commentId: string): Comment | undefined {
    return this.comments.get(commentId);
  }

  /**
   * Get thread by ID
   */
  getThread(threadId: string): CommentThread | undefined {
    return this.threads.get(threadId);
  }

  /**
   * Get notifications for a user
   */
  getNotifications(userId: string, unreadOnly: boolean = false): CommentNotification[] {
    const userNotifications = this.notifications.get(userId) || [];
    
    if (unreadOnly) {
      return userNotifications.filter(notification => !notification.read);
    }

    return userNotifications.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Mark notification as read
   */
  markNotificationRead(userId: string, notificationId: string): void {
    const userNotifications = this.notifications.get(userId) || [];
    const notification = userNotifications.find(n => n.id === notificationId);
    
    if (notification) {
      notification.read = true;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  markAllNotificationsRead(userId: string): void {
    const userNotifications = this.notifications.get(userId) || [];
    userNotifications.forEach(notification => {
      notification.read = true;
    });
  }

  /**
   * Search comments by content
   */
  searchComments(query: string, recordId?: StringRecordId): Comment[] {
    const searchTerm = query.toLowerCase();
    let comments = Array.from(this.comments.values());

    if (recordId) {
      comments = comments.filter(comment => String(comment.recordId) === String(recordId));
    }

    return comments.filter(comment =>
      comment.content.toLowerCase().includes(searchTerm) ||
      comment.author.toLowerCase().includes(searchTerm) ||
      comment.mentions.some(mention => mention.toLowerCase().includes(searchTerm))
    );
  }

  /**
   * Get comment statistics for a record
   */
  getCommentStats(recordId: StringRecordId): {
    total: number;
    resolved: number;
    unresolved: number;
    byAuthor: Record<string, number>;
    byField: Record<string, number>;
  } {
    const comments = this.getCommentsForRecord(recordId);
    
    const stats = {
      total: comments.length,
      resolved: comments.filter(c => c.resolved).length,
      unresolved: comments.filter(c => !c.resolved).length,
      byAuthor: {} as Record<string, number>,
      byField: {} as Record<string, number>
    };

    comments.forEach(comment => {
      // Count by author
      stats.byAuthor[comment.author] = (stats.byAuthor[comment.author] || 0) + 1;
      
      // Count by field
      stats.byField[comment.field] = (stats.byField[comment.field] || 0) + 1;
    });

    return stats;
  }

  /**
   * Create a comment thread
   */
  private createThread(comment: Comment): CommentThread {
    return {
      id: crypto.randomUUID(),
      recordId: comment.recordId,
      field: comment.field,
      position: comment.position,
      length: comment.length,
      rootComment: comment,
      replies: [],
      resolved: false,
      participants: [comment.author],
      lastActivity: comment.timestamp,
      metadata: {
        createdAt: comment.timestamp,
        updatedAt: comment.timestamp,
        version: 1,
        tags: [],
        priority: 'medium',
        linkedComments: []
      }
    };
  }

  /**
   * Find thread by comment ID
   */
  private findThreadByCommentId(commentId: string): CommentThread | undefined {
    for (const thread of this.threads.values()) {
      if (thread.rootComment.id === commentId || 
          thread.replies.some(reply => reply.id === commentId)) {
        return thread;
      }
    }
    return undefined;
  }

  /**
   * Extract mentions from comment content
   */
  private extractMentions(content: string, additionalMentions: string[] = []): string[] {
    const mentions = new Set<string>();
    
    // Extract @mentions from content
    this.mentionPattern.lastIndex = 0; // Reset regex state
    let match;
    while ((match = this.mentionPattern.exec(content)) !== null) {
      mentions.add(match[1]);
    }

    // Add additional mentions (clean @ prefix if present)
    additionalMentions.forEach(mention => {
      const cleanMention = mention.startsWith('@') ? mention.slice(1) : mention;
      mentions.add(cleanMention);
    });

    return Array.from(mentions);
  }

  /**
   * Process mentions and send notifications
   */
  private async processMentions(
    comment: Comment | CommentReply, 
    threadId: string, 
    type: 'mention' | 'reply' = 'mention'
  ): Promise<void> {
    for (const mentionedUser of comment.mentions) {
      await this.sendNotification({
        id: crypto.randomUUID(),
        type,
        commentId: comment.id,
        threadId,
        recipientId: mentionedUser,
        senderId: comment.author,
        message: type === 'mention' 
          ? `${comment.author} mentioned you in a comment`
          : `${comment.author} replied to a comment you're involved in`,
        read: false,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Send notification to user
   */
  private async sendNotification(notification: CommentNotification): Promise<void> {
    if (!this.notifications.has(notification.recipientId)) {
      this.notifications.set(notification.recipientId, []);
    }

    const userNotifications = this.notifications.get(notification.recipientId)!;
    userNotifications.push(notification);

    // Keep only last 100 notifications per user
    if (userNotifications.length > 100) {
      userNotifications.splice(0, userNotifications.length - 100);
    }
  }

  /**
   * Notify all participants in a thread
   */
  private async notifyParticipants(
    thread: CommentThread,
    type: CommentNotification['type'],
    senderId: string,
    message: string
  ): Promise<void> {
    for (const participantId of thread.participants) {
      if (participantId !== senderId) {
        await this.sendNotification({
          id: crypto.randomUUID(),
          type,
          commentId: thread.rootComment.id,
          threadId: thread.id,
          recipientId: participantId,
          senderId,
          message,
          read: false,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Update participants list
   */
  private updateParticipants(participants: string[], newParticipant: string): string[] {
    if (!participants.includes(newParticipant)) {
      return [...participants, newParticipant];
    }
    return participants;
  }

  /**
   * Apply filter to comments
   */
  private applyFilter(comments: Comment[], filter?: CommentFilter): Comment[] {
    if (!filter) return comments;

    return comments.filter(comment => {
      if (filter.resolved !== undefined && comment.resolved !== filter.resolved) {
        return false;
      }

      if (filter.author && comment.author !== filter.author) {
        return false;
      }

      if (filter.field && comment.field !== filter.field) {
        return false;
      }

      if (filter.mentions && !comment.mentions.includes(filter.mentions)) {
        return false;
      }

      if (filter.dateRange) {
        if (comment.timestamp < filter.dateRange.start || 
            comment.timestamp > filter.dateRange.end) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Apply filter to threads
   */
  private applyThreadFilter(threads: CommentThread[], filter?: CommentFilter): CommentThread[] {
    if (!filter) return threads;

    return threads.filter(thread => {
      if (filter.resolved !== undefined && thread.resolved !== filter.resolved) {
        return false;
      }

      if (filter.author && thread.rootComment.author !== filter.author) {
        return false;
      }

      if (filter.field && thread.field !== filter.field) {
        return false;
      }

      if (filter.priority && thread.metadata.priority !== filter.priority) {
        return false;
      }

      if (filter.category && thread.metadata.category !== filter.category) {
        return false;
      }

      if (filter.dateRange) {
        if (thread.metadata.createdAt < filter.dateRange.start || 
            thread.metadata.createdAt > filter.dateRange.end) {
          return false;
        }
      }

      return true;
    });
  }
}