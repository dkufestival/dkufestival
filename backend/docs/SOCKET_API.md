# Socket.IO API

연결:

```js
io(SERVER_URL, { auth: { token } });
```

참가자는 자동으로 `participants`, `session:<sessionId>`, `participant:<participantId>` 방에 들어갑니다. 관리자는 `admins` 방에 들어갑니다.

## 클라이언트 -> 서버

| Event | Role | Payload | Callback | 설명 |
| --- | --- | --- | --- | --- |
| `chat:join` | 참가자 | `{ "roomId": 1 }` | `{ "ok": true }` | `ACTIVE` 채팅방만 입장 |
| `chat:send` | 참가자 | `{ "roomId": 1, "content": "안녕하세요" }` | `{ "ok": true, "data": ChatMessage }` | `ACTIVE` 방 멤버만 전송 |
| `game:global:start` | 관리자 | `{ "type": "TIME_MATCH", "state": { "targetMs": 5250 } }` | `{ "ok": true, "data": GameSession }` | 중앙 목표 시간으로 시간 맞추기 시작 |
| `game:action` | 참가자 | `{ "gameId": 1, "action": "STOP", "state": { "elapsedMs": 5251 } }` | `{ "ok": true, "data": GameSession }` | 서버가 목표 대비 오차와 성공 여부 계산 |
| `game:global:end` | 관리자 | `{ "gameId": 1 }` | `{ "ok": true, "data": GameSession }` | 진행 중인 전체 게임 종료 |

`chat:send`는 일반 메시지 실시간 전송만 수행하며 Web Push를 보내지 않습니다.

## 서버 -> 클라이언트

| Event | 대상 | Payload | 설명 |
| --- | --- | --- | --- |
| `chat:request-received` | 양쪽 세션 | `ChatRoom` | 요청 생성/수신 |
| `chat:request-cancelled` | 양쪽 세션 | `ChatRoom` | 요청 취소 |
| `chat:request-rejected` | 양쪽 세션 | `ChatRoom` | 요청 거절 |
| `chat:request-expired` | 양쪽 세션 | `ChatRoom` | 1분 만료 |
| `chat:started` | 양쪽 세션 | `ChatRoom` | 요청 수락, 전체 화면 채팅 전환 |
| `chat:active` | 해당 참가자/세션 | `ChatRoom` | 접속/재접속 시 활성 채팅 복구 |
| `chat:message` | `chat:<roomId>` | `ChatMessage` | 메시지 수신 |
| `chat:ended` | 양쪽 세션 | `ChatRoom` | 사용자/관리자/세션 종료 |
| `notification:created` | 관련 세션 | `{ type, roomId, message }` | 인앱 시스템 알림 |
| `game:global:started` | 전체 참가자 | `GameSession` | 관리자 설정 목표 시간을 포함한 게임 시작 |
| `game:global:state` | 관리자 | `GameSession` | 참가자의 시간 기록과 서버 계산 결과 수신 |
| `game:global:ended` | 관리자·참가자 | `GameSession` | 게임 종료 및 참가자 화면 복귀 |

기존 `join:*` 및 `chat:room-created` 이벤트는 제거되었습니다.

## 기타 유지 이벤트

- `participant:joined`
- `participant:updated`
- `participant:left`
- `table:updated`
- `table:extended`
- `table:checked-out`
- `notice:created`
- `song:requested`
- `song:cancelled`
- `song:completed`
- `game:*`
