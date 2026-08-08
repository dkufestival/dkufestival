# Playce

단체 활동을 위한 실시간 레크레이션 진행 앱입니다.

진행자는 방을 만들고 게임을 시작하며, 참가자는 방 코드로 입장하여 모바일 화면에서 게임에 참여합니다. 앱은 Expo 기반 React Native 클라이언트와 Node.js 서버, MySQL 데이터베이스로 구성됩니다.

## 최종본 기준

- `main`: 최종 제출 및 실행 브랜치
- `sub`: 기능 통합 작업 브랜치
- 최종 구현 파일은 `sub`의 완료된 구현을 기준으로 `main`에 병합되었습니다.

## 주요 기능

### 진행자

- 회원가입 및 로그인
- 방 생성과 참가자 관리
- 일정, 팀 편성, 점수판 및 공지 관리
- 레크레이션 추가, 편집, 시작 및 종료
- Socket.IO 기반 참가자 화면 제어

### 참가자

- 방 코드 기반 입장
- 진행 중인 게임 화면 자동 전환
- 문제 확인 및 정답 제출
- 게임 종료 후 대기 화면 복귀

### 레크레이션

- O/X 퀴즈
- 가위바위보
- 이미지 게임
- 제시어 맞히기
- 익명 한마디
- 밸런스 게임
- 초성 게임
- 룰렛
- 미션 사진 찍기
- 음악 퀴즈

## 기술 스택

| 구분 | 기술 |
| --- | --- |
| App | React Native, Expo SDK 54, Expo Router, TypeScript, Socket.IO Client |
| Server | Node.js, Express, Socket.IO, Multer |
| Database | MySQL |

## 프로젝트 구조

```text
.
├── app/                         # Expo 앱
│   ├── app/                     # Expo Router 화면
│   ├── lib/api.js               # API 주소와 공용 요청 함수
│   ├── socket.ts                # Socket.IO 클라이언트
│   └── .env.example             # 앱 환경변수 예시
└── server/
    ├── index.js                 # Express 및 Socket.IO 서버
    ├── migrations/              # 추가 DB 마이그레이션
    ├── src/routes/              # REST API
    ├── src/musicQuizSocket.js   # 음악 퀴즈 실시간 이벤트
    └── uploads/                 # 이미지 및 음원 업로드 경로
```

## 실행 전 준비

새 컴퓨터에서 실행하려면 다음 프로그램이 필요합니다.

- Git
- Node.js 20 LTS 이상
- npm
- MySQL 8 이상 권장
- 모바일 시연 시 Expo Go 앱

Android Emulator를 사용하려면 Android Studio가 필요합니다. iOS Simulator는 macOS와 Xcode에서만 사용할 수 있습니다.

## 처음 설치 및 실행

### 1. 저장소 받기

최종 실행본은 `main` 브랜치에 있습니다.

```bash
git clone -b main https://github.com/dkufestival/dkufestival.git
cd dkufestival
```

이미 저장소를 받은 경우:

```bash
git switch main
git pull origin main
```

### 2. 의존성 및 패키지 설치

앱과 서버의 패키지는 각각 설치해야 합니다. `package-lock.json`에 기록된 버전을 그대로 설치하기 위해 `npm ci` 사용을 권장합니다.

```bash
cd server
npm ci

cd ../app
npm ci

cd ..
```

`npm ci`가 실패하면 해당 폴더에서 `npm install`을 사용합니다.

### 3. MySQL 데이터베이스 준비

MySQL에 접속합니다.

```bash
mysql -u root -p
```

아래 SQL을 실행하여 데이터베이스, 계정, 필수 기본 테이블을 생성합니다.

```sql
CREATE DATABASE IF NOT EXISTS playce
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'playce_user'@'localhost'
  IDENTIFIED BY 'playce_password';

GRANT ALL PRIVILEGES ON playce.* TO 'playce_user'@'localhost';
FLUSH PRIVILEGES;

USE playce;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(100) PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  nickname VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
  room_id INT AUTO_INCREMENT PRIMARY KEY,
  host_id VARCHAR(100) NOT NULL,
  room_code VARCHAR(6) NOT NULL UNIQUE,
  title VARCHAR(100) NOT NULL,
  current_activity_type VARCHAR(30),
  current_activity_title VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rooms_host (host_id)
);

CREATE TABLE IF NOT EXISTS room_members (
  member_id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  nickname VARCHAR(100) NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_room_members_room (room_id),
  CONSTRAINT fk_room_members_room
    FOREIGN KEY (room_id) REFERENCES rooms(room_id)
    ON DELETE CASCADE
);
```

