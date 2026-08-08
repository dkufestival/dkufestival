import { apiRequest } from './api';
import { normalizeRoomCode, socket } from '../socket';

const SOCKET_TIMEOUT_MS = 5000;

function emitWithAck(eventName, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(SOCKET_TIMEOUT_MS).emit(eventName, payload, (error, response) => {
      if (error) {
        reject(new Error('실시간 서버 응답이 없습니다.'));
        return;
      }
      if (response?.ok === false) {
        reject(new Error(response.message || '실시간 이벤트 처리에 실패했습니다.'));
        return;
      }
      resolve(response);
    });
  });
}

async function getCurrentRoomCode() {
  const data = await apiRequest('/rooms/current');
  return normalizeRoomCode(data.room?.roomCode || data.room?.room_code);
}

async function joinHostRoom(roomCode) {
  const normalizedRoomCode = normalizeRoomCode(roomCode || await getCurrentRoomCode());
  if (!normalizedRoomCode) {
    throw new Error('방 코드를 찾을 수 없습니다.');
  }
  if (!socket.connected) {
    socket.connect();
  }
  await emitWithAck('joinRoom', { roomCode: normalizedRoomCode, role: 'host' });
  return normalizedRoomCode;
}

export async function notifyGameStarted(gameType, roomCode) {
  const normalizedRoomCode = await joinHostRoom(roomCode);
  await emitWithAck('startGame', { roomCode: normalizedRoomCode, gameType });
  return normalizedRoomCode;
}

export async function notifyGameEnded(roomCode) {
  const normalizedRoomCode = await joinHostRoom(roomCode);
  await emitWithAck('endGame', { roomCode: normalizedRoomCode });
  return normalizedRoomCode;
}
