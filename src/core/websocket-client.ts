/**
 * WebSocket-based real-time communication layer for collaboration
 * 
 * Provides reliable WebSocket connection with automatic reconnection,
 * message queuing, and event-based communication for real-time collaboration.
 */

export interface WebSocketConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  messageQueueSize?: number;
  protocols?: string[];
}

export interface WebSocketMessage {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
  userId?: string;
}

export interface WebSocketEventHandler {
  (message: WebSocketMessage): void;
}

export type WebSocketConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

/**
 * WebSocket client for real-time collaboration communication
 */
export class CollaborationWebSocketClient {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private connectionState: WebSocketConnectionState = 'disconnected';
  private eventHandlers = new Map<string, Set<WebSocketEventHandler>>();
  private messageQueue: WebSocketMessage[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastHeartbeat = 0;

  constructor(config: WebSocketConfig) {
    this.config = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      messageQueueSize: 1000,
      protocols: [],
      ...config
    };
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      return;
    }

    this.connectionState = 'connecting';
    this.emit('connection-state-changed', { state: this.connectionState });

    try {
      this.ws = new WebSocket(this.config.url, this.config.protocols);
      this.setupWebSocketHandlers();

      // Wait for connection to be established
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 10000);

        const originalOnOpen = this.ws!.onopen;
        const originalOnError = this.ws!.onerror;

        this.ws!.onopen = (event) => {
          clearTimeout(timeout);
          if (originalOnOpen) originalOnOpen.call(this.ws, event);
          resolve();
        };

        this.ws!.onerror = (error) => {
          clearTimeout(timeout);
          if (originalOnError) originalOnError.call(this.ws, error);
          reject(error);
        };
      });

    } catch (error) {
      this.connectionState = 'failed';
      this.emit('connection-state-changed', { state: this.connectionState, error });
      throw error;
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.connectionState = 'disconnected';
    this.emit('connection-state-changed', { state: this.connectionState });
  }

  /**
   * Send a message through the WebSocket
   */
  send(type: string, payload: any, userId?: string): void {
    const message: WebSocketMessage = {
      id: crypto.randomUUID(),
      type,
      payload,
      timestamp: Date.now(),
      userId
    };

    if (this.connectionState === 'connected' && this.ws) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        this.queueMessage(message);
      }
    } else {
      this.queueMessage(message);
    }
  }

  /**
   * Add event listener for WebSocket messages
   */
  on(eventType: string, handler: WebSocketEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  /**
   * Remove event listener for WebSocket messages
   */
  off(eventType: string, handler: WebSocketEventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventType);
      }
    }
  }

  /**
   * Get current connection state
   */
  getConnectionState(): WebSocketConnectionState {
    return this.connectionState;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  /**
   * Get connection latency in milliseconds
   */
  getLatency(): number {
    return this.lastHeartbeat > 0 ? Date.now() - this.lastHeartbeat : -1;
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.connectionState = 'connected';
      this.reconnectAttempts = 0;
      this.emit('connection-state-changed', { state: this.connectionState });
      
      // Send queued messages
      this.flushMessageQueue();
      
      // Start heartbeat
      this.startHeartbeat();
    };

    this.ws.onclose = (event) => {
      this.connectionState = 'disconnected';
      this.emit('connection-state-changed', { 
        state: this.connectionState, 
        code: event.code, 
        reason: event.reason 
      });

      // Stop heartbeat
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }

      // Attempt reconnection if not a clean close
      if (event.code !== 1000 && this.reconnectAttempts < this.config.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('connection-error', { error });
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: WebSocketMessage): void {
    // Handle heartbeat responses
    if (message.type === 'heartbeat-response') {
      this.lastHeartbeat = message.timestamp;
      return;
    }

    // Emit message to registered handlers
    this.emit(message.type, message);
    this.emit('message', message);
  }

  /**
   * Emit event to registered handlers
   */
  private emit(eventType: string, data: any): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in WebSocket event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Queue message for later sending
   */
  private queueMessage(message: WebSocketMessage): void {
    if (this.messageQueue.length >= this.config.messageQueueSize) {
      // Remove oldest message to make room
      this.messageQueue.shift();
    }
    this.messageQueue.push(message);
  }

  /**
   * Send all queued messages
   */
  private flushMessageQueue(): void {
    if (!this.ws || this.connectionState !== 'connected') return;

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Failed to send queued message:', error);
        // Put message back at front of queue
        this.messageQueue.unshift(message);
        break;
      }
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.connectionState = 'reconnecting';
    this.emit('connection-state-changed', { state: this.connectionState });

    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.connectionState = 'failed';
          this.emit('connection-state-changed', { state: this.connectionState });
        }
      });
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      if (this.connectionState === 'connected' && this.ws) {
        this.send('heartbeat', { timestamp: Date.now() });
      }
    }, this.config.heartbeatInterval);
  }
}