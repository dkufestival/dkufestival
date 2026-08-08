# Socket API

## 클라이언트 -> 서버

| 이벤트 | 설명 | Payload |
| --- | --- | --- |
| `chat:join` | 채팅방 소켓 채널 입장 | TODO: `{ roomId }` |
| `chat:send` | 채팅 메시지 전송 | TODO: `{ roomId, senderSessionId, content }` |
| `game:invite` | 다른 테이블 세션에 게임 초대 전송 | TODO |
| `game:accept` | 게임 초대 수락 | TODO |
| `game:action` | 게임 액션/상태 업데이트 전송 | TODO |

## 서버 -> 클라이언트

| 이벤트 | 설명 | Payload |
| --- | --- | --- |
| `chat:message` | 새 채팅 메시지 브로드캐스트 | TODO |
| `game:invited` | 게임 초대 알림 | TODO |
| `game:started` | 게임 시작 알림 | TODO |
| `game:state` | 게임 상태 업데이트 | TODO |

소켓 인증, 룸 네이밍, 정확한 payload 계약은 TODO로 둔다.
