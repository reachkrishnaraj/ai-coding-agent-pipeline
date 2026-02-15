import React from 'react';
import { useWebSocketContext } from '../context/WebSocketContext';

/**
 * Connection Status Indicator
 * Shows online/offline/reconnecting status in the UI
 */
export function ConnectionStatus() {
  const { isConnected, isReconnecting } = useWebSocketContext();

  if (isConnected) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
        <span>Connected</span>
      </div>
    );
  }

  if (isReconnecting) {
    return (
      <div className="flex items-center gap-2 text-sm text-yellow-600">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
        </span>
        <span>Reconnecting...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-red-600">
      <span className="relative flex h-2 w-2">
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
      </span>
      <span>Disconnected</span>
    </div>
  );
}
