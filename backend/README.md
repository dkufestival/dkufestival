# Backend

Node.js, Express, Socket.IO, Sequelize, MySQL 기반 백엔드입니다. 같은 Express 서버에서 `frontend` 디렉터리의 정적 파일도 함께 제공합니다.

## 환경 변수

`.env.example`을 복사해 `backend/.env`를 만듭니다.

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=festival
DB_SYNC=true
DB_ALTER=false
DB_LOGGING=false
CORS_ORIGIN=*
FRONTEND_URL=http://localhost:3000
SESSION_DURATION_MINUTES=120
QR_OUTPUT_DIR=./qr-codes
JWT_SECRET=replace_with_long_random_secret
ADMIN_ID=admin
ADMIN_PASSWORD=replace_with_admin_password
TABLE_COUNT=20
VAPID_PUBLIC_KEY=replace_with_vapid_public_key
VAPID_PRIVATE_KEY=replace_with_vapid_private_key
VAPID_SUBJECT=mailto:admin@example.com
```

운영 배포에서는 `DB_SYNC=false`, `DB_ALTER=false`를 권장하고, 스키마 변경은 명시적인 마이그레이션으로 적용합니다. `FRONTEND_URL`은 QR 코드 링크 생성에 사용되므로 실제 배포 URL로 설정해야 합니다.

## 배포 실행

```bash
npm ci
npm run migrate
npm start
```

루트에서 실행할 경우:

```bash
npm run setup
npm run migrate
npm run start
```

서버 상태 확인:

```text
GET /health
```

## 로컬 실행

```bash
npm install
npm run seed
npm run migrate
npm run dev
```

로컬 접속:

```text
사용자 화면: http://localhost:3000/index.html?qr=<qrToken>
관리자 화면: http://localhost:3000/admin.html
```

## 테이블 및 QR 생성

```bash
npm run seed
```

`TABLE_COUNT`만큼 테이블을 생성하고, 각 테이블의 QR 이미지를 `QR_OUTPUT_DIR`에 저장합니다. 기존 테이블은 유지되며 없는 테이블만 추가됩니다.

운영 QR을 생성할 때는 `FRONTEND_URL=https://dkufestival-app-production.up.railway.app`로 설정한 뒤 실행합니다.

## 마이그레이션

```bash
npm run migrate
npm run migrate:down
```

현재 마이그레이션:

1. `202608230001-chat-room-state.js`: 채팅방 상태 필드와 인덱스 추가
2. `202608230002-push-subscriptions.js`: Push 구독 테이블 생성
3. `202608230003-drop-join-requests.js`: 기존 `join_requests` 테이블 제거
4. `202608230004-time-match-game.js`: 타임 매치 게임 테이블 추가
5. `202608250001-pinball-game.js`: 핀볼 게임 관련 테이블 추가
6. `202608260001-table-session-accepting-requests.js`: 테이블 세션별 요청 수락 여부 추가
7. `202608260002-drop-chat-room-unique-index.js`: 채팅방 unique index 정리
8. `202608270001-recreation-games.js`: 레크리에이션 게임 테이블 추가
9. `202609010002-basketball-leaderboard.js`: 농구게임 타입과 참가자 개인 최고기록 TOP 3 저장 테이블 추가

운영 DB에 적용하기 전에는 백업을 먼저 만드세요.

## Web Push

VAPID 키가 없으면 Push API는 `PUSH_NOT_CONFIGURED`를 반환하지만, 채팅과 공지 기능은 계속 동작합니다.

```bash
npx web-push generate-vapid-keys
```

생성한 private key는 저장소에 커밋하지 않습니다.

## 검증

```bash
npm run check
npm test
```
