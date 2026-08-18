# piu:m Frontend

이 문서는 현재 `frontend/` 구현과 `backend/docs/REST_API.md`, `backend/docs/SOCKET_API.md`, 실제 backend routes/controllers 기준으로 작성했다. 구현되지 않은 기능은 구현된 것처럼 적지 않는다.

## 프로젝트 구조

프론트는 정적 HTML/CSS/JavaScript로 구성된다. 빌드 과정 없이 정적 서버에서 실행하며, 실제 로직은 ES Module로 분리되어 있다.

```text
frontend/
  index.html          사용자 화면
  admin.html          관리자 화면
  style.css           사용자 화면 스타일
  admin.css           관리자 화면 스타일
  script.js           사용자 화면 호환 엔트리
  admin.js            관리자 화면 호환 엔트리
  js/
    config.js         API/Socket 서버 주소와 localStorage key
    api.js            fetch 공통 래퍼, Bearer 토큰, 오류 처리
    auth.js           clientId, 참가자 JWT, 관리자 JWT 저장/삭제
    socket.js         Socket.IO 연결/해제
    dom.js            DOM helper, 시간 포맷
    entry.js          QR context/입장 API
    tables.js         테이블 목록, 내 테이블 인원 변경 API
    participants.js   참가자 조회/닉네임 변경 API
    join.js           합석 요청 API
    chat.js           채팅방/메시지 조회 API
    songs.js          사용자/관리자 신청곡 API
    notices.js        공지 조회/작성 API
    games.js          게임 타입 상수
    app.js            사용자 화면 상태와 렌더링
    admin-api.js      관리자 REST API wrapper
    admin-app.js      관리자 화면 상태와 렌더링
```

`script.js`와 `admin.js`는 기존 파일명을 유지하기 위한 얇은 엔트리이며, 실제 HTML은 현재 `js/app.js`, `js/admin-app.js`를 직접 module script로 불러온다.

## 실행 방법

### 백엔드 서버

```bash
cd backend
npm install
npm run seed
npm run dev
```

기본 백엔드 주소는 `http://localhost:3000`이다. QR seed를 실행하면 `<FRONTEND_URL>/index.html?qr=<qrToken>` 형식의 QR PNG가 `QR_OUTPUT_DIR`에 생성된다.

### 정적 프론트 서버

ES Module을 사용하므로 `file://`로 열지 말고 HTTP 정적 서버로 실행한다.

```bash
cd frontend
python -m http.server 5174
```

사용자 화면:

```text
http://localhost:5174/index.html?qr=<qrToken>
```

관리자 화면:

```text
http://localhost:5174/admin.html
```

### API 서버 주소 설정

기본값은 `frontend/js/config.js`의 `http://localhost:3000`이다.

개발 중 다른 서버를 쓰려면 브라우저 콘솔에서 설정할 수 있다.

```js
localStorage.setItem('piumApiBaseUrl', 'http://localhost:3001');
localStorage.setItem('piumSocketUrl', 'http://localhost:3001');
```

또는 페이지 로드 전에 전역 설정을 둘 수 있다.

```js
window.PIUM_CONFIG = {
  API_BASE_URL: 'https://api.example.com',
  SOCKET_URL: 'https://api.example.com'
};
```

### Socket.IO 연결

`index.html`과 `admin.html`은 CDN으로 Socket.IO client를 불러온다.

```html
<script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
```

연결은 `frontend/js/socket.js`에서 수행한다.

```js
window.io(SOCKET_URL, {
  auth: { token },
  transports: ['websocket', 'polling']
});
```

### CORS 설정

프론트 정적 서버와 백엔드 서버 origin이 다르므로 backend `.env`의 `CORS_ORIGIN`이 프론트 주소를 허용해야 한다.

개발 예:

```env
CORS_ORIGIN=*
FRONTEND_URL=http://localhost:5174
```

운영에서는 `CORS_ORIGIN=*` 대신 실제 프론트 origin을 지정하는 것이 맞다.

## QR 입장 흐름

