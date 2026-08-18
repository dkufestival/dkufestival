# Festival Backend

Node.js, Express, Socket.IO, Sequelize, MySQL 기반의 축제 테이블 운영 백엔드다.

## 현재 데이터 구조

- `Table`: 현장의 물리 테이블이다. `tableNumber`, `qrToken`, `qrEnabled`, `qrVersion`을 가진다.
- `TableSession`: 물리 테이블을 현재 사용하는 팀 세션이다. `maleCount`, `femaleCount`, `startedAt`, `expiresAt`, `endedAt`, `status`를 가진다.
- `Participant`: 같은 테이블 세션에 QR로 접속한 개별 휴대폰 사용자다. `clientId`, `nickname`, `isHost`를 가진다.
- `tableId`: 물리 테이블 ID다.
- `tableSessionId` / `sessionId`: 현재 사용 팀 세션 ID다. JWT payload에서는 `sessionId`로 들어간다.
- `participantId`: 개별 참가자 ID다.
- `clientId`: 프론트가 휴대폰별로 저장해야 하는 재입장 식별자다.

한 테이블 QR에는 여러 휴대폰이 접속할 수 있다. 첫 입장자는 새 `TableSession`을 만들고 대표자(`isHost=true`)가 된다. 이후 입장자는 기존 활성 세션에 `Participant`로 추가된다. 같은 휴대폰이 다시 들어오면 `clientId`로 기존 참가자를 복구한다.

## 프로젝트 구조

```text
backend/
  src/
    server.js
    app.js
    config/
    routes/
    controllers/
    services/
    models/
    middleware/
    socket/
  scripts/
    seed-tables.js
    check-js.js
  docs/
    REST_API.md
    SOCKET_API.md
```

## 설치

```bash
cd backend
npm ci
```

Node.js 20 이상과 MySQL이 필요하다.

## 환경변수

`.env.example`을 복사해서 `.env`를 만든다.

```bash
cp .env.example .env
```

예시:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=festival_user
DB_PASSWORD=change_this_password
DB_NAME=festival
DB_SYNC=true
DB_ALTER=true
DB_LOGGING=false

CORS_ORIGIN=*
FRONTEND_URL=http://localhost:5500
SESSION_DURATION_MINUTES=120
QR_OUTPUT_DIR=./qr-codes

JWT_SECRET=replace_with_a_long_random_value
ADMIN_ID=admin
ADMIN_PASSWORD=replace_with_a_strong_password

TABLE_COUNT=20
```

| 변수 | 설명 | 기본값 |
| --- | --- | --- |
| `PORT` | HTTP 및 Socket.IO 포트 | `3000` |
| `DB_HOST` | MySQL 호스트 | `localhost` |
| `DB_PORT` | MySQL 포트 | `3306` |
| `DB_USER` | MySQL 사용자 | `root` |
| `DB_PASSWORD` | MySQL 비밀번호 | empty |
| `DB_NAME` | MySQL 데이터베이스 | `festival` |
| `DB_SYNC` | 서버 시작 시 Sequelize sync 실행 여부 | `true` |
| `DB_ALTER` | 기존 테이블을 모델에 맞춰 alter 시도 | `false` |
| `DB_LOGGING` | Sequelize SQL 로그 출력 | `false` |
| `CORS_ORIGIN` | CORS 허용 origin | `*` |
| `FRONTEND_URL` | QR URL 생성에 사용할 프론트 주소 | `http://localhost:3000` |
| `SESSION_DURATION_MINUTES` | 기본 테이블 이용 시간 | `120` |
| `QR_OUTPUT_DIR` | seed 실행 시 QR PNG 출력 위치 | `backend/qr-codes` |
| `JWT_SECRET` | JWT 서명 비밀키 | `dev-secret` |
| `ADMIN_ID` | 관리자 로그인 ID | `admin` |
| `ADMIN_PASSWORD` | 관리자 로그인 비밀번호 | 없음 |
| `TABLE_COUNT` | seed로 생성할 물리 테이블 수 | `20` |

서버 시작 시 `DB_SYNC=true`이면 `sequelize.sync()`가 실행된다. `DB_ALTER=true`이면 모델 기준으로 기존 테이블 변경을 시도한다. 실데이터 DB에서는 실행 전 백업이 필요하다.

## 데이터베이스 준비

```sql
CREATE DATABASE IF NOT EXISTS festival
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'festival_user'@'localhost'
  IDENTIFIED BY 'change_this_password';

GRANT ALL PRIVILEGES ON festival.* TO 'festival_user'@'localhost';
FLUSH PRIVILEGES;
```

## 테이블 seed 및 QR 이미지 생성

```bash
npm run seed
```

seed 동작:

- `TABLE_COUNT`만큼 물리 테이블을 생성한다.
- 새 테이블에는 안전한 랜덤 `qrToken`을 만든다.
- 이미 존재하는 테이블의 `qrToken`은 seed만으로 변경하지 않는다.
- 각 테이블의 QR 주소는 `<FRONTEND_URL>/index.html?qr=<qrToken>`이다.
- 각 테이블 QR PNG를 `QR_OUTPUT_DIR`에 `table-<tableNumber>.png`로 생성한다.
- 실행 결과에 `tableId`, `tableNumber`, `qrToken`, `qrPng`가 표로 출력된다.

일반 테이블 API는 `qrToken`을 노출하지 않는다. 관리자 조회와 seed 출력에서만 확인할 수 있다.

## 실행

개발:

```bash
npm run dev
```

