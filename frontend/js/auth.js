import { STORAGE_KEYS } from './config.js';

export function getClientId() {
  let clientId = localStorage.getItem(STORAGE_KEYS.clientId);
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEYS.clientId, clientId);
  }
  return clientId;
}

export function saveParticipantAuth(data) {
  const payload = {
    token: data.token,
    tableId: data.table?.id,
    tableNumber: data.table?.tableNumber,
    tableSessionId: data.session?.id,
    participantId: data.participant?.id,
    participant: data.participant,
  };
  localStorage.setItem(STORAGE_KEYS.participantAuth, JSON.stringify(payload));
  return payload;
}

export function getParticipantAuth() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.participantAuth) || 'null');
  } catch {
    return null;
  }
}

export function clearParticipantAuth() {
  localStorage.removeItem(STORAGE_KEYS.participantAuth);
}

export function saveAdminToken(token) {
  localStorage.setItem(STORAGE_KEYS.adminToken, token);
}

export function getAdminToken() {
  return localStorage.getItem(STORAGE_KEYS.adminToken);
}

export function clearAdminToken() {
  localStorage.removeItem(STORAGE_KEYS.adminToken);
}
