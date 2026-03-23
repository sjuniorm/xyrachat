import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'https://api.xyra.chat';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    if (!socket) {
      socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      });

      socket.on('connect', () => {
        console.log('WebSocket connected');
        socket?.emit('presence:online');
      });

      socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
      });

      socket.on('connect_error', (err) => {
        console.error('WebSocket connection error:', err.message);
      });
    }

    socketRef.current = socket;

    return () => {
      // Don't disconnect on unmount — keep connection alive across pages
    };
  }, []);

  const joinConversation = useCallback((conversationId: string) => {
    socket?.emit('join:conversation', conversationId);
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    socket?.emit('leave:conversation', conversationId);
  }, []);

  const startTyping = useCallback((conversationId: string) => {
    socket?.emit('typing:start', { conversationId });
  }, []);

  const stopTyping = useCallback((conversationId: string) => {
    socket?.emit('typing:stop', { conversationId });
  }, []);

  const onNewMessage = useCallback((callback: (message: any) => void) => {
    socket?.on('message:new', callback);
    return () => { socket?.off('message:new', callback); };
  }, []);

  const onConversationUpdated = useCallback((callback: (data: any) => void) => {
    socket?.on('conversation:updated', callback);
    return () => { socket?.off('conversation:updated', callback); };
  }, []);

  const onTypingStart = useCallback((callback: (data: any) => void) => {
    socket?.on('typing:start', callback);
    return () => { socket?.off('typing:start', callback); };
  }, []);

  const onTypingStop = useCallback((callback: (data: any) => void) => {
    socket?.on('typing:stop', callback);
    return () => { socket?.off('typing:stop', callback); };
  }, []);

  const onPresenceUpdate = useCallback((callback: (data: any) => void) => {
    socket?.on('presence:update', callback);
    return () => { socket?.off('presence:update', callback); };
  }, []);

  return {
    socket: socketRef.current,
    joinConversation,
    leaveConversation,
    startTyping,
    stopTyping,
    onNewMessage,
    onConversationUpdated,
    onTypingStart,
    onTypingStop,
    onPresenceUpdate,
  };
}
