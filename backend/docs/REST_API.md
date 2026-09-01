# REST API

모든 참가자/관리자 보호 API는 `Authorization: Bearer <token>`을 사용합니다.

## ChatRoom 상태

`chat_rooms`는 요청과 활성 채팅을 모두 표현합니다.

- `PENDING`: 대표가 보낸 요청, 1분 뒤 만료
- `ACTIVE`: 상대 대표가 수락해 채팅 중
- `REJECTED`: 상대 대표가 거절
- `CANCELLED`: 요청자가 취소하거나 세션이 체크아웃됨
- `EXPIRED`: 1분 안에 응답하지 않음
- `CLOSED`: 활성 채팅 종료

종료 사유는 `USER_ENDED`, `ADMIN_ENDED`, `SESSION_CHECKED_OUT`, `SESSION_EXPIRED`입니다.

## 참가자 채팅 API

| Method | URL | Body | 설명 |
| --- | --- | --- | --- |
| `POST` | `/api/chat/requests` | `{ "targetSessionId": 20, "message": "optional" }` | 대표만 채팅 요청 생성 |
| `GET` | `/api/chat/requests?direction=sent|received&status=PENDING` | 없음 | 내 세션의 요청 목록 |
| `POST` | `/api/chat/requests/:roomId/accept` | 없음 | 대상 테이블 대표만 수락 |
| `POST` | `/api/chat/requests/:roomId/reject` | 없음 | 대상 테이블 대표만 거절 |
| `DELETE` | `/api/chat/requests/:roomId` | 없음 | 요청 테이블 대표만 취소 |
| `GET` | `/api/chat/active` | 없음 | 현재 활성 채팅 복구 |
| `GET` | `/api/chat/rooms/:roomId/messages` | 없음 | 활성 채팅 메시지 조회 |
| `POST` | `/api/chat/rooms/:roomId/end` | 없음 | 참가자 채팅 종료 |

요청 목록 응답은 `roomId`, `status`, `direction`, `requestMessage`, `requestExpiresAt`, 상대 테이블 번호/인원 정보를 포함합니다. QR 토큰과 참가자 개인 식별 정보는 반환하지 않습니다.

## 관리자 채팅 API

| Method | URL | 설명 |
| --- | --- | --- |
| `GET` | `/api/admin/chat/rooms?status=ACTIVE` | 활성 채팅 목록 |
| `POST` | `/api/admin/chat/rooms/:roomId/end` | `ADMIN_ENDED`로 강제 종료 |

## Push API

| Method | URL | Body | 설명 |
| --- | --- | --- | --- |
| `GET` | `/api/push/public-key` | 없음 | VAPID public key 반환 |
| `POST` | `/api/push/subscriptions` | 브라우저 PushSubscription JSON | 구독 저장/갱신 |
| `DELETE` | `/api/push/subscriptions` | `{ "endpoint": "..." }` 선택 | 구독 삭제 |

VAPID 미설정 시 Push API는 `PUSH_NOT_CONFIGURED`를 반환합니다. 일반 메시지는 Push 대상이 아니며, 공지/채팅 요청/수락/거절/취소/만료/종료만 시스템 알림 대상입니다.

## 농구게임 기록 API

| Method | URL | Body | 설명 |
| --- | --- | --- | --- |
| `GET` | `/api/basketball/leaderboard` | 없음 | 모든 화면에 공개되는 개인 최고점 TOP 3 |
| `GET` | `/api/basketball/state` | 없음 | 참가자의 개인 최고점과 현재 농구게임 활성 상태 |
| `POST` | `/api/basketball/scores` | `{ "gameId": 1, "score": 12 }` | 진행 중인 농구게임의 개인 최고점 갱신 |

점수 등록은 참가자 인증과 관리자가 시작한 활성 농구게임이 필요합니다. 기존 최고점보다 높은 점수만 저장되며, 순위가 바뀌면 Socket.IO `basketball:leaderboard` 이벤트로 관리자와 참가자에게 TOP 3가 즉시 전송됩니다.

## 주요 오류 코드

`HOST_REQUIRED`, `INVALID_CHAT_TARGET`, `TARGET_SESSION_NOT_FOUND`, `SESSION_CHAT_BUSY`, `CHAT_REQUEST_NOT_FOUND`, `CHAT_REQUEST_FORBIDDEN`, `CHAT_REQUEST_CLOSED`, `CHAT_REQUEST_EXPIRED`, `CHAT_ROOM_NOT_FOUND`, `CHAT_NOT_ACTIVE`, `CHAT_FORBIDDEN`, `PARTICIPANT_FORBIDDEN`, `PUSH_NOT_CONFIGURED`

## 기타 주요 API

- `GET /api/entry/context?qr=<qrToken>`
- `POST /api/entry`
- `GET /api/tables`
- `PATCH /api/tables/me`
- `GET /api/participants`
- `GET /api/participants/me`
- `PATCH /api/participants/me`
- `GET /api/notices`
- `POST /api/notices`
- `GET /api/global-chat`
- `POST /api/global-chat`
- `POST /api/admin/login`
- `GET /api/admin/tables`
- `POST /api/admin/tables/:tableId/checkin`
- `POST /api/admin/tables/:tableId/extend`
- `POST /api/admin/tables/:tableId/reset-time`
- `POST /api/admin/tables/:tableId/checkout`
- `PATCH /api/admin/tables/:tableId/counts`
- `POST /api/admin/tables/:tableId/qr/regenerate`
- `PATCH /api/admin/tables/:tableId/qr/enable`
- `PATCH /api/admin/tables/:tableId/qr/disable`
