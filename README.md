# DKU Festival

단국대학교 축제 주점 운영을 위한 QR 기반 테이블 입장, 실시간 채팅 매칭, 전체채팅, 공지, 미니게임, 관리자 화면 프로젝트입니다.

백엔드 Express 서버가 API, Socket.IO, 프론트 정적 파일을 함께 제공합니다. 배포 후에는 별도 프론트 개발 서버 없이 같은 도메인에서 사용자 화면과 관리자 화면에 접속합니다.

## 배포 후 접속

```text
사용자 화면: https://dkufestival-app-production.up.railway.app/index.html?qr=<qrToken>
관리자 화면: https://dkufestival-app-production.up.railway.app/admin.html
농구 게임:   https://dkufestival-app-production.up.railway.app/basketball/
스톱워치:    https://dkufestival-app-production.up.railway.app/stopwatch/
```

QR 이미지는 `FRONTEND_URL` 값을 기준으로 생성됩니다. 운영 QR을 새로 만들 때는 `.env`의 `FRONTEND_URL`을 실제 배포 URL로 설정한 뒤 `npm run seed`를 실행하세요.

## 운영 환경 변수

백엔드는 `backend/.env`를 사용합니다. 배포 환경에는 최소한 아래 값을 설정합니다.

```env
PORT=3000
DB_HOST=<mysql-host>
DB_PORT=3306
DB_USER=<mysql-user>
DB_PASSWORD=<mysql-password>
DB_NAME=<mysql-database>
DB_SYNC=false
DB_ALTER=false
CORS_ORIGIN=https://dkufestival-app-production.up.railway.app
FRONTEND_URL=https://dkufestival-app-production.up.railway.app
JWT_SECRET=<long-random-secret>
ADMIN_ID=<admin-id>
ADMIN_PASSWORD=<admin-password>
TABLE_COUNT=80
QR_OUTPUT_DIR=./qr-codes
```

웹 푸시를 사용할 경우 `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`도 설정합니다.

## 배포 서버 실행

```bash
npm run setup
npm run start
```

`npm run start`는 최신 DB 마이그레이션을 먼저 적용한 뒤 단일 서버를 실행합니다.

처음 테이블과 QR을 생성해야 할 때만 아래 명령을 실행합니다.

```bash
npm run seed
```

이미 운영 DB가 있는 경우 `seed`는 기존 테이블을 덮어쓰지 않고 없는 테이블만 추가합니다. QR 파일은 `backend/qr-codes`에 생성됩니다.

## 로컬 개발

```bash
npm run setup
cp backend/.env.example backend/.env
npm run seed
npm run migrate
npm run dev
```

로컬에서는 백엔드가 프론트까지 함께 서빙하므로 아래 주소로 접속합니다.

```text
사용자 화면: http://localhost:3000/index.html?qr=<qrToken>
관리자 화면: http://localhost:3000/admin.html
```

프론트를 별도 정적 서버로 띄워 확인할 수도 있습니다. 이 경우 `frontend/js/config.js`가 `5174` 또는 `5500` 포트에서 API 서버를 `http://localhost:3000`으로 자동 지정합니다.

```bash
cd frontend
python -m http.server 5174
```

## 주요 명령

```bash
npm run start    # 배포/운영 실행
npm run dev      # nodemon 개발 실행
npm run migrate  # DB 마이그레이션 적용
npm run seed     # 테이블/QR 초기 생성
npm run check    # JS 문법 검사
npm test         # 테스트 실행
```

## 문서

- [Backend README](backend/README.md)
- [Frontend README](frontend/README.md)
- [REST API](backend/docs/REST_API.md)
- [Socket.IO API](backend/docs/SOCKET_API.md)
