# Socket API

## 프론트 연동 필수

프론트엔드는 `.env` 등에 서버 주소를 설정하고 같은 주소로 Socket.IO를 연결해야 합니다.

```js
import { io } from 'socket.io-client';

const socket = io(SERVER_URL);
```

모든 게임 이벤트의 콜백은 성공 시 `{ ok: true, data? }`, 실패 시
`{ ok: false, error, message }` 형식입니다.

### 1. 테이블 세션 등록

소켓 연결 직후 REST API에서 발급받은 활성 `tableSessionId`를 등록해야 게임 초대를 받을 수 있습니다.

```js
socket.emit('game:register', { sessionId: tableSessionId }, console.log);
```

### 2. 게임 초대

```js
socket.emit(
  'game:invite',
  { targetSessionId, type: 'RPS', state: {} },
  (response) => console.log(response)
);

socket.on('game:invited', (game) => {
  // game.id를 수락할 때 gameId로 사용
});
```

### 3. 게임 수락 및 시작

```js
socket.emit('game:accept', { gameId }, console.log);
socket.on('game:started', (game) => {});
```

### 4. 게임 액션 및 상태 동기화

```js
socket.emit('game:action', { gameId, action: 'SELECT', state: { choice: 'ROCK' } });
socket.on('game:state', (game) => {});
```

### 5. 게임 종료

```js
socket.emit('game:end', { gameId, state: { winnerSessionId } });
socket.on('game:ended', (game) => {});
```

## 이벤트 목록

| 방향 | 이벤트 | 필수 Payload | 설명 |
| --- | --- | --- | --- |
| 프론트 → 서버 | `game:register` | `{ sessionId }` | 현재 소켓과 테이블 세션 연결 |
| 프론트 → 서버 | `game:invite` | `{ targetSessionId, type, state? }` | 상대 테이블에 게임 초대 |
| 서버 → 프론트 | `game:invited` | `GameSession` | 대상 테이블에 초대 전달 |
| 프론트 → 서버 | `game:accept` | `{ gameId }` | 초대 수락 |
| 서버 → 프론트 | `game:started` | `GameSession` | 두 테이블에 게임 시작 전달 |
| 프론트 → 서버 | `game:action` | `{ gameId, action, state? }` | 게임 상태 변경 |
| 서버 → 프론트 | `game:state` | `GameSession` | 최신 게임 상태 동기화 |
| 프론트 → 서버 | `game:end` | `{ gameId, cancelled?, state? }` | 게임 종료 또는 취소 |
| 서버 → 프론트 | `game:ended` | `GameSession` | 최종 상태 전달 |

## 채팅 이벤트

| 방향 | 이벤트 | Payload |
| --- | --- | --- |
| 프론트 → 서버 | `chat:join` | `{ roomId }` |
| 프론트 → 서버 | `chat:send` | `{ roomId, senderSessionId, content }` |
| 서버 → 프론트 | `chat:message` | 저장된 메시지 객체 |

> `sessionId`는 물리 테이블의 `tableId`가 아니라 현재 사용 팀의 `tableSessionId`입니다.
