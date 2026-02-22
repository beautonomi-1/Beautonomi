/**
 * React hook for WebSocket connections
 */

import { useEffect, useState } from 'react';
import { getWebSocketManager, type WebSocketEvent } from '@/lib/websocket/client';

export function useWebSocket(userId?: string, providerId?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);

  useEffect(() => {
    const manager = getWebSocketManager();
    
    // Connect
    manager.connect(userId, providerId)
      .then(() => setIsConnected(true))
      .catch(() => setIsConnected(false));

    // Subscribe to all events
    const unsubscribe = manager.on('*', (event) => {
      setLastEvent(event);
    });

    // Update connection status
    const checkInterval = setInterval(() => {
      setIsConnected(manager.isConnected());
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(checkInterval);
    };
  }, [userId, providerId]);

  return { isConnected, lastEvent };
}
