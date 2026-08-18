const defaultServerUrl = `${window.location.protocol}//${window.location.hostname || 'localhost'}:3000`;

export const API_BASE_URL =
  window.PIUM_CONFIG?.API_BASE_URL ||
  localStorage.getItem('piumApiBaseUrl') ||
  defaultServerUrl;

export const SOCKET_URL =
  window.PIUM_CONFIG?.SOCKET_URL ||
  localStorage.getItem('piumSocketUrl') ||
  API_BASE_URL;

export const STORAGE_KEYS = {
  clientId: 'piumClientId',
  participantAuth: 'piumParticipantAuth',
  adminToken: 'piumAdminToken',
};
