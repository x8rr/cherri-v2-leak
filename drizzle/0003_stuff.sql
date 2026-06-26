CREATE TABLE IF NOT EXISTS channels (
  name TEXT PRIMARY KEY,
  private INTEGER NOT NULL DEFAULT 0,
  invite_code TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (channel_name, user_id)
);

INSERT OR IGNORE INTO channels (name, private, invite_code, created_by, created_at)
VALUES ('general', 0, NULL, 'system', datetime('now'));