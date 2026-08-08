# DKU Festival

대학교 축제 기간 동안 주점 운영에 사용하는 실시간 웹 서비스입니다.

축제 주점의 관리자와 참가자가 하나의 웹 서비스에 접속하여 좌석을 관리하고 공지를
확인하며, 실시간 채팅과 게임을 편리하게 이용할 수 있도록 하는 것을 목적으로 합니다.
관리자는 주점 운영과 전체 프로그램 진행을 관리하고, 참가자는 자신의 휴대폰으로 다른
좌석과 소통하거나 게임에 참여할 수 있습니다.

## 주요 기능

서비스는 관리자와 참가자의 이용 흐름을 기준으로 다음 기능을 구성합니다.

### 관리자 기능

- **좌석 배치 및 관리**
  - 주점 내부의 좌석 배치를 확인하고 관리합니다.
  - 좌석별 상태와 해당 좌석의 참가자를 관리할 수 있도록 구성할 예정입니다.
- **전체 공지**
  - 모든 참가자에게 게임, 이벤트, 주점 운영과 관련된 안내를 실시간으로 전달합니다.
- **게임 진행**
  - 주점 이용객을 대상으로 게임을 시작하고 진행합니다.
  - 참가자는 자신의 휴대폰을 통해 진행 중인 게임에 참여할 수 있습니다.

### 참가자 기능

- **다른 좌석에 채팅 요청**
  - 현재 주점에 있는 다른 좌석을 확인하고 원하는 좌석에 채팅을 요청합니다.
  - 좌석을 기준으로 참가자들이 자연스럽게 소통할 수 있도록 합니다.
- **실시간 채팅**
  - 연결된 좌석 또는 참가자끼리 실시간으로 메시지를 주고받습니다.
- **게임 참가**
  - 관리자가 진행하는 게임에 참가자의 휴대폰을 이용하여 실시간으로 참여합니다.

## 기술 스택

- Backend: Node.js, Express, Socket.IO
- Database: MySQL, Sequelize
- Authentication: JWT

## 설치해야 하는 프로그램

새 컴퓨터에서 실행하려면 다음 프로그램이 필요합니다.

- Git
- Node.js 20 LTS 이상 및 npm
- MySQL 8 이상

macOS에서 Homebrew를 사용하는 경우:

```bash
brew install git node@20 mysql
brew services start mysql
```

설치 확인:

```bash
git --version
node --version
npm --version
mysql --version
```

## 프로젝트 설치 및 실행

### 1. 저장소 내려받기

```bash
git clone https://github.com/dkufestival/dkufestival.git
cd dkufestival
```

### 2. 백엔드 의존성 설치

```bash
npm run setup
```

### 3. MySQL 데이터베이스 생성

```bash
mysql -u root -p
```

MySQL 콘솔에서 아래 SQL을 실행합니다.

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

### 4. 환경변수 설정

```bash
cp backend/.env.example backend/.env
```

`backend/.env`를 다음과 같이 수정합니다.

```env
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=festival_user
DB_PASSWORD=change_this_password
DB_NAME=festival
DB_SYNC=true

CORS_ORIGIN=*
JWT_SECRET=replace_with_a_long_random_value
```

JWT 비밀키는 다음 명령으로 생성할 수 있습니다.

```bash
openssl rand -hex 32
```

### 5. 서버 실행

개발 모드:

```bash
npm run dev
```

일반 실행:

```bash
npm start
```

### 6. 실행 확인

```bash
curl http://localhost:3000/health
```

정상 응답:

```json
{"status":"ok"}
```

자세한 운영체제별 설치 방법과 오류 해결 방법은
[백엔드 설치 및 실행 안내](backend/README.md)를 확인하세요.

프론트엔드에서 API와 게임 소켓을 연결할 때는
[Socket.IO 연동 문서](backend/docs/SOCKET_API.md)를 확인하세요.
