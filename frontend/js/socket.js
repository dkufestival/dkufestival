import { attachPinballBridge } from './pinball-bridge.js';
import { SOCKET_URL } from './config.js';
import { getAdminToken, getMonitorAuth, getParticipantAuth } from './auth.js';

let socket = null;
let detachPinballBridge = null;

export function connectSocket(role = 'PARTICIPANT') {
  const token = role === 'ADMIN' ? getAdminToken() : role === 'MONITOR' ? getMonitorAuth()?.token : getParticipantAuth()?.token;
  if (!token || !window.io) return null;
  detachPinballBridge?.();
  if (socket) socket.disconnect();
  socket = window.io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  detachPinballBridge = attachPinballBridge(socket);
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  detachPinballBridge?.();
  if (socket) socket.disconnect();
  socket = null;
}
