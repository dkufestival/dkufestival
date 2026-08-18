# Socket.IO API

이 문서는 현재 `backend/src/socket` 및 컨트롤러의 `io.emit` 구현 기준

## 연결

```js
import { io } from 'socket.io-client';

const socket = io(SERVER_URL, { auth: { token } });
```

토큰은 관리자 JWT 또는 참가자 JWT다. 참가자 JWT는 연결 시 참가자 존재 여부, 세션 활성 상태, 만료 시간을 검증한다.

## 자동 입장 방

| 방 | 대상 | 설명 |
| --- | --- | --- |
| `participants` | 참가자 | 모든 참가자가 연결 시 자동 입장 |
| `session:<sessionId>` | 참가자 | 자기 테이블 세션 방 |
| `participant:<participantId>` | 참가자 | 자기 참가자 전용 방 |
| `admins` | 관리자 | 관리자 연결 시 자동 입장 |

## 수동 입장 방

| 방 | 입장 방법 | 설명 |
| --- | --- | --- |
| `chat:<roomId>` | `chat:join` | 채팅 메시지 수신용 방 |
| `game:<gameId>` | `game:accept` 후 서버가 양쪽 세션 소켓을 입장시킴 | 1:1 게임 상태 수신용 방 |

## Callback 형식

문서의 표준 callback 형식:

성공:

```json
{ "ok": true, "data": {} }
```

실패:

```json
{ "ok": false, "error": "ERROR_CODE", "message": "설명" }
```

주의: 현재 구현 중 `chat:join` 성공은 `{ "ok": true }`만 반환하고, 일부 실패 응답은 `message` 없이 `error`만 반환할 수 있다.

## 서버 송신 이벤트

| 방향 | 이벤트명 | 역할 | Payload | Callback | 설명 |
| --- | --- | --- | --- | --- | --- |
| 서버 -> 참가자 | `participant:joined` | 참가자 | `{ sessionId, participant }` | 없음 | QR 입장 성공 시 전송 |
| 서버 -> 참가자 | `participant:updated` | 참가자 | `{ participant }` | 없음 | 닉네임 변경 시 `session:<sessionId>`로 전송 |
| 서버 -> 참가자 | `table:updated` | 참가자/전체 | `{ session }` 또는 `{ sessionId }` | 없음 | 인원 변경, 입장, 관리자 입실 등 테이블 정보 변경 |
| 서버 -> 참가자 | `table:extended` | 참가자 | `{ session, paymentReference? }` | 없음 | 관리자 연장 또는 시간 초기화 |
| 서버 -> 참가자 | `table:checked-out` | 참가자 | `{ session }` | 없음 | 관리자 퇴실 처리 |
| 서버 -> 참가자 | `join:created` | 참가자 | `JoinRequest` | 없음 | 합석 요청 생성 |
| 서버 -> 참가자 | `join:accepted` | 참가자 | `JoinRequest` | 없음 | 합석 요청 수락 |
| 서버 -> 참가자 | `join:rejected` | 참가자 | `JoinRequest` | 없음 | 합석 요청 거절 |
| 서버 -> 참가자 | `join:cancelled` | 참가자 | `JoinRequest` | 없음 | 합석 요청 취소 |
| 서버 -> 참가자 | `chat:room-created` | 참가자 | `ChatRoom` 또는 `{ room }` | 없음 | 합석 요청 또는 채팅방 생성 |
| 서버 -> 참가자 | `notice:created` | 참가자 | `Notice` | 없음 | 관리자 공지 생성 |
| 서버 -> 참가자/관리자 | `song:requested` | 참가자/관리자 | `SongRequest` | 없음 | 신청곡 생성 |
| 서버 -> 참가자/관리자 | `song:cancelled` | 참가자/관리자 | `SongRequest` | 없음 | 신청곡 취소 |
| 서버 -> 참가자/관리자 | `song:completed` | 참가자/관리자 | `SongRequest` | 없음 | 신청곡 완료 |

합석 요청 생성 시 `join:created`와 `chat:room-created`가 함께 전송된다. 채팅방은 요청 수락 전에도 사용할 수 있다.

## 채팅 이벤트