1. 사용자 페이지가 `location.search`에서 `qr` query 값을 읽는다.
2. `GET /api/entry/context?qr=<qrToken>`으로 QR 상태를 조회한다.
3. 응답의 `requiresTeamSetup`으로 첫 입장자와 추가 입장자를 구분한다.
4. 첫 입장자는 닉네임, 남자 수, 여자 수를 입력한다.
5. 추가 입장자는 닉네임만 입력한다.
6. `auth.js`가 최초 접속 시 `crypto.randomUUID()`로 `clientId`를 생성해 `localStorage`에 저장한다.
7. `POST /api/entry`를 호출한다.
8. 성공 응답의 참가자 JWT, `tableId`, `tableSessionId`, `participantId`, participant snapshot을 `localStorage`에 저장한다.
9. 저장된 참가자 토큰이 있으면 새로고침 시 `GET /api/participants/me`로 참가자 상태를 복구한다.
10. 복구 또는 입장 성공 후 Socket.IO에 참가자 JWT로 연결한다.
11. 연결 후 테이블, 참가자, 합석 요청, 채팅방, 신청곡, 공지 데이터를 조회한다.
12. 기존 채팅방이 있으면 Socket 재연결 시 `chat:join`으로 다시 입장한다.

## 프론트 상태와 ID 구분

| ID | 의미 | 사용 위치 |
| --- | --- | --- |
| `tableId` | 물리 테이블 ID | QR 입장 결과, 테이블 목록에서 내 테이블 판별, 관리자 테이블 API path |
| `tableSessionId` / `sessionId` | 현재 테이블을 사용하는 팀 세션 ID | 참가자 JWT, 합석 요청 대상, Socket `session:<sessionId>` |
| `participantId` | 같은 세션에 접속한 개별 휴대폰 사용자 ID | 참가자 JWT, 채팅 발신자 표시, 게임 응답 주체 |
| `clientId` | 브라우저/휴대폰별 재입장 식별자 | `POST /api/entry` body, localStorage |
| `roomId` | 채팅방 ID | 메시지 조회, `chat:join`, `chat:send`, `chat:<roomId>` |
| `gameId` | 게임 세션 ID | `game:accept`, `game:action`, 게임 상태 표시 |

사용자 화면의 주요 상태는 `frontend/js/app.js`의 `state`에 있다.

- `token`
- `table`
- `session`
- `participant`
- `participants`
- `tables`
- `joinRequests`
- `chatRooms`
- `messages`
- `notices`
- `songRequests`
- `activeRoomId`
- `activeGame`

관리자 화면의 주요 상태는 `frontend/js/admin-app.js`의 `state`에 있다.

- `tables`
- `songs`
- `selectedGame`
- `activeDetailTable`
- `detailCounts`

## 저장되는 인증/세션 정보

| localStorage key | 저장 내용 |
| --- | --- |
| `piumClientId` | `crypto.randomUUID()`로 만든 재입장 식별자 |
| `piumParticipantAuth` | 참가자 JWT, `tableId`, `tableNumber`, `tableSessionId`, `participantId`, participant snapshot |
| `piumAdminToken` | 관리자 JWT |
| `piumApiBaseUrl` | 선택적 API 서버 override |
| `piumSocketUrl` | 선택적 Socket 서버 override |

`api.js`는 REST 응답이 `401`이면 참가자 또는 관리자 토큰을 삭제한다.

## 화면별 기능

### 사용자 화면

| 기능 | 구현 상태 | 실제 연결 |
| --- | --- | --- |
| QR 입장 | 구현됨 | `/api/entry/context`, `/api/entry` |
| 테이블 목록 | 구현됨 | `/api/tables` |
| 같은 테이블 참가자 | 구현됨 | `/api/participants`, `participant:joined`, `participant:updated` |
| 남녀 인원 | 구현됨 | `TableSession.maleCount`, `femaleCount` |
| 남은 시간 | 구현됨 | 서버 `expiresAt` 기준으로 계산 |
| 대표자 인원 변경 | 구현됨 | `PATCH /api/tables/me`; `participant.isHost`일 때 버튼 표시 |
| 합석 요청 | 구현됨 | `POST /api/join-requests` |
| 수락 전 채팅 | 구현됨 | 합석 요청 응답의 `chatRoom`으로 즉시 `chat:join` |
| 채팅 내역 | 구현됨 | `GET /api/chat/rooms`, `GET /api/chat/rooms/:roomId/messages` |
| 신청곡 | 구현됨 | `/api/song-requests` |
| 공지 | 구현됨 | `GET /api/notices`, `notice:created` |
| 게임 | 일부 구현 | 전체 게임 수신/응답, 1:1 초대 수신/수락/응답 |

