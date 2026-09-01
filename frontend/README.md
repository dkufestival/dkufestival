# Frontend

정적 HTML/CSS/JavaScript 프론트엔드입니다. 배포 환경에서는 백엔드 Express 서버가 `frontend` 디렉터리를 함께 서빙하므로 별도의 프론트 서버가 필요하지 않습니다.

## 배포 후 접속

```text
사용자 화면: https://dkufestival-app-production.up.railway.app/index.html?qr=<qrToken>
관리자 화면: https://dkufestival-app-production.up.railway.app/admin.html
농구 게임:   https://dkufestival-app-production.up.railway.app/basketball/
스톱워치:    https://dkufestival-app-production.up.railway.app/stopwatch/
```

`frontend/js/config.js`는 배포 환경에서 `window.location.origin`을 API와 Socket.IO 주소로 사용합니다. 즉 프론트와 백엔드가 같은 도메인에서 제공되면 별도 설정이 필요 없습니다.

## 로컬 실행

저장소 루트에서 백엔드 서버 하나만 실행하면 프론트까지 함께 확인할 수 있습니다.

```bash
npm run dev
```

```text
사용자 화면: http://localhost:3000/index.html?qr=<qrToken>
관리자 화면: http://localhost:3000/admin.html
농구 게임:   http://localhost:3000/basketball/
스톱워치:    http://localhost:3000/stopwatch/
```

프론트만 별도 정적 서버로 확인할 수도 있습니다.

```bash
cd frontend
python -m http.server 5174
```

이 경우 API와 Socket.IO는 자동으로 `http://localhost:3000`을 사용합니다.

## 주요 화면

1. QR 링크로 테이블에 입장합니다.
2. 첫 입장자는 호스트가 되며 테이블 인원을 설정합니다.
3. 호스트만 다른 사용 중 테이블에 채팅 요청을 보낼 수 있습니다.
4. 요청은 1분 동안 대기 상태이고, 상대 테이블 호스트가 수락하면 채팅방이 활성화됩니다.
5. 활성 채팅은 새로고침이나 재접속 후에도 복구됩니다.
6. 관리자는 공지, 신청곡, 게임, 테이블 상태를 `admin.html`에서 관리합니다.
7. 농구게임은 관리자 시작 없이 언제든 플레이할 수 있으며, 로그인한 참가자의 개인 최고점 TOP 3가 관리자와 참가자 화면에서 실시간 갱신됩니다.

## 알림

`sw.js`, `manifest.webmanifest`, `js/push.js`가 Web Push를 담당합니다. 사용자가 알림을 켠 경우에만 브라우저 권한을 요청합니다.

iOS는 홈 화면에 추가한 PWA 환경에서만 Push가 동작할 수 있습니다.
