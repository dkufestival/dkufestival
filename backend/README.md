# 축제 테이블 매칭 백엔드

## 기술 스택

- Node.js, Express
- Socket.IO
- MySQL, Sequelize
- JWT, dotenv, cors

## 프로젝트 구조

```text
backend/
├── src/
│   ├── server.js             # HTTP 서버 및 Socket.IO 시작
│   ├── app.js                # Express 앱 및 REST 라우트
│   ├── config/               # 환경변수와 DB 연결 설정
│   ├── routes/               # REST API 경로
│   ├── controllers/          # 요청/응답 처리
│   ├── services/             # 비즈니스 로직
│   ├── models/               # Sequelize DB 모델
│   ├── socket/               # 채팅·게임 Socket.IO 이벤트
│   └── middleware/           # JWT 등 공통 미들웨어
├── docs/
│   ├── REST_API.md
│   └── SOCKET_API.md
├── .env.example
├── package-lock.json
└── package.json
```

## 핵심 개념

`Table`은 실제 물리 테이블이고, `TableSession`은 현재 해당 테이블을 사용하는 팀입니다.
같은 테이블 QR로 여러 팀이 차례로 입장해도 `tableId`는 유지되며 팀이 바뀔 때마다 새로운
`tableSessionId`가 생성됩니다. 채팅, 합석 요청, 게임은 `tableSessionId`를 기준으로 처리합니다.

## 새 컴퓨터에서 처음 실행하기

### 1. 필수 프로그램 설치

권장 환경은 Node.js 20 LTS 이상, npm, MySQL 8 이상, Git입니다.

macOS에서 Homebrew를 사용하는 경우:

```bash
brew install node@20 mysql git
brew services start mysql
```

Ubuntu/Debian 계열인 경우:

```bash
sudo apt update
sudo apt install -y nodejs npm mysql-server git
sudo systemctl enable --now mysql
```

설치 여부를 확인합니다.

```bash
node --version
npm --version
mysql --version
git --version
```

### 2. 저장소 내려받기

```bash
git clone https://github.com/dkufestival/dkufestival.git
cd dkufestival/backend
```

이미 저장소가 있다면 최신 코드를 받습니다.

```bash
cd dkufestival
git pull origin main
cd backend
```

### 3. Node.js 의존성 설치

`package-lock.json`에 기록된 동일 버전을 설치하기 위해 `npm ci`를 사용합니다.

```bash
npm ci
```

개발 도구를 제외한 운영용 의존성만 설치하려면 다음 명령을 사용합니다.

```bash
npm ci --omit=dev
```

주요 의존성은 Express, Socket.IO, Sequelize, mysql2, jsonwebtoken, dotenv, cors입니다.

### 4. MySQL 데이터베이스와 계정 생성

MySQL 관리자 계정으로 접속합니다.

```bash
mysql -u root -p
```

MySQL 콘솔에서 아래 SQL을 실행합니다. 비밀번호는 개발 환경에 맞게 변경하세요.

```sql
CREATE DATABASE IF NOT EXISTS festival
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'festival_user'@'localhost'
  IDENTIFIED BY 'change_this_password';

GRANT ALL PRIVILEGES ON festival.* TO 'festival_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

생성한 계정으로 접속되는지 확인합니다.

```bash
mysql -u festival_user -p festival
```

접속이 확인되면 `EXIT;`를 입력해 종료합니다. 서버 시작 시 `DB_SYNC=true`이면 Sequelize가
필요한 테이블을 자동으로 생성합니다.

### 5. 환경변수 설정

예제 파일을 복사합니다.

```bash
cp .env.example .env
```

`backend/.env`를 아래와 같이 수정합니다.

```env
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=festival_user
DB_PASSWORD=change_this_password
DB_NAME=festival
DB_SYNC=true
DB_ALTER=false