일반 실행:

```bash
npm start
```

헬스 체크:

```bash
curl http://localhost:3000/health
```

응답:

```json
{ "status": "ok" }
```

## 인증

참가자 토큰은 `/api/entry` 성공 응답으로 받는다.

```json
{
  "role": "PARTICIPANT",
  "tableId": 3,
  "sessionId": 15,
  "participantId": 101
}
```

관리자 토큰은 `/api/admin/login`에서 받으며 payload는 `{ "role": "ADMIN" }`이다.

REST 요청:

```http
Authorization: Bearer <token>
```

Socket.IO 연결:

```js
io(SERVER_URL, { auth: { token } });
```

참가자 토큰은 참가자 존재 여부, `TableSession.status === "ACTIVE"`, `expiresAt` 미만 여부를 검증한다. 종료되거나 만료된 세션의 토큰은 사용할 수 없다.

## 대표 시나리오

### 첫 번째 사용자의 QR 입장

1. 프론트가 QR URL의 `qr` 값을 읽는다.
2. `GET /api/entry/context?qr=<qrToken>`으로 테이블 상태를 확인한다.
3. 활성 세션이 없으면 `requiresTeamSetup=true`다.
4. 사용자가 닉네임, 남녀 인원을 입력한다.
5. `POST /api/entry`로 `qrToken`, `clientId`, `nickname`, `maleCount`, `femaleCount`를 보낸다.
6. 서버가 `TableSession`과 대표 `Participant`를 만들고 참가자 JWT를 반환한다.

### 같은 테이블의 두 번째 사용자 입장

1. 같은 QR을 스캔한다.
2. `GET /api/entry/context`에서 `hasActiveSession=true`를 받는다.
3. `POST /api/entry`로 `qrToken`, 새 `clientId`, `nickname`만 보낸다.
4. 서버가 기존 활성 세션에 새 `Participant`를 추가한다.

### 새로고침 및 재입장

1. 프론트는 같은 휴대폰에 저장한 `clientId`를 다시 사용한다.
2. `POST /api/entry`에 같은 `clientId`를 보내면 서버가 기존 참가자를 복구한다.
3. 응답의 `restored=true` 여부로 복구 여부를 확인할 수 있다.

### 사용 중 테이블에 합석 요청

1. `GET /api/tables`로 `activeSession`이 있는 대상 테이블을 찾는다.
2. `POST /api/join-requests`에 `targetSessionId`를 보낸다.
3. 응답은 `{ joinRequest, chatRoom }`이다.
4. 양쪽 세션에 `join:created`, `chat:room-created` 이벤트가 전송된다.

### 요청 수락 전 채팅

1. 합석 요청 생성 응답의 `chatRoom.id`를 사용한다.
2. Socket `chat:join`으로 `chat:<roomId>`에 입장한다.
3. Socket `chat:send`로 메시지를 보낸다.
4. 수락 전에도 채팅 가능하다.

### 관리자 시간 연장

1. 관리자가 `/api/admin/login`으로 토큰을 받는다.
2. `POST /api/admin/tables/:tableId/extend`에 `minutes`와 선택적 `paymentReference`를 보낸다.
3. 서버가 `expiresAt`을 연장하고 `table:extended` 이벤트를 전송한다.

### 관리자 퇴실

1. `POST /api/admin/tables/:tableId/checkout`을 호출한다.
2. 서버가 활성 세션을 `CLOSED`로 바꾸고 `endedAt`을 기록한다.
3. 해당 세션 참가자에게 `table:checked-out` 이벤트를 보낸다.
4. 이후 기존 참가자 JWT는 REST/Socket 활동에 사용할 수 없다.

### 신청곡

1. 참가자가 `POST /api/song-requests`로 `songTitle`, `artist`를 보낸다.
2. 관리자와 같은 세션에 `song:requested` 이벤트가 전송된다.
3. 참가자는 `GET /api/song-requests/me`로 내 신청곡을 조회한다.
4. 관리자는 `GET /api/admin/song-requests`로 전체 신청곡을 본다.
5. 관리자는 `PATCH /api/admin/song-requests/:requestId/complete`로 완료 처리한다.

### 관리자 전체 게임

1. 관리자가 Socket으로 연결한다.
2. `game:global:start`에 `{ type, state }`를 보낸다.
3. 참가자들은 `game:global:started`를 받는다.
4. 참가자는 `game:action`으로 응답한다.
5. 서버는 관리자에게 `game:global:state`를 보낸다.
6. 관리자는 `game:global:end`로 종료한다.

## 문서

- REST 상세 명세: `docs/REST_API.md`
- Socket.IO 상세 명세: `docs/SOCKET_API.md`

## 검증

```bash
npm test
npm run check
```

현재 `npm run check`는 `scripts/check-js.js`를 사용해 `src`, `scripts`, `test` 아래 JS 파일을 `node --check`로 검사한다.

## 현재 구현상 주의점

- `POST /api/tables/:tableId/enter` legacy 라우트가 남아 있지만 신규 참가자 JWT 구조와 맞지 않는다. 신규 프론트는 `/api/entry`를 사용해야 한다.
- 관리자 수동 입실은 현재 `TableSession`만 생성하고 `Participant`는 생성하지 않는다.
- `GET /api/notices`는 현재 인증이 필요하다.
- Socket callback은 문서상 표준 형식을 권장하지만, 현재 `chat:join` 성공은 `{ ok: true }`만 반환하고 일부 실패 응답은 `message`가 없을 수 있다.
