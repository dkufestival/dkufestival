-- 팀 편성, 팀 점수판, 진행자 공지 기능을 위한 추가 테이블입니다.
-- 기존 rooms, room_members, recreation_* 테이블은 변경하지 않고 room_id 기준 FK만 연결합니다.

CREATE TABLE IF NOT EXISTS room_teams (
  team_id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  team_name VARCHAR(80) NOT NULL,
  score INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_room_teams_name (room_id, team_name),
  INDEX idx_room_teams_room (room_id),
  CONSTRAINT fk_room_teams_room
    FOREIGN KEY (room_id) REFERENCES rooms(room_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS room_team_members (
  team_member_id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  team_id INT NOT NULL,
  member_id INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_room_team_members_member (room_id, member_id),
  INDEX idx_room_team_members_team (team_id),
  CONSTRAINT fk_room_team_members_room
    FOREIGN KEY (room_id) REFERENCES rooms(room_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_room_team_members_team
    FOREIGN KEY (team_id) REFERENCES room_teams(team_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_room_team_members_member
    FOREIGN KEY (member_id) REFERENCES room_members(member_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS room_team_score_events (
  score_event_id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  team_id INT NOT NULL,
  delta INT NOT NULL,
  reason VARCHAR(255),
  source VARCHAR(40) NOT NULL DEFAULT 'manual',
  event_ref VARCHAR(120),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_score_events_ref (event_ref),
  INDEX idx_score_events_room_created (room_id, created_at),
  CONSTRAINT fk_score_events_room
    FOREIGN KEY (room_id) REFERENCES rooms(room_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_score_events_team
    FOREIGN KEY (team_id) REFERENCES room_teams(team_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS room_host_notices (
  notice_id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  message VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_room_host_notices_room_created (room_id, created_at),
  CONSTRAINT fk_room_host_notices_room
    FOREIGN KEY (room_id) REFERENCES rooms(room_id)
    ON DELETE CASCADE
);