| 방향 | 이벤트명 | 역할 | Payload | Callback 응답 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 클라이언트 -> 서버 | `chat:join` | 참가자 | `{ "roomId": 1 }` | 성공 `{ "ok": true }` | 채팅방 소속 세션이면 `chat:<roomId>` 입장 |
| 클라이언트 -> 서버 | `chat:send` | 참가자 | `{ "roomId": 1, "content": "안녕하세요" }` | `{ "ok": true, "data": ChatMessage }` | JWT의 `participantId`를 발신자로 저장 |
| 서버 -> 클라이언트 | `chat:message` | 참가자 | `ChatMessage` | 없음 | `chat:<roomId>`로 메시지 전송 |

메시지 저장 필드는 `senderParticipantId`다. 조회 응답에는 `senderParticipant`의 `id`, `nickname`이 포함된다.

## 1:1 게임 이벤트

게임 타입 허용값은 `MISSION`, `OX_QUIZ`, `REACTION`, `RPS`다.

| 방향 | 이벤트명 | 역할 | Payload | Callback 응답 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 클라이언트 -> 서버 | `game:register` | 참가자 | `{ "sessionId": 15 }` | `{ "ok": true }` | 현재 소켓의 세션과 payload 세션이 같은지 확인 |
| 클라이언트 -> 서버 | `game:invite` | 참가자 | `{ "targetSessionId": 20, "type": "RPS", "state": {} }` | `{ "ok": true, "data": GameSession }` | 대상 세션에 게임 초대 |
| 서버 -> 클라이언트 | `game:invited` | 참가자 | `GameSession` | 없음 | 대상 세션에 초대 전송 |
| 클라이언트 -> 서버 | `game:accept` | 참가자 | `{ "gameId": 1 }` | `{ "ok": true, "data": GameSession }` | 대상 세션 참가자가 초대 수락 |
| 서버 -> 클라이언트 | `game:started` | 참가자 | `GameSession` | 없음 | 양쪽 세션을 `game:<gameId>` 방에 넣고 시작 알림 |
| 클라이언트 -> 서버 | `game:action` | 참가자 | `{ "gameId": 1, "action": "SELECT", "state": {} }` | `{ "ok": true, "data": GameSession }` | 게임 상태 갱신 |
| 서버 -> 클라이언트 | `game:state` | 참가자 | `GameSession` | 없음 | 1:1 게임 상태 전파 |
| 클라이언트 -> 서버 | `game:end` | 참가자 | `{ "gameId": 1, "cancelled": false, "state": {} }` | `{ "ok": true, "data": GameSession }` | 게임 종료 또는 취소 |
| 서버 -> 클라이언트 | `game:ended` | 참가자 | `GameSession` | 없음 | 게임 종료 알림 |

현재 1:1 게임 권한은 세션 단위로 검사한다. `game:action`은 상태에 `lastActorParticipantId`를 함께 기록한다.

## 관리자 전체 게임 이벤트

| 방향 | 이벤트명 | 역할 | Payload | Callback 응답 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 클라이언트 -> 서버 | `game:global:start` | 관리자 | `{ "type": "OX_QUIZ", "state": {} }` | `{ "ok": true, "data": GameSession }` | 전체 참가자 대상 게임 시작 |
| 서버 -> 클라이언트 | `game:global:started` | 참가자 | `GameSession` | 없음 | 모든 참가자에게 전체 게임 시작 알림 |
| 클라이언트 -> 서버 | `game:action` | 참가자 | `{ "gameId": 1, "action": "ANSWER", "state": {} }` | `{ "ok": true, "data": GameSession }` | 전체 게임 응답 제출 |
| 서버 -> 클라이언트 | `game:global:state` | 관리자 | `GameSession` | 없음 | 관리자에게 전체 게임 응답 상태 전달 |
| 클라이언트 -> 서버 | `game:global:end` | 관리자 | `{ "gameId": 1, "state": {} }` | `{ "ok": true, "data": GameSession }` | 전체 게임 종료 |
| 서버 -> 클라이언트 | `game:global:ended` | 참가자 | `GameSession` | 없음 | 모든 참가자에게 전체 게임 종료 알림 |

전체 게임 응답은 `GameSession.state.responses[participantId]`에 저장된다.

## 공지 이벤트

| 방향 | 이벤트명 | 역할 | Payload | Callback | 설명 |
| --- | --- | --- | --- | --- | --- |
| 서버 -> 참가자 | `notice:created` | 참가자 | `Notice` | 없음 | `POST /api/notices` 성공 시 전송 |

공지 생성 자체는 REST API로만 구현되어 있다.