### 관리자 화면

| 기능 | 구현 상태 | 실제 연결 |
| --- | --- | --- |
| 로그인 | 구현됨 | `POST /api/admin/login` |
| 테이블 현황 | 구현됨 | `GET /api/admin/tables` |
| 수동 입실 | 구현됨 | `POST /api/admin/tables/:tableId/checkin` |
| 인원 변경 | 구현됨 | `PATCH /api/admin/tables/:tableId/counts` |
| 시간 연장 | 구현됨 | `POST /api/admin/tables/:tableId/extend` |
| 시간 초기화 | 구현됨 | `POST /api/admin/tables/:tableId/reset-time` |
| 퇴실 | 구현됨 | `POST /api/admin/tables/:tableId/checkout` |
| QR 관리 | 구현됨 | 재발급/활성화/비활성화 API |
| 신청곡 관리 | 구현됨 | 조회/완료 처리 |
| 공지 작성 | 구현됨 | `POST /api/notices` |
| 게임 방송 | 일부 구현 | 전체 게임 시작만 UI 연결됨. 전체 게임 종료 UI는 없음 |

## REST API 매핑

| 화면/행동 | 메서드 | API | 인증 | 프론트 모듈 |
| --- | --- | --- | --- | --- |
| QR 상태 확인 | `GET` | `/api/entry/context?qr=<qrToken>` | 없음 | `entry.js` |
| QR 입장/재입장 | `POST` | `/api/entry` | 없음 | `entry.js` |
| 저장 토큰으로 참가자 복구 | `GET` | `/api/participants/me` | 참가자 | `participants.js` |
| 닉네임 변경 | `PATCH` | `/api/participants/me` | 참가자 | `participants.js` |
| 같은 세션 참가자 조회 | `GET` | `/api/participants` | 참가자 | `participants.js` |
| 테이블 목록 조회 | `GET` | `/api/tables` | 없음 | `tables.js` |
| 대표자 남녀 인원 변경 | `PATCH` | `/api/tables/me` | 참가자 | `tables.js` |
| 합석 요청 생성 | `POST` | `/api/join-requests` | 참가자 | `join.js` |
| 합석 요청 조회 | `GET` | `/api/join-requests` | 참가자 | `join.js` |
| 합석 요청 수락 | `PATCH` | `/api/join-requests/:requestId/accept` | 참가자 | `join.js` |
| 합석 요청 거절 | `PATCH` | `/api/join-requests/:requestId/reject` | 참가자 | `join.js` |
| 합석 요청 취소 | `DELETE` | `/api/join-requests/:requestId` | 참가자 | `join.js` |
| 채팅방 직접 생성 | `POST` | `/api/chat/rooms` | 참가자 | `chat.js`; 현재 사용자 UI에서 직접 호출 경로는 없음 |
| 내 채팅방 조회 | `GET` | `/api/chat/rooms` | 참가자 | `chat.js` |
| 채팅 메시지 조회 | `GET` | `/api/chat/rooms/:roomId/messages` | 참가자 | `chat.js` |
| 내 신청곡 생성 | `POST` | `/api/song-requests` | 참가자 | `songs.js` |
| 내 신청곡 조회 | `GET` | `/api/song-requests/me` | 참가자 | `songs.js` |
| 내 신청곡 취소 | `DELETE` | `/api/song-requests/:requestId` | 참가자 | `songs.js` |
| 공지 조회 | `GET` | `/api/notices` | 참가자 또는 관리자 | `notices.js` |
| 관리자 로그인 | `POST` | `/api/admin/login` | 없음 | `admin-api.js` |
| 관리자 테이블 조회 | `GET` | `/api/admin/tables` | 관리자 | `admin-api.js` |
| 관리자 수동 입실 | `POST` | `/api/admin/tables/:tableId/checkin` | 관리자 | `admin-api.js` |
| 관리자 시간 연장 | `POST` | `/api/admin/tables/:tableId/extend` | 관리자 | `admin-api.js` |
| 관리자 시간 초기화 | `POST` | `/api/admin/tables/:tableId/reset-time` | 관리자 | `admin-api.js` |
| 관리자 퇴실 | `POST` | `/api/admin/tables/:tableId/checkout` | 관리자 | `admin-api.js` |
| 관리자 인원 변경 | `PATCH` | `/api/admin/tables/:tableId/counts` | 관리자 | `admin-api.js` |
| 관리자 QR 재발급 | `POST` | `/api/admin/tables/:tableId/qr/regenerate` | 관리자 | `admin-api.js` |
| 관리자 QR 활성화 | `PATCH` | `/api/admin/tables/:tableId/qr/enable` | 관리자 | `admin-api.js` |
| 관리자 QR 비활성화 | `PATCH` | `/api/admin/tables/:tableId/qr/disable` | 관리자 | `admin-api.js` |
| 관리자 신청곡 조회 | `GET` | `/api/admin/song-requests` | 관리자 | `songs.js` |
| 관리자 신청곡 완료 | `PATCH` | `/api/admin/song-requests/:requestId/complete` | 관리자 | `songs.js` |
| 관리자 공지 작성 | `POST` | `/api/notices` | 관리자 | `notices.js` |

