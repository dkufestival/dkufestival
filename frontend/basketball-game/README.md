# Basketball Game

단국대학교 축제 주점용 모바일 농구 미니게임입니다.

## 로컬 실행

Node.js 20 이상과 pnpm이 필요합니다.

```bash
pnpm install
pnpm dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 휴대폰에서 테스트

PC와 휴대폰을 같은 Wi-Fi에 연결한 뒤 아래처럼 실행합니다.

```bash
pnpm dev --host 0.0.0.0
```

휴대폰에서 `http://PC의-내부-IP:3000`으로 접속합니다. Windows 방화벽 알림이 표시되면 개인 네트워크 접근을 허용해야 합니다.

축제 QR로 불특정 사용자가 접속하려면 로컬 서버가 아니라 공개된 웹 주소로 별도 배포해야 합니다.
