# REST API

| 메서드 | URL | 설명 | 인증 |
| --- | --- | --- | --- |
| GET | `/api/tables` | 실제 테이블과 세션 목록 조회 | 아니오 |
| GET | `/api/tables/:tableId` | 특정 테이블 상세 조회 | 아니오 |
| POST | `/api/tables/:tableId/enter` | QR 입장 후 새 활성 테이블 세션 생성 | 아니오 |
| PATCH | `/api/tables/me` | 현재 테이블 세션 대표 정보 수정 | 예 |
| POST | `/api/join-requests` | 다른 테이블 세션에 합석 요청 생성 | 예 |
| GET | `/api/join-requests` | 현재 테이블 세션의 합석 요청 조회 | 예 |
| PATCH | `/api/join-requests/:requestId/accept` | 합석 요청 수락 | 예 |
| PATCH | `/api/join-requests/:requestId/reject` | 합석 요청 거절 | 예 |
| DELETE | `/api/join-requests/:requestId` | 합석 요청 취소 | 예 |
| POST | `/api/chat/rooms` | 테이블 세션 간 채팅방 생성 | 예 |
| GET | `/api/chat/rooms` | 현재 테이블 세션의 채팅방 목록 조회 | 예 |
| GET | `/api/chat/rooms/:roomId/messages` | 이전 채팅 메시지 조회 | 예 |
| POST | `/api/admin/login` | 관리자 로그인 및 JWT 발급 | 아니오 |
| GET | `/api/admin/tables` | 관리자용 테이블/세션 목록 조회 | 예 |
| POST | `/api/admin/tables/:tableId/checkout` | 특정 테이블의 현재 활성 세션 종료 처리 | 예 |
| GET | `/api/notices` | 최근 전체 공지 조회 | 예 |
| POST | `/api/notices` | 관리자 전체 공지 생성 | 관리자 |

좌석 입장 성공 응답에는 참가자용 JWT가 포함됩니다. 이후 인증 API는
`Authorization: Bearer <token>` 헤더를 사용합니다.