## Socket.IO 매핑

### 프론트가 보내는 이벤트

| 이벤트 | 역할 | Payload | 사용 위치 | 설명 |
| --- | --- | --- | --- | --- |
| `chat:join` | 참가자 | `{ roomId }` | `app.js` | 채팅방 입장. 최초 방 생성 후와 Socket 재연결 후 다시 호출 |
| `chat:send` | 참가자 | `{ roomId, content }` | `app.js` | 메시지 전송. 발신자는 JWT의 `participantId` |
| `game:accept` | 참가자 | `{ gameId }` | `app.js` | 1:1 게임 초대 수락 |
| `game:action` | 참가자 | `{ gameId, action, state }` | `app.js` | 전체 게임 또는 1:1 게임 응답 |
| `game:global:start` | 관리자 | `{ type, state }` | `admin-app.js` | 전체 게임 시작 |

현재 프론트 UI에는 `game:invite`, `game:end`, `game:global:end`를 보내는 버튼이 없다.

### 프론트가 받는 이벤트

| 이벤트 | 역할 | 사용 위치 | 처리 |
| --- | --- | --- | --- |
| `participant:joined` | 참가자 | `app.js` | 참가자 목록 재조회 |
| `participant:updated` | 참가자 | `app.js` | 참가자 목록 재조회 |
| `participant:left` | 참가자 | `app.js` | 참가자 목록 재조회. 현재 백엔드는 이 이벤트를 emit하지 않음 |
| `table:updated` | 참가자/관리자 | `app.js`, `admin-app.js` | 테이블 목록 재조회 또는 화면 갱신 |
| `table:extended` | 참가자/관리자 | `app.js`, `admin-app.js` | 세션 만료 시각 갱신, 관리자 테이블 재조회 |
| `table:checked-out` | 참가자/관리자 | `app.js`, `admin-app.js` | 참가자 토큰 삭제 및 입장 화면 전환, 관리자 테이블 재조회 |
| `join:created` | 참가자 | `app.js` | 합석 요청 재조회 |
| `join:accepted` | 참가자 | `app.js` | 합석 요청 재조회 |
| `join:rejected` | 참가자 | `app.js` | 합석 요청 재조회 |
| `join:cancelled` | 참가자 | `app.js` | 합석 요청 재조회 |
| `chat:room-created` | 참가자 | `app.js` | 채팅방 저장, 메시지 조회, `chat:join`, 채팅 모달 열기 |
| `chat:message` | 참가자 | `app.js` | 메시지 목록에 중복 없이 추가 |
| `notice:created` | 참가자 | `app.js` | 공지 목록에 추가, 토스트 표시 |
| `song:requested` | 참가자/관리자 | `app.js`, `admin-app.js` | 신청곡 목록 갱신 |
| `song:cancelled` | 참가자/관리자 | `app.js`, `admin-app.js` | 신청곡 상태 갱신 |
| `song:completed` | 참가자/관리자 | `app.js`, `admin-app.js` | 신청곡 상태 갱신 |
| `game:global:started` | 참가자 | `app.js` | activeGame 설정, 게임 모달에 응답 버튼 표시 |
| `game:global:ended` | 참가자 | `app.js` | activeGame 갱신 |
| `game:global:state` | 관리자 | `admin-app.js` | 관리자 게임 로그 추가 |
| `game:invited` | 참가자 | `app.js` | activeGame 설정, 초대 수락 버튼 표시 |
| `game:started` | 참가자 | `app.js` | activeGame 갱신 |
| `game:state` | 참가자 | `app.js` | activeGame 갱신 |
| `game:ended` | 참가자 | `app.js` | activeGame 갱신 |

