import { io, Socket } from 'socket.io-client';

import { API_URL, getToken } from './api';

let socket: Socket | null = null;

// One socket per session. The server refuses it without a valid token.
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: getToken() }), // read again on each reconnect
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
