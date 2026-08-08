const configuredServerUrl = String(process.env.EXPO_PUBLIC_SERVER_URL || '').trim();

export const SERVER_BASE_URL = configuredServerUrl.replace(/\/+$/, '');
export const API_BASE_URL = `${SERVER_BASE_URL}/api`;
export const SOCKET_URL = SERVER_BASE_URL;

export function getServerConfigurationError() {
  if (!SERVER_BASE_URL) {
    return 'EXPO_PUBLIC_SERVER_URL이 설정되지 않았습니다. app/.env에 개발 PC의 Wi-Fi IP를 설정해주세요.';
  }
  if (!/^https?:\/\//i.test(SERVER_BASE_URL)) {
    return `서버 주소 형식이 올바르지 않습니다: ${SERVER_BASE_URL}`;
  }
  return '';
}

export async function serverFetch(path, options = {}) {
  const configurationError = getServerConfigurationError();
  if (configurationError) throw new Error(configurationError);

  const target = /^https?:\/\//i.test(path)
    ? path
    : `${SERVER_BASE_URL}${String(path || '').startsWith('/') ? '' : '/'}${path}`;

  try {
    return await fetch(target, options);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error || '');
    throw new Error(
      `서버에 연결할 수 없습니다 (${SERVER_BASE_URL}). `
      + `휴대폰과 개발 PC의 Wi-Fi, 서버 실행 상태, 방화벽을 확인해주세요.`
      + (detail ? ` 원인: ${detail}` : '')
    );
  }
}

export async function checkServerConnection() {
  const configurationError = getServerConfigurationError();
  if (configurationError) {
    return { ok: false, message: configurationError, url: SERVER_BASE_URL };
  }

  try {
    const response = await serverFetch('/');
    return {
      ok: response.ok,
      message: response.ok ? await response.text() : `HTTP ${response.status}`,
      url: SERVER_BASE_URL,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      url: SERVER_BASE_URL,
    };
  }
}

let activeRoomId = null;
let currentUser = null;
let currentMember = null;

export function setActiveRoomId(roomId) {
  activeRoomId = roomId || null;
}

export function getActiveRoomId() {
  return activeRoomId;
}

export function setCurrentUser(user) {
  currentUser = user || null;
}

export function getCurrentUser() {
  return currentUser;
}

export function setCurrentMember(member) {
  currentMember = member || null;
}

export function getCurrentMember() {
  return currentMember;
}

export function clearParticipantSession() {
  activeRoomId = null;
  currentMember = null;
}

function withActiveRoom(path) {
  if (!activeRoomId || path.includes('roomId=')) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}roomId=${encodeURIComponent(activeRoomId)}`;
}

export async function apiRequest(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await serverFetch(`${API_BASE_URL}${withActiveRoom(path)}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || '서버 요청에 실패했습니다.');
  }

  return data;
}

export function toServerAssetUrl(path) {
  const value = String(path || '').trim();
  if (!value || /^(?:https?:|data:)/i.test(value)) return value;
  return `${SERVER_BASE_URL}${value.startsWith('/') ? '' : '/'}${value}`;
}

export function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
