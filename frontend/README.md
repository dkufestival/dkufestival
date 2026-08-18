# piu:m

헌팅포차 컨셉의 테이블 매칭/채팅 웹앱. 사용자 페이지(`index.html`)와 관리자 페이지(`admin.html`)로 구성.

## 실행 방법

정적 파일이라 별도 빌드 없이 아무 정적 서버로 실행하면 됩니다.

```bash
python -m http.server 5174
```

- 사용자 페이지: http://localhost:5174/
- 관리자 페이지: http://localhost:5174/admin.html (데모 로그인: `admin` / `1234`)

## ⚠️ 현재 상태: 백엔드 없는 프론트엔드 프로토타입

화면 흐름과 인터랙션은 모두 완성되어 있지만, **실제 서버 통신 코드는 전혀 없습니다** (`fetch`/`XMLHttpRequest`/`Socket.IO` 미사용). 여러 사용자가 실제로 공유해야 하는 데이터는 전부 mock이거나 `localStorage`로 눈속임한 상태입니다.

`backend/` 쪽 API 명세(`docs/REST_API.md`, `docs/SOCKET_API.md`)를 확인한 결과, **단순히 API만 연결하면 되는 수준이 아니라 구조 자체가 다릅니다:**

- **입장 방식**: 백엔드는 QR 스캔 → `POST /api/tables/:tableId/enter` 흐름을 전제로 함. 지금 프론트는 드롭다운에서 테이블 번호를 직접 선택하는 방식.
- **Table vs TableSession**: 백엔드는 물리 테이블(`tableId`, 고정)과 "현재 그 자리를 쓰는 팀"(`tableSessionId`, 팀 바뀔 때마다 새로 생성)을 구분하고, 채팅/합석요청/게임을 전부 `tableSessionId` 기준으로 처리함. 지금 프론트는 이 구분이 없음.
- **좌석 수**: 백엔드 시드 기본값 20개(`TABLE_COUNT`, 조절 가능) vs 프론트 하드코딩 10개.
- **인증**: 입장 성공 시 참가자용 JWT 발급 → 이후 요청에 `Authorization: Bearer` 필요. 지금 프론트는 토큰을 다루는 로직이 없음.
- **신청곡 기능은 백엔드 API 문서에 없음** — 별도로 백엔드팀에 요청 필요.
- **공지사항 기능**(`POST /api/notices` → `notice:created` 소켓 이벤트)이 백엔드엔 이미 정의돼 있지만, 프론트엔 아직 화면 자체가 없음.

코드에는 각 위치마다 `// TODO(backend)` 주석으로 실제 필요한 엔드포인트/이벤트명을 구체적으로 달아뒀습니다 (`script.js`, `admin.js`에서 검색하면 전부 나옵니다).

| 기능 | 현재 구현 | 실제 백엔드 명세 |
|---|---|---|
| 테이블/좌석 현황 조회 | `script.js`의 `state.occupiedTables`에 하드코딩된 mock + 랜덤 생성 | `GET /api/tables` (인증 불필요) |
| 테이블 입장 | 드롭다운에서 번호 선택 → 로컬 state만 변경 | `POST /api/tables/:tableId/enter` (QR 입장, 참가자 JWT 발급) |
| 채팅 | **실제 상대방 없음.** `CANNED_REPLIES` 목록으로 가짜 자동응답 | 방 생성 `POST /api/chat/rooms`, 이전 기록 `GET /api/chat/rooms/:roomId/messages`, 실시간은 소켓 `chat:join`/`chat:send`/`chat:message` |
| 합석(채팅) 요청 | 요청 보내면 1.8초 후 무조건 가짜 응답 | 생성 `POST /api/join-requests`, 조회 `GET /api/join-requests`, 수락/거절/취소는 각각 `PATCH .../accept`, `PATCH .../reject`, `DELETE /api/join-requests/:id` (실시간 알림 방식은 문서에 없어 백엔드팀 확인 필요) |
| 신청곡 | `localStorage`(`piumSongRequests`)로 같은 브라우저 안에서만 사용자↔관리자 공유 | **백엔드 API 없음** — 별도 요청 필요 |
| 관리자 로그인 | ID/PW 평문 하드코딩(`admin`/`1234`), 서버 검증 없음 | `POST /api/admin/login` (JWT 발급) |
| 관리자 로그인 유지 | `localStorage` 플래그만 확인, 서버 검증 없음 | 발급받은 JWT를 저장하고 매 요청에 `Authorization: Bearer` |
| 관리자 - 입실/연장/초기화 | 로컬 state만 변경 | **백엔드 API 없음** — QR 입장 흐름과 맞는지 백엔드팀과 먼저 확인 필요 |
| 관리자 - 퇴실 처리 | 로컬 state만 변경 | `POST /api/admin/tables/:tableId/checkout` |
| 관리자 - 테이블 현황 조회 | `admin.js`의 `state.tables`가 사용자 페이지와 별개의 mock 데이터 | `GET /api/admin/tables` |
| 관리자 - 게임 전체 방송 | 관리자 화면에 로그만 남고 실제 사용자에겐 전달 안 됨 | 소켓 `game:global:start` → 참가자에게 `game:global:started`, 응답은 `game:action`/`game:global:state`, 종료는 `game:global:end`→`game:global:ended` |
| 1:1 게임(가위바위보 등) | **미구현** (화면 자체 없음) | 소켓 `game:register`/`game:invite`/`game:accept`/`game:action`/`game:end` |
| 전체 공지 | **미구현** (화면 자체 없음) | `POST /api/notices` → 소켓 `notice:created`, 조회 `GET /api/notices` |

## 파일 구조

```
index.html   사용자 페이지 (테이블 참여, 좌석도, 채팅, 신청곡)
script.js    사용자 페이지 로직
style.css    사용자 페이지 스타일

admin.html   관리자 페이지 (테이블 현황, 게임 관리, 신청곡 확인)
admin.js     관리자 페이지 로직
admin.css    관리자 페이지 스타일
```