Socket 재연결 시 `connect` 이벤트에서 현재 `state.chatRooms`의 모든 채팅방에 대해 `chat:join`을 다시 호출한다.

## UI 상태 처리

| 상태 | 현재 처리 |
| --- | --- |
| QR 없음 | 입장 버튼 비활성화, QR을 스캔하라는 상태 메시지 표시 |
| 잘못된 QR | `/api/entry/context` 오류 메시지 표시, 입장 버튼 비활성화 |
| QR 비활성화 | 백엔드가 `INVALID_QR`을 반환하며 프론트는 잘못되었거나 비활성화된 QR 메시지 표시 |
| 첫 입장 | `requiresTeamSetup=true`; 닉네임, 남자 수, 여자 수 입력 표시 |
| 기존 테이블 추가 입장 | `hasActiveSession=true`; 닉네임만 입력하도록 인원 입력 영역 숨김 |
| 만료된 세션 | REST 인증에서 `401` 발생 시 토큰 삭제. 별도 만료 전용 화면은 없음 |
| 관리자 퇴실 | `table:checked-out` 수신 시 참가자 토큰 삭제, 입장 화면으로 전환 |
| 네트워크 오류 | `api.js`에서 fetch 실패가 그대로 throw된다. 호출부는 토스트로 `error.message` 표시 |
| JWT 만료/무효 | `401`이면 참가자 또는 관리자 토큰 삭제 |
| Socket 연결 끊김 | 별도 UI 메시지는 없음 |
| Socket 재연결 | `connect` 이벤트에서 기존 채팅방에 다시 `chat:join` |

## 데이터 보안

- JWT는 현재 `localStorage`에 저장한다. 구현은 단순하지만 XSS가 발생하면 토큰이 탈취될 수 있으므로 사용자 문자열 렌더링을 엄격히 제한해야 한다.
- `clientId`, `tableId`, `tableSessionId`, `participantId`, `roomId`, `gameId`는 클라이언트가 보낼 수 있는 값이므로 서버가 항상 권한을 검증해야 한다.
- QR 토큰은 URL query에 포함되므로 화면 공유, 로그, 브라우저 히스토리 노출에 주의해야 한다.
- 일반 테이블 API는 QR 토큰을 노출하지 않는다. 관리자 API와 seed 출력은 운영 권한자만 접근해야 한다.
- 사용자 닉네임, 채팅 메시지, 신청곡, 공지는 `innerHTML`에 직접 넣지 말고 `textContent` 또는 DOM API로 렌더링해야 한다.
- 현재 신규 JS 모듈은 대부분 `dom.text()`와 DOM API를 사용한다. 단, 기존 CSS/HTML 자체의 정적 마크업은 신뢰된 코드로 취급한다.

## mock 제거 현황

| 기존 mock | 대체 방식 | 상태 |
| --- | --- | --- |
| `occupiedTables` | `GET /api/tables` | 제거됨 |
| 랜덤 좌석 상태 | 서버의 `activeSession` 기준 테이블 렌더링 | 제거됨 |
| 랜덤 남은 시간 | 서버 `expiresAt` 기준 계산 | 제거됨 |
| 가짜 채팅 응답 | Socket `chat:send`, `chat:message` | 제거됨 |
| 1.8초 뒤 가짜 합석 요청 | `POST /api/join-requests`, Socket 합석 이벤트 | 제거됨 |
| 신청곡 `localStorage` | `/api/song-requests`, `/api/admin/song-requests` | 제거됨 |
| 관리자 하드코딩 로그인 | `POST /api/admin/login` | 제거됨 |
| 관리자 mock 테이블 | `GET /api/admin/tables` | 제거됨 |
| 가짜 게임 방송 로그 | `game:global:start`, `game:global:state` | 부분 대체. 시작은 실제 Socket, 종료 UI는 없음 |

현재 의도적으로 남긴 mock 데이터는 없다. 다만 게임 화면은 최소 응답 UI만 있으며 실제 게임별 상세 문제/미션 UI는 아직 없다.

## 테스트 시나리오

테스트 전 준비:

