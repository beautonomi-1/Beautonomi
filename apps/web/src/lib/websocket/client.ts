/**
 * WebSocket Client for Real-Time Updates
 * Replaces polling with WebSocket connections for instant updates
 */

export type WebSocketEventType = 
  | 'booking_created'
  | 'booking_updated'
  | 'booking_cancelled'
  | 'availability_changed'
  | 'waitlist_match'
  | 'appointment_status_changed';

export interface WebSocketEvent {
  type: WebSocketEventType;
  data: any;
  timestamp: string;
}

export type WebSocketEventHandler = (event: WebSocketEvent) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private handlers: Map<WebSocketEventType | '*', Set<WebSocketEventHandler>> = new Map();
  private isConnecting = false;
  private url: string;

  constructor() {
    // Use wss:// in production, ws:// in development
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
    this.url = `${protocol}//${host}/api/ws`;
  }

  /**
   * Connect to WebSocket server
   */
  connect(userId?: string, providerId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        // Wait for existing connection attempt
        const checkInterval = setInterval(() => {
          if (!this.isConnecting) {
            clearInterval(checkInterval);
            if (this.ws?.readyState === WebSocket.OPEN) {
              resolve();
            } else {
              reject(new Error('Connection failed'));
            }
          }
        }, 100);
        return;
      }

      this.isConnecting = true;

      try {
        // Add query params for authentication and context
        const params = new URLSearchParams();
        if (userId) params.set('userId', userId);
        if (providerId) params.set('providerId', providerId);
        const wsUrl = `${this.url}?${params.toString()}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          console.log('[WebSocket] Connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketEvent = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('[WebSocket] Error parsing message:', error);
          }
        };

        this.ws.onerror = (error) => {
          this.isConnecting = false;
          console.error('[WebSocket] Error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          this.isConnecting = false;
          console.log('[WebSocket] Disconnected');
          this.attemptReconnect(userId, providerId);
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(userId?: string, providerId?: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      console.log(`[WebSocket] Reconnecting (attempt ${this.reconnectAttempts})...`);
      this.connect(userId, providerId).catch(() => {
        // Reconnection will be attempted again
      });
    }, delay);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(event: WebSocketEvent) {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`[WebSocket] Error in handler for ${event.type}:`, error);
        }
      });
    }

    // Also call wildcard handlers
    const wildcardHandlers = this.handlers.get('*' as WebSocketEventType);
    if (wildcardHandlers) {
      wildcardHandlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error('[WebSocket] Error in wildcard handler:', error);
        }
      });
    }
  }

  /**
   * Subscribe to WebSocket events
   */
  on(eventType: WebSocketEventType | '*', handler: WebSocketEventHandler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(eventType);
        }
      }
    };
  }

  /**
   * Unsubscribe from WebSocket events
   */
  off(eventType: WebSocketEventType | '*', handler: WebSocketEventHandler) {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
      }
    }
  }

  /**
   * Send message to WebSocket server
   */
  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[WebSocket] Cannot send message, connection not open');
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.handlers.clear();
    this.reconnectAttempts = 0;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let wsManager: WebSocketManager | null = null;

export function getWebSocketManager(): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager();
  }
  return wsManager;
}

// Note: React hook should be in a separate file (hooks/useWebSocket.ts)
// This file is for the core WebSocket manager only
