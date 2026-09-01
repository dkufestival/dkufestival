import { API_BASE_URL } from './config.js';
import { clearAdminToken, clearParticipantAuth, getAdminToken, getParticipantAuth } from './auth.js';

let toastHandler = (message) => window.alert(message);

export function setToastHandler(handler) {
  toastHandler = handler;
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || code || '요청 처리 중 오류가 발생했습니다.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function tokenFor(role) {
  if (role === 'ADMIN') return getAdminToken();
  return getParticipantAuth()?.token;
}

export async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    auth = false,
    role = 'PARTICIPANT',
    toast = true,
  } = options;

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = tokenFor(role);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload.error || {};
    if (response.status === 401) {
      if (role === 'ADMIN') clearAdminToken();
      else clearParticipantAuth();
    }
    const apiError = new ApiError(response.status, error.code, error.message, error.details);
    if (toast) toastHandler(apiError.message);
    throw apiError;
  }

  return Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
