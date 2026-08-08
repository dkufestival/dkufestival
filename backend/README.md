# 축제 테이블 매칭 백엔드

## 기술 스택

- Node.js
- Express
- Socket.IO
- MySQL
- Sequelize
- JWT
- dotenv
- cors

## 프로젝트 구조

```text
backend/
├── src/
│   ├── server.js
│   ├── app.js
│   ├── config/
│   │   └── db.js
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── models/
│   ├── socket/
│   └── middleware/
├── docs/
│   ├── REST_API.md
│   └── SOCKET_API.md
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## 핵심 개념

`Table`은 실제 물리 테이블.  `TableSession`은 현재 해당 테이블을 사용하는 팀.

같은 테이블 QR로 여러 팀이 차례로 입장해도 `tableId`는 유지되고, 팀이 바뀔 때마다 새로운 `tableSessionId`가 생성됨. 채팅, 합석 요청, 게임은 `tableSessionId`를 기준으로 처리함.

## 실행 방법

```bash
npm install
cp .env.example .env
npm run dev
```

서버 기본 포트는 `3000`

## 참고 사항
 인증 정책, QR 검증, payload validation, 관리자 권한 검증, 게임 상태 동기화는 TODO
