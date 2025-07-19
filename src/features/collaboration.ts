// Real-time collaboration features
export interface CollaborationSession {
  id: string;
  recordId: string;
  participants: string[];
  startTime: number;
  lastActivity: number;
}

export interface UserPresence {
  userId: string;
  status: 'active' | 'idle' | 'away' | 'offline';
  currentField?: string;
  lastActivity: number;
}

// Placeholder for future collaboration features
export class CollaborationManager {
  private sessions = new Map<string, CollaborationSession>();
  
  async startSession(recordId: string, userId: string): Promise<string> {
    const sessionId = `${recordId}:${userId}:${Date.now()}`;
    const session: CollaborationSession = {
      id: sessionId,
      recordId,
      participants: [userId],
      startTime: Date.now(),
      lastActivity: Date.now()
    };
    
    this.sessions.set(sessionId, session);
    return sessionId;
  }
  
  async endSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
  
  getActiveSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values());
  }
}