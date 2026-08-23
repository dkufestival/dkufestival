# Backend

Node.js, Express, Socket.IO, Sequelize, MySQL 기반 백엔드입니다.

## 환경변수

`.env.example`을 복사해 `.env`를 만듭니다.

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=festival
DB_SYNC=true
DB_ALTER=false
CORS_ORIGIN=*
FRONTEND_URL=http://localhost:5174
SESSION_DURATION_MINUTES=120
JWT_SECRET=replace_with_long_random_secret
ADMIN_ID=admin
ADMIN_PASSWORD=replace_with_admin_password
VAPID_PUBLIC_KEY=replace_with_vapid_public_key
VAPID_PRIVATE_KEY=replace_with_vapid_private_key
VAPID_SUBJECT=mailto:admin@example.com
```

실데이터 DB에서는 `DB_ALTER=true`에 의존하지 말고 명시적 마이그레이션을 사용합니다.

## 마이그레이션

```bash
npm run migrate
npm run migrate:down
```

적용 순서:

1. `202608230001-chat-room-state.js`: `chat_rooms`에 요청/활성/종료 상태 필드와 인덱스 추가, 기존 `sessionAId/sessionBId` 데이터 보존
2. `202608230002-push-subscriptions.js`: Push 구독 테이블 생성
3. `202608230003-drop-join-requests.js`: 기존 `join_requests` 테이블 제거

롤백은 마지막 마이그레이션 1개씩 수행합니다. `join_requests` 제거 롤백은 자동화하지 않았으므로 운영 적용 전 백업이 필요합니다.

## 실행

```bash
npm install
npm run seed
npm run migrate
npm run dev
```

빈 DB에서는 `seed`가 현재 모델 기준으로 테이블을 생성한 뒤 QR을 발급합니다. 기존 운영 DB는 백업 후 `npm run migrate`를 먼저 적용하고, QR 테이블 초기화가 필요할 때만 `seed`를 실행합니다.

## 채팅 lifecycle

- 요청 생성은 대표(`Participant.isHost=true`)만 가능
- 요청 수락/거절은 대상 테이블 대표만 가능
- 테이블당 `PENDING` 또는 `ACTIVE` 채팅은 하나만 가능
- 요청은 1분 뒤 `EXPIRED`
- 수락 시 `ACTIVE`, 양쪽 세션의 현재 소켓이 `chat:<roomId>`에 들어감
- `ACTIVE` 방만 `chat:join`, `chat:send`, 메시지 조회 가능
- 종료 시 `CLOSED`와 `endedAt`, `endedByParticipantId`, `endReason` 기록
- checkout은 `SESSION_CHECKED_OUT`, 시간 만료는 `SESSION_EXPIRED`

## Web Push

VAPID 키가 없으면 Push API는 `PUSH_NOT_CONFIGURED`를 반환하지만 채팅/공지 기능은 계속 동작합니다. 키 생성은 로컬에서 별도로 수행하고 실제 private key는 커밋하지 않습니다.

```bash
npx web-push generate-vapid-keys
```

## 검증

```bash
npm run check
npm test
```