1. 백엔드 `.env`에서 `FRONTEND_URL=http://localhost:5174`, `CORS_ORIGIN=*` 또는 `http://localhost:5174` 설정
2. `cd backend && npm run seed && npm run dev`
3. seed 출력에서 서로 다른 두 테이블의 `qrToken` 확인
4. `cd frontend && python -m http.server 5174`

### 동일 테이블 다중 참가자

1. 브라우저 A에서 `http://localhost:5174/index.html?qr=<table1Qr>` 접속
2. 닉네임과 남녀 인원을 입력해 첫 입장
3. 시크릿 창 B에서 같은 URL 접속
4. 닉네임만 입력해 추가 입장
5. 두 화면 모두 참가자 칩이 갱신되는지 확인

### 서로 다른 테이블 입장

1. 브라우저 A는 table1 QR로 입장
2. 브라우저 B는 table2 QR로 입장
3. 각 화면의 테이블 목록에서 상대 테이블이 사용 중으로 보이는지 확인

### 합석 요청

1. A 화면에서 사용 중인 B 테이블의 `말 걸기` 클릭
2. 메시지를 입력하고 요청 전송
3. B 화면에서 합석 요청 모달이 표시되는지 확인

### 수락 전 채팅

1. 합석 요청 직후 A 화면에서 채팅방이 열리는지 확인
2. B 화면에서도 `chat:room-created` 후 채팅방에 들어갈 수 있는지 확인
3. 수락/거절 전 메시지가 전송되는지 확인

### 실시간 메시지

1. A가 메시지를 보냄
2. B가 같은 채팅방에서 `chat:message`를 받는지 확인
3. B가 답장하고 A에 표시되는지 확인

### 닉네임 변경

1. 사용자 화면에서 내 참가자 칩 클릭
2. 닉네임 변경
3. 같은 테이블 다른 브라우저에서 참가자 칩이 갱신되는지 확인

### 신청곡

1. 사용자 화면 신청곡 모달에서 `곡명 - 가수` 입력
2. 관리자 신청곡 탭에서 새 신청곡 수신 확인
3. 관리자가 완료 처리
4. 사용자 화면에서 신청곡 상태가 갱신되는지 확인

### 관리자 시간 연장

1. 관리자 로그인
2. 테이블 카드 클릭
3. `+10분 연장`
4. 사용자 화면 남은 시간이 늘어나는지 확인

### 관리자 퇴실

1. 관리자 상세 패널에서 퇴실 처리
2. 사용자 화면이 입장 화면으로 돌아가고 기존 토큰이 삭제되는지 확인

### Socket 재연결

1. 채팅방이 있는 상태에서 브라우저 네트워크를 잠시 끊거나 백엔드를 재시작
2. Socket 재연결 후 기존 채팅방에 `chat:join`이 다시 호출되는지 확인
3. 새 메시지를 보내고 수신되는지 확인

## 알려진 제한 사항

- `frontend/js/app.js`, `frontend/js/admin-app.js`의 일부 화면 문구가 인코딩 문제로 깨져 있다. 기능 연결 문서와 별개로 UI 문자열 정리가 필요하다.
- 사용자 화면에는 1:1 게임 초대를 직접 보내는 UI가 없다. `game:invited` 수신, `game:accept`, `game:action`만 처리한다.
- 관리자 화면에는 전체 게임 시작 UI만 있고 `game:global:end`를 보내는 종료 버튼은 없다.
- 사용자 화면의 게임 UI는 게임 타입별 상세 입력 폼이 아니라 단일 응답 버튼이다.
- Socket 연결 끊김 상태를 사용자에게 표시하는 별도 배너가 없다.
- 만료된 세션은 REST 401 처리로 토큰을 삭제하지만, 만료 전용 안내 화면은 없다.
- 관리자 수동 입실은 백엔드 구현상 `TableSession`만 만들고 `Participant`를 만들지 않는다.
- `participant:left` 이벤트 수신 코드는 있으나 현재 백엔드 emit은 없다.
- `POST /api/chat/rooms` wrapper는 있지만 사용자 UI는 합석 요청 생성 응답의 `chatRoom`을 주 경로로 사용한다.

## 문서 대조 결과

프론트 문서는 현재 `frontend/js` 모듈에서 실제 호출하는 REST API와 실제 등록한 Socket 이벤트를 기준으로 작성했다. 남아 있는 불일치는 위 "알려진 제한 사항"에 정리했다.
