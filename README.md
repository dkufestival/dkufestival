# DKU Festival

축제 주점 운영을 위한 테이블 세션, QR 입장, 합석 요청, 채팅, 공지, 신청곡, 게임 백엔드와 프론트엔드 프로젝트다.

## 주요 개념

- `Table`: 현장의 물리 테이블
- `TableSession`: 현재 해당 테이블을 사용하는 팀
- `Participant`: 같은 테이블 세션에 접속한 개별 휴대폰 사용자

한 테이블 QR에는 여러 휴대폰이 접속할 수 있고, 각 참가자는 별도 닉네임과 JWT를 가진다.

## 기술 스택

- Backend: Node.js, Express, Socket.IO, Sequelize, MySQL
- Frontend: 정적 HTML/CSS/JavaScript
- Authentication: JWT

## 설치

```bash
git clone https://github.com/dkufestival/dkufestival.git
cd dkufestival
npm run setup
```

## 백엔드 환경변수

```bash
cp backend/.env.example backend/.env
```

주요 변수:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `DB_SYNC`, `DB_ALTER`
- `JWT_SECRET`
- `ADMIN_ID`, `ADMIN_PASSWORD`
- `CORS_ORIGIN`
- `FRONTEND_URL`
- `SESSION_DURATION_MINUTES`
- `QR_OUTPUT_DIR`
- `TABLE_COUNT`

자세한 설명은 [backend/README.md](backend/README.md)를 확인한다.

## 실행

```bash
cd backend
npm run seed
npm run dev
```

`npm run seed`는 물리 테이블과 QR 토큰을 준비하고, `<FRONTEND_URL>/index.html?qr=<qrToken>` 형식의 QR PNG를 `QR_OUTPUT_DIR`에 생성한다.

## 문서

- [Backend README](backend/README.md)
- [REST API](backend/docs/REST_API.md)
- [Socket.IO API](backend/docs/SOCKET_API.md)
