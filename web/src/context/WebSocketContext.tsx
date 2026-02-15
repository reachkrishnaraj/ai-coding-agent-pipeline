import React, { createContext, useContext, ReactNode } from 'react';
import { Socket } from 'socket.io-client';
import { useWebSocket } from '../hooks/useWebSocket';

interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isReconnecting: boolean;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps {
  children: ReactNode;
}

/**
 * WebSocket Context Provider
 * Provides Socket.io connection to all child components
 */
export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { socket, isConnected, isReconnecting } = useWebSocket();

  return (
    <WebSocketContext.Provider value={{ socket, isConnected, isReconnecting }}>
      {children}
    </WebSocketContext.Provider>
  );
}

/**
 * Hook to access WebSocket context
 */
export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}
