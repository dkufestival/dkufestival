# REST API

이 문서는 현재 `backend/src` 구현 기준

## 핵심 데이터 개념

| 개념 | 설명 |
| --- | --- |
| `Table` | 축제 현장의 물리 테이블. 테이블 번호, QR 토큰, QR 활성 상태를 가진다. |
| `TableSession` | 특정 물리 테이블을 현재 사용하는 팀 단위 세션. 인원, 시작/만료/종료 시간, 상태를 가진다. |
| `Participant` | 같은 `TableSession`에 접속한 개별 휴대폰 사용자. 각자 닉네임과 JWT를 가진다. |
| `tableId` | 물리 테이블의 ID. |
| `tableSessionId` / `sessionId` | 현재 사용 팀인 `TableSession`의 ID. JWT에서는 `sessionId` 이름을 쓴다. |
| `participantId` | 개별 휴대폰 참가자인 `Participant`의 ID. |
| `clientId` | 프론트가 휴대폰/브라우저별로 유지해야 하는 재입장 식별자. 같은 `clientId`가 같은 세션에 다시 들어오면 기존 참가자를 복구한다. |

한 테이블 QR에는 여러 휴대폰이 접속할 수 있다. 첫 접속자는 `TableSession`을 만들고 `isHost=true`인 대표 참가자가 된다. 이후 접속자는 같은 활성 세션에 `Participant`로 추가된다.

## QR 명세

QR URL 형식:

```text
<FRONTEND_URL>/index.html?qr=<qrToken>
```

- QR은 물리 테이블별 `Table.qrToken`으로 발급된다.
- QR 이미지는 `npm run seed` 실행 시 `QR_OUTPUT_DIR`에 `table-<tableNumber>.png`로 생성된다.
- 첫 QR 입장은 활성 세션이 없을 때 새 `TableSession`을 만든다.
- 추가 QR 입장은 기존 활성 세션에 `Participant`를 추가한다.
- 같은 휴대폰은 `clientId`로 기존 참가자를 복구한다.
- 일반 테이블 API는 `qrToken`을 노출하지 않는다.
- 관리자는 QR 재발급, 활성화, 비활성화를 할 수 있다.
- QR이 비활성화되면 `/api/entry/context`, `/api/entry`는 `INVALID_QR` 오류를 반환한다.

## TableSession 필드

| 필드 | 설명 |
| --- | --- |
| `maleCount` | 세션의 남성 인원 수. |
| `femaleCount` | 세션의 여성 인원 수. |
| `startedAt` | 세션 시작 시각. |
| `expiresAt` | 서버가 관리하는 이용 만료 시각. 기본은 시작 시각부터 2시간이다. |
| `endedAt` | 퇴실 처리 시각. 활성 세션에서는 `null`. |
| `status` | `ACTIVE` 또는 `CLOSED`. |
| `participants` | 같은 세션에 입장한 `Participant` 목록. |

활동 가능 여부는 JWT 만료만이 아니라 `TableSession.status === "ACTIVE"`이고 `expiresAt`이 지나지 않았는지를 함께 검증한다.

## 인증

REST 인증은 Bearer 토큰을 사용한다.

```http
Authorization: Bearer <token>
```

참가자 JWT payload:

```json
{
  "role": "PARTICIPANT",
  "tableId": 3,
  "sessionId": 15,
  "participantId": 101
}
```

관리자 JWT payload는 현재 `{ "role": "ADMIN" }` 형태다. 참가자 JWT는 REST/Socket 인증 시 참가자 존재 여부, 세션 활성 상태, `expiresAt` 미만 여부를 검증한다. 종료되거나 만료된 세션의 참가자 토큰은 활동에 사용할 수 없다.

Socket.IO 인증:

```js
io(SERVER_URL, { auth: { token } });
```

## 공통 응답

성공 응답은 대부분 다음 형태다.

```json
{
  "data": {}
}
```

