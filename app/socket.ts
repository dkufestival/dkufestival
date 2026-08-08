import { io } from 'socket.io-client';
import { SOCKET_URL } from './lib/api';
export const GAME_ROUTES = {
  OX: '/OXinplayScreen',
  WORD: '/WordinplayScreen',
  TEXT: '/TextinplayScreen',
  IMAGE: '/ImageinplayScreen',
  RSP: '/RSPinplayScreen',
  RPS: '/ParticipantHomeScreen',
  BALANCE: '/ParticipantHomeScreen',
  CHOSUNG: '/ParticipantHomeScreen',
  MUSIC: '/MusicquizPlayerScreen',
} as const;

export type GameType = keyof typeof GAME_ROUTES;

export function normalizeRoomCode(roomCode?: string | string[]) {
  const value = Array.isArray(roomCode) ? roomCode[0] : roomCode;

  return String(value || '').trim().toUpperCase();
}

export function isGameType(gameType?: string): gameType is GameType {
  return Boolean(gameType && Object.prototype.hasOwnProperty.call(GAME_ROUTES, gameType));
}

const socketOptions = {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 800,
  timeout: 10000,
};

// Transport를 고정하지 않아 Expo Go 네트워크 환경에 따라 polling에서 websocket으로 전환할 수 있습니다.
export const socket = SOCKET_URL ? io(SOCKET_URL, socketOptions) : io(socketOptions);

export default socket;
