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