오류 응답:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "설명",
    "details": {}
  }
}
```

`details`는 검증 오류 등 일부 오류에서만 포함된다.

## API 목록

### QR context 조회

| 항목 | 내용 |
| --- | --- |
| Method | `GET` |
| URL | `/api/entry/context?qr=<qrToken>` |
| 인증 | 없음 |
| Query | `qr` required |
| Body | 없음 |
| 성공 | `200` |
| 주요 오류 | `QR_REQUIRED`, `INVALID_QR` |

응답:

```json
{
  "data": {
    "tableId": 3,
    "tableNumber": 3,
    "hasActiveSession": true,
    "requiresTeamSetup": false,
    "session": {
      "id": 15,
      "maleCount": 2,
      "femaleCount": 2,
      "startedAt": "2026-08-18T12:00:00.000Z",
      "expiresAt": "2026-08-18T14:00:00.000Z",
      "participants": []
    }
  }
}
```

### QR 입장

| 항목 | 내용 |
| --- | --- |
| Method | `POST` |
| URL | `/api/entry` |
| 인증 | 없음 |
| Body | `qrToken`, `clientId`, `nickname`, 첫 입장 시 `maleCount`, `femaleCount` |
| 성공 | `201` 신규 참가자, `200` 기존 참가자 복구 |
| 주요 오류 | `INVALID_ENTRY`, `INVALID_QR`, `INVALID_COUNTS`, `VALIDATION_ERROR` |

첫 입장 요청:

```json
{
  "qrToken": "token",
  "clientId": "device-1",
  "nickname": "재노",
  "maleCount": 2,
  "femaleCount": 2
}
```

추가 입장 요청:

```json
{
  "qrToken": "token",
  "clientId": "device-2",
  "nickname": "민수"
}
```

응답:

```json
{
  "data": {
    "table": { "id": 3, "tableNumber": 3 },
    "session": {},
    "participant": {},
    "token": "jwt",
    "restored": false
  }
}
```

입장 성공 시 `participant:joined`, `table:updated` Socket 이벤트가 전송된다.

### 참가자 API

| Method | URL | 인증 | Body | 성공 | 설명 | 주요 오류 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET` | `/api/participants/me` | 참가자 | 없음 | `200` | 내 참가자 조회 | `AUTH_REQUIRED`, `INVALID_PARTICIPANT_SESSION` |
| `PATCH` | `/api/participants/me` | 참가자 | `{ "nickname": "새닉네임" }` | `200` | 닉네임 변경 | `INVALID_NICKNAME`, `VALIDATION_ERROR` |
| `GET` | `/api/participants` | 참가자 | 없음 | `200` | 같은 세션 참가자 목록 | `INVALID_PARTICIPANT_SESSION` |

닉네임 변경 응답:

```json
{
  "data": {
    "id": 101,
    "tableSessionId": 15,
    "clientId": "device-1",
    "nickname": "새닉네임",
    "isHost": true
  }
}
```

닉네임 변경 시 같은 `session:<sessionId>` 방에 `participant:updated`가 전송된다.

### 테이블 API

