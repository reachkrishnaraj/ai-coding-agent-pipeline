import { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * WebSocket connection hook
 * Manages Socket.io connection with auto-reconnect
 */
export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    // Initialize Socket.io connection
    const socket = io(API_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    // Connection event handlers
    socket.on('connect', () => {
      console.log('[WebSocket] Connected:', socket.id);
      setIsConnected(true);
      setIsReconnecting(false);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[WebSocket] Disconnected:', reason);
      setIsConnected(false);

      if (reason === 'io server disconnect') {
        // Server disconnected us, manually reconnect
        socket.connect();
      }
    });

    socket.on('reconnect_attempt', () => {
      console.log('[WebSocket] Attempting to reconnect...');
      setIsReconnecting(true);
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log(`[WebSocket] Reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
      setIsReconnecting(false);
    });

    socket.on('reconnect_error', (error) => {
      console.error('[WebSocket] Reconnection error:', error);
    });

    socket.on('reconnect_failed', () => {
      console.error('[WebSocket] Reconnection failed after all attempts');
      setIsReconnecting(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error);
      setIsConnected(false);
    });

    socket.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });

    socketRef.current = socket;

    return () => {
      console.log('[WebSocket] Cleaning up connection');
      socket.disconnect();
    };
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    isReconnecting,
  };
}
