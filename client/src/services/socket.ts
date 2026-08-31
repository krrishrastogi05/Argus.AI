import { io, Socket } from 'socket.io-client';

import { API_URL, getToken } from './api';

let socket: Socket | null = null;

// One authenticated connection per session. The server rejects the handshake
// without a valid token and puts the socket in rooms based on the user's role.
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: getToken() }), // re-read on every reconnect
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