| Method | URL | 인증 | Body | 성공 | 설명 | 주요 오류 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET` | `/api/tables` | 없음 | 없음 | `200` | 물리 테이블 목록과 활성 세션 요약 | - |
| `GET` | `/api/tables/:tableId` | 없음 | 없음 | `200` | 특정 테이블 상세. 현재 구현은 `sessions` 배열을 반환한다. | - |
| `PATCH` | `/api/tables/me` | 참가자 대표자 | `{ "maleCount": 2, "femaleCount": 2 }` | `200` | 내 세션의 남녀 인원 변경 | `HOST_REQUIRED`, `INVALID_COUNTS` |

`GET /api/tables` 응답 예:

```json
{
  "data": [
    {
      "id": 3,
      "tableNumber": 3,
      "qrEnabled": true,
      "qrVersion": 1,
      "activeSession": {
        "id": 15,
        "maleCount": 2,
        "femaleCount": 2,
        "startedAt": "2026-08-18T12:00:00.000Z",
        "expiresAt": "2026-08-18T14:00:00.000Z",
        "participants": []
      }
    }
  ]
}
```

주의: 기존 `POST /api/tables/:tableId/enter` 라우트는 남아 있지만 신규 참가자 구조와 맞지 않는 legacy 경로다. 신규 프론트는 `/api/entry`를 사용해야 한다.

### 합석 요청 API

| Method | URL | 인증 | Body | 성공 | 설명 | 주요 오류 |
| --- | --- | --- | --- | --- | --- | --- |
| `POST` | `/api/join-requests` | 참가자 | `{ "targetSessionId": 20, "message": "안녕하세요" }` | `201` | 합석 요청과 채팅방 동시 생성 | `INVALID_JOIN_TARGET`, `TARGET_NOT_FOUND` |
| `GET` | `/api/join-requests` | 참가자 | 없음 | `200` | 내가 보낸/받은 요청 조회 | - |
| `PATCH` | `/api/join-requests/:requestId/accept` | 참가자 | 없음 | `200` | 받은 요청 수락 | `JOIN_REQUEST_FORBIDDEN`, `JOIN_REQUEST_CLOSED` |
| `PATCH` | `/api/join-requests/:requestId/reject` | 참가자 | 없음 | `200` | 받은 요청 거절 | 동일 |
| `DELETE` | `/api/join-requests/:requestId` | 참가자 | 없음 | `200` | 내가 보낸 요청 취소. 현재 구현은 상태를 `CANCELLED`로 바꾼다. | 동일 |

생성 응답:

```json
{
  "data": {
    "joinRequest": {},
    "chatRoom": {}
  }
}
```

합석 요청 생성과 동시에 채팅방이 생성되므로 수락 전에도 양쪽 세션은 해당 채팅방에서 채팅할 수 있다.

### 채팅 API

| Method | URL | 인증 | Body | 성공 | 설명 | 주요 오류 |
| --- | --- | --- | --- | --- | --- | --- |
| `POST` | `/api/chat/rooms` | 참가자 | `{ "targetSessionId": 20 }` | `201` | 두 활성 세션 사이 채팅방 생성 또는 기존 방 반환 | `INVALID_CHAT_TARGET`, `SESSION_NOT_FOUND` |
| `GET` | `/api/chat/rooms` | 참가자 | 없음 | `200` | 내 세션이 참여한 채팅방 목록 | - |
| `GET` | `/api/chat/rooms/:roomId/messages` | 참가자 | 없음 | `200` | 메시지 조회. 발신 참가자 닉네임 포함 | `CHAT_FORBIDDEN` |

메시지 작성은 REST가 아니라 Socket `chat:send`로 한다.

### 관리자 API

| Method | URL | 인증 | Body | 성공 | 설명 | 주요 오류 |
| --- | --- | --- | --- | --- | --- | --- |
| `POST` | `/api/admin/login` | 없음 | `{ "id": "admin", "password": "..." }` | `200` | 관리자 JWT 발급 | `ADMIN_NOT_CONFIGURED`, `INVALID_ADMIN_CREDENTIALS` |
| `GET` | `/api/admin/tables` | 관리자 | 없음 | `200` | QR 토큰을 포함한 관리자 테이블 조회 | `FORBIDDEN` |
| `POST` | `/api/admin/tables/:tableId/checkin` | 관리자 | `{ "maleCount": 2, "femaleCount": 2 }` | `201` | 수동 입실. 현재 구현은 세션만 생성하고 참가자는 만들지 않는다. | `TABLE_NOT_FOUND`, `TABLE_ALREADY_ACTIVE` |
| `POST` | `/api/admin/tables/:tableId/extend` | 관리자 | `{ "minutes": 30, "paymentReference": "optional" }` | `200` | 만료 시간 연장 | `ACTIVE_SESSION_NOT_FOUND` |
| `POST` | `/api/admin/tables/:tableId/reset-time` | 관리자 | 없음 | `200` | 현재 시각부터 기본 이용 시간으로 재설정 | `ACTIVE_SESSION_NOT_FOUND` |
| `POST` | `/api/admin/tables/:tableId/checkout` | 관리자 | 없음 | `200` | 활성 세션을 `CLOSED`로 변경 | - |
| `PATCH` | `/api/admin/tables/:tableId/counts` | 관리자 | `{ "maleCount": 2, "femaleCount": 2 }` | `200` | 남녀 인원 변경 | `ACTIVE_SESSION_NOT_FOUND` |
| `POST` | `/api/admin/tables/:tableId/qr/regenerate` | 관리자 | 없음 | `200` | QR 토큰 재발급, `qrVersion` 증가 | `TABLE_NOT_FOUND` |
| `PATCH` | `/api/admin/tables/:tableId/qr/enable` | 관리자 | 없음 | `200` | QR 활성화 | `TABLE_NOT_FOUND` |
| `PATCH` | `/api/admin/tables/:tableId/qr/disable` | 관리자 | 없음 | `200` | QR 비활성화 | `TABLE_NOT_FOUND` |

관리자 로그인 응답:

```json
{
  "data": {
    "token": "jwt"
  }
}
```

### 공지 API

| Method | URL | 인증 | Body | 성공 | 설명 | 주요 오류 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET` | `/api/notices` | 로그인 필요 | 없음 | `200` | 최근 공지 100개 조회 | `AUTH_REQUIRED` |
| `POST` | `/api/notices` | 관리자 | `{ "title": "...", "content": "...", "category": "GENERAL" }` | `201` | 공지 생성 | `FORBIDDEN`, `VALIDATION_ERROR` |

