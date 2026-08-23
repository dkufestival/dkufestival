# DKU Festival

QR 기반 테이블 입장, 실시간 채팅 요청, 공지, 신청곡, 게임, 관리자 운영 화면을 제공하는 프로젝트입니다.

## 실행

```bash
npm run setup
cp backend/.env.example backend/.env
npm run seed --prefix backend
npm run migrate --prefix backend
npm run dev
```

프론트는 정적 파일 서버로 실행합니다.

```bash
cd frontend
python -m http.server 5174
```

사용자 화면: `http://localhost:5174/index.html?qr=<qrToken>`

관리자 화면: `http://localhost:5174/admin.html`

## 채팅 흐름

대표 참가자만 다른 사용 중 테이블에 채팅 요청을 보낼 수 있습니다. 요청은 1분 동안 `PENDING`이며, 상대 테이블 대표가 수락하면 `ACTIVE`가 됩니다. 수락 즉시 양쪽 테이블의 모든 참가자는 전체 화면 채팅으로 이동합니다. 아무 참가자나 종료할 수 있고, 종료 후 같은 두 테이블이 다시 요청하면 새 방을 생성합니다.

## 문서

- [Backend README](backend/README.md)
- [REST API](backend/docs/REST_API.md)
- [Socket.IO API](backend/docs/SOCKET_API.md)
- [Frontend README](frontend/README.md)
