import { SOCKET_URL } from './config.js';
import { getAdminToken, getParticipantAuth } from './auth.js';

let socket = null;

export function connectSocket(role = 'PARTICIPANT') {
  const token = role === 'ADMIN' ? getAdminToken() : getParticipantAuth()?.token;
  if (!token || !window.io) return null;
  if (socket) socket.disconnect();
  socket = window.io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) socket.disconnect();
  socket = null;
}
