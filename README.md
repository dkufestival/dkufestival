# DKU Festival

축제 현장에서 사용하는 좌석 기반 실시간 참여 앱입니다.

축제 부스의 좌석을 배치하고 각 좌석의 이용 팀을 관리하며, 서로 다른 좌석의 참가자들이
실시간으로 채팅하거나 게임에 참여할 수 있도록 만드는 프로젝트입니다.

## 주요 기능

- 축제 부스의 좌석 배치 및 이용 세션 관리
- QR을 통한 좌석 입장과 참가 팀 정보 관리
- 좌석 간 실시간 채팅 및 합석 요청
- 좌석 간 게임 초대와 상태 동기화
- 축제 참가자가 함께 즐길 수 있는 단체 게임
- 관리자용 좌석 현황 확인 및 이용 종료 처리

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
cd dkufestival/backend
```

### 2. 백엔드 의존성 설치

```bash
npm ci
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
cp .env.example .env
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