CORS_ORIGIN=*
JWT_SECRET=replace_with_a_long_random_value
ADMIN_ID=admin
ADMIN_PASSWORD=replace_with_a_strong_password
TABLE_COUNT=20
```

JWT 비밀키는 다음 명령으로 생성할 수 있습니다.

```bash
openssl rand -hex 32
```

생성된 값을 `JWT_SECRET`에 붙여 넣습니다. `.env`는 비밀정보를 포함하므로 Git에 커밋하지 않습니다.

환경변수 설명:

| 이름 | 설명 | 개발 기본값 |
| --- | --- | --- |
| `PORT` | 백엔드 HTTP·Socket.IO 포트 | `3000` |
| `DB_HOST` | MySQL 서버 주소 | `localhost` |
| `DB_PORT` | MySQL 포트 | `3306` |
| `DB_USER` | MySQL 사용자 | `root` |
| `DB_PASSWORD` | MySQL 비밀번호 | 빈 값 |
| `DB_NAME` | 사용할 데이터베이스 | `festival` |
| `DB_SYNC` | 시작 시 Sequelize 테이블 동기화 여부 | `true` |
| `DB_ALTER` | 개발 DB의 기존 테이블을 모델에 맞춰 변경할지 여부 | `false` |
| `CORS_ORIGIN` | 접근을 허용할 프론트 주소 | `*` |
| `JWT_SECRET` | JWT 서명용 비밀키 | 개발용 기본값 |
| `ADMIN_ID` | 관리자 로그인 아이디 | `admin` |
| `ADMIN_PASSWORD` | 관리자 로그인 비밀번호(필수) | 없음 |
| `TABLE_COUNT` | seed로 생성할 물리 좌석 수 | `20` |

환경변수를 설정한 뒤 최초 한 번 좌석과 QR 토큰을 생성합니다.

```bash
npm run seed
```

### 6. 서버 실행

개발 모드에서는 파일 변경 시 서버가 자동으로 재시작됩니다.

```bash
npm run dev
```

일반 실행 또는 운영 실행:

```bash
npm start
```

정상적으로 시작되면 다음 로그가 표시됩니다.

```text
Festival backend listening on port 3000
```

### 7. 동작 확인

새 터미널에서 health API를 호출합니다.

```bash
curl http://localhost:3000/health
```

정상 응답:

```json
{"status":"ok"}
```

MySQL에 테이블이 생성됐는지도 확인할 수 있습니다.

```bash
mysql -u festival_user -p -D festival -e "SHOW TABLES;"
```

## 프론트엔드 연동

프론트엔드의 API 및 Socket.IO 서버 주소를 실행 중인 백엔드 주소로 맞춰야 합니다.

같은 컴퓨터에서 실행하는 경우:

```text
http://localhost:3000
```

휴대전화 등 같은 Wi-Fi의 다른 기기에서 접속하는 경우 macOS에서 개발 PC의 IP를 확인합니다.

```bash
ipconfig getifaddr en0
```

예를 들어 결과가 `192.168.0.10`이라면 프론트 서버 주소는 다음과 같습니다.

```text
http://192.168.0.10:3000
```

게임 소켓의 이벤트명, payload, 콜백 형식은 `docs/SOCKET_API.md`의 `프론트 연동 필수`
부분을 확인하세요. `sessionId`에는 물리 테이블 ID가 아닌 활성 `tableSessionId`를 전달해야 합니다.

## 자주 발생하는 문제

### `ECONNREFUSED 127.0.0.1:3306`

MySQL이 실행 중인지 확인하고 시작합니다.

```bash
brew services list
brew services start mysql
```

Linux에서는 다음 명령을 사용합니다.

```bash
sudo systemctl status mysql
sudo systemctl start mysql
```

### `Access denied for user`

`.env`의 `DB_USER`, `DB_PASSWORD`와 MySQL에서 생성한 계정 정보가 같은지 확인합니다.

```bash
mysql -u festival_user -p festival
```

### 포트 3000이 이미 사용 중인 경우

`.env`에서 다른 포트를 지정합니다.

```env
PORT=3001
```

프론트의 API·Socket.IO 주소도 같은 포트로 변경해야 합니다.

### 의존성 설치 상태를 초기화해야 하는 경우

`package-lock.json`은 삭제하지 않고 아래 명령을 다시 실행합니다.

```bash
npm ci
```

## 참고 사항

- 운영 환경에서는 `CORS_ORIGIN`을 실제 프론트 주소로 제한해야 합니다.
- 운영 DB에서는 스키마 마이그레이션 정책을 정한 뒤 `DB_SYNC=false` 사용을 권장합니다.
- 소켓 인증, QR 검증, 관리자 계정 검증은 추가 보완이 필요합니다.