MySQL 터미널에서 `exit`로 나온 뒤 추가 테이블 마이그레이션을 실행합니다.

```bash
mysql -u playce_user -p playce < server/migrations/001_create_music_quiz_questions.sql
mysql -u playce_user -p playce < server/migrations/002_create_team_score_notice_tables.sql
```

비밀번호 입력 화면에서 기본 설정을 사용했다면 `playce_password`를 입력합니다. 레크레이션, 일정 등 일부 부가 테이블과 컬럼은 API 최초 사용 시 서버가 자동 생성합니다.

### 4. 서버 환경변수 설정

프로젝트 루트에서 `server/.env` 파일을 생성합니다.

```env
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=playce_user
DB_PASSWORD=playce_password
DB_NAME=playce
```

### 5. 앱 환경변수 설정

```bash
cp app/.env.example app/.env
```

`app/.env`의 서버 주소를 실행 환경에 맞게 수정합니다.

```env
EXPO_PUBLIC_SERVER_URL=http://192.168.0.10:3000
```

| 실행 환경 | 서버 주소 |
| --- | --- |
| Expo Go 실기기 | 개발 PC의 Wi-Fi IP, 예: `http://192.168.0.10:3000` |
| Android Emulator | `http://10.0.2.2:3000` |
| iOS Simulator | `http://localhost:3000` |
| Web | `http://localhost:3000` |

macOS에서 현재 Wi-Fi IP는 다음 명령으로 확인할 수 있습니다.

```bash
ipconfig getifaddr en0
```

실기기와 개발 PC는 같은 Wi-Fi에 연결되어 있어야 하며, PC 방화벽에서 `3000` 포트 접근을 허용해야 합니다.

### 6. 서버 실행

첫 번째 터미널에서 실행합니다.

```bash
cd server
npm start
```

정상 실행 시 다음 주소에서 `Playce server is running` 응답을 확인할 수 있습니다.

```bash
curl http://localhost:3000/
```

### 7. 앱 실행

두 번째 터미널에서 실행합니다.

```bash
cd app
npm start
```

Expo CLI에서 실행 환경을 선택합니다.

```text
a  Android Emulator
i  iOS Simulator
w  Web
```

실제 휴대폰에서는 Expo Go로 터미널에 표시된 QR 코드를 스캔합니다.

실제 휴대폰 시연 시에는 프로젝트 루트에서 LAN 모드로 실행할 수 있습니다.
이 명령은 현재 컴퓨터의 LAN IP를 자동 감지해 `app/.env`를 갱신하고 Expo를 `8081` 포트로 실행합니다.

```bash
npm run lan
```

캐시를 초기화하고 LAN 모드로 실행하려면 다음 명령을 사용합니다.

```bash
npm run lan:clear
```

휴대폰 핫스팟처럼 기기 간 통신이 차단된 환경에서는 백엔드 서버 실행 후 터널 모드를 사용합니다.

```bash
brew install cloudflared
npm run tunnel
```

터널 모드는 API와 Socket.IO 공개 HTTPS 주소를 `app/.env`에 자동 반영하고 Expo Go용 QR 코드를 생성합니다.
터널 터미널을 종료하면 임시 주소도 폐기되므로 시연 중에는 터미널을 계속 실행해야 하며, 재실행할 때는 새 QR 코드를 다시 스캔해야 합니다.

Web만 실행하려면 다음 명령을 사용할 수 있습니다.

```bash
cd app
npm run web
```

## 시연 직전 빠른 실행

의존성 설치, DB 생성, `.env` 설정을 한 번 완료한 시연용 컴퓨터에서는 아래 순서만 진행합니다.

1. MySQL을 실행합니다.
2. 컴퓨터와 휴대폰을 같은 Wi-Fi에 연결합니다.
3. `npm run lan` 실행 시 현재 컴퓨터 IP가 `app/.env`에 자동 반영됩니다.
4. 서버를 실행합니다.

