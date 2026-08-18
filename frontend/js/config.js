export const API_BASE_URL =
  window.PIUM_CONFIG?.API_BASE_URL ||
  localStorage.getItem('piumApiBaseUrl') ||
  'http://localhost:3000';

export const SOCKET_URL =
  window.PIUM_CONFIG?.SOCKET_URL ||
  localStorage.getItem('piumSocketUrl') ||
  API_BASE_URL;

export const STORAGE_KEYS = {
  clientId: 'piumClientId',
  participantAuth: 'piumParticipantAuth',
  adminToken: 'piumAdminToken',
};