`category` 허용값은 `GENERAL`, `GAME`, `EVENT`, `OPERATION`이다.

### 신청곡 API

| Method | URL | 인증 | Body | 성공 | 설명 | 주요 오류 |
| --- | --- | --- | --- | --- | --- | --- |
| `POST` | `/api/song-requests` | 참가자 | `{ "songTitle": "노래", "artist": "가수" }` | `201` | 신청곡 생성 | `INVALID_SONG_TITLE` |
| `GET` | `/api/song-requests/me` | 참가자 | 없음 | `200` | 내 신청곡 조회 | - |
| `DELETE` | `/api/song-requests/:requestId` | 참가자 | 없음 | `200` | 내 신청곡 취소. 현재 구현은 상태를 `CANCELLED`로 변경한다. | `SONG_REQUEST_NOT_FOUND` |
| `GET` | `/api/admin/song-requests` | 관리자 | 없음 | `200` | 전체 신청곡 조회 | `FORBIDDEN` |
| `PATCH` | `/api/admin/song-requests/:requestId/complete` | 관리자 | 없음 | `200` | 신청곡 완료 처리 | `SONG_REQUEST_NOT_FOUND` |

## 주요 오류 코드

| 코드 | 발생 조건 |
| --- | --- |
| `AUTH_REQUIRED` | Bearer 토큰이 없거나 Socket token이 없음 |
| `INVALID_TOKEN` | JWT 검증 실패 |
| `INVALID_PARTICIPANT_SESSION` | 참가자 없음, 세션 종료, 세션 만료 |
| `FORBIDDEN` | 역할 권한 없음 |
| `VALIDATION_ERROR` | request body 검증 실패 |
| `ROUTE_NOT_FOUND` | 존재하지 않는 REST 경로 |
| `INVALID_QR` | QR 토큰이 없거나 비활성화됨 |
| `QR_REQUIRED` | QR context 조회에 `qr` query가 없음 |
| `INVALID_COUNTS` | 남녀 인원 수가 음수이거나 합계가 0 |
| `HOST_REQUIRED` | 대표자가 아닌 참가자가 인원 변경 시도 |
| `INVALID_JOIN_TARGET` | 자기 세션에 합석 요청 |
| `TARGET_NOT_FOUND` | 대상 세션이 활성 상태가 아님 |
| `JOIN_REQUEST_NOT_FOUND` | 합석 요청 없음 |
| `JOIN_REQUEST_FORBIDDEN` | 합석 요청 소유자가 아님 |
| `JOIN_REQUEST_CLOSED` | 이미 처리된 합석 요청 |
| `CHAT_FORBIDDEN` | 채팅방 소속 세션이 아님 |
| `PARTICIPANT_FORBIDDEN` | 메시지 발신 참가자가 해당 세션 소속이 아님 |
| `ADMIN_NOT_CONFIGURED` | `ADMIN_PASSWORD` 미설정 |
| `INVALID_ADMIN_CREDENTIALS` | 관리자 로그인 실패 |
| `TABLE_NOT_FOUND` | 테이블 없음 |
| `TABLE_ALREADY_ACTIVE` | 이미 활성 세션이 있음 |
| `ACTIVE_SESSION_NOT_FOUND` | 관리자 작업 대상 활성 세션 없음 |
| `SONG_REQUEST_NOT_FOUND` | 신청곡 없음 |
| `INTERNAL_SERVER_ERROR` | 처리되지 않은 서버 오류 |