```bash
cd server
npm start
```

5. 새 터미널에서 앱을 실행합니다.

```bash
npm run lan
```

6. Expo Go에서 QR 코드를 스캔하고 로그인, 방 생성, 참가자 입장 순서로 확인합니다.

갑작스러운 시연에 대비해 패키지 설치와 DB 설정이 완료된 노트북을 사용하고, 시연 전에 테스트 계정과 방 생성 기능을 확인하는 것을 권장합니다.

## 주요 의존성

### App

- `expo`, `react`, `react-native`: 앱 실행 환경
- `expo-router`: 파일 기반 화면 라우팅
- `socket.io-client`: 실시간 서버 통신
- `expo-av`: 음악 퀴즈 음원 재생
- `expo-image-picker`, `expo-document-picker`: 이미지 및 파일 선택

### Server

- `express`: REST API 서버
- `socket.io`: 실시간 게임 통신
- `mysql2`: MySQL 연결
- `bcrypt`: 비밀번호 암호화
- `multer`: 이미지 및 음원 업로드
- `dotenv`: 서버 환경변수 로드

정확한 버전은 `app/package-lock.json`과 `server/package-lock.json`을 기준으로 설치됩니다.

## 검증 명령

앱 정적 검사:

```bash
cd app
npm run lint
npx tsc --noEmit
```

서버 문법 검사:

```bash
cd server
node --check index.js
node --check src/routes/playce.js
node --check src/routes/musicQuiz.js
node --check src/musicQuizSocket.js
```

## 문제 해결

### 앱에서 서버에 연결되지 않는 경우

- 서버 터미널에 표시되는 `Mobile access URL`이 `app/.env` 주소와 같은지 확인합니다.
- 실기기에서는 `localhost` 대신 개발 PC의 Wi-Fi IP를 사용합니다.
- 컴퓨터와 휴대폰이 같은 Wi-Fi인지 확인합니다.
- 휴대폰 핫스팟은 같은 핫스팟에 연결돼 있어도 기기 간 통신을 차단할 수 있습니다. 휴대폰 브라우저에서 `http://컴퓨터_IP:3000/` 접속이 안 되면 일반 공유기 Wi-Fi를 사용합니다.
- `app/.env` 수정 후 Expo 서버를 종료하고 다시 실행합니다.
- Expo 캐시 문제라면 프로젝트 루트에서 `npm run lan:clear`를 실행합니다.

### MySQL 연결 오류가 발생하는 경우

- MySQL 서버가 실행 중인지 확인합니다.
- `server/.env`의 DB 계정, 비밀번호, 포트, DB 이름을 확인합니다.
- `users`, `rooms`, `room_members` 기본 테이블이 생성됐는지 확인합니다.

### 패키지 설치 오류가 발생하는 경우

```bash
cd app
npm install

cd ../server
npm install
```

Node.js 버전이 너무 낮거나 높아 문제가 생기면 Node.js 20 LTS 환경에서 다시 설치합니다.

## Socket.IO 주요 흐름

### 공통 게임

- `joinRoom`
- `leaveRoom`
- `startGame`
- `endGame`
- `gameStarted`
- `gameEnded`

### 음악 퀴즈

- `musicQuiz:start`
- `musicQuiz:navigate`
- `musicQuiz:sync`
- `musicQuiz:submitAnswer`
- `musicQuiz:answer`
- `musicQuiz:stop`
- `musicQuiz:end`

## 업로드 파일 및 환경변수 주의사항

이미지와 음원은 서버 로컬 디렉터리에 저장됩니다.

```text
server/uploads/recreation/
server/uploads/music/
```

업로드 파일과 `.env` 파일은 GitHub에 포함되지 않습니다. 다른 컴퓨터에서는 환경변수를 새로 설정해야 하며, 기존 업로드 파일이 필요하면 별도로 옮겨야 합니다.

현재 서버와 DB는 로컬 실행 기준입니다. 아무 컴퓨터에서 설정 없이 즉시 실행하려면 서버와 MySQL을 별도로 배포하고 앱의 `EXPO_PUBLIC_SERVER_URL`을 배포 주소로 설정해야 합니다.
