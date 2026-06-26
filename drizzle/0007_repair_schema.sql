CREATE TABLE IF NOT EXISTS channel_members (
  channel_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (channel_name, user_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ip_bans (
  id TEXT PRIMARY KEY NOT NULL,
  ip TEXT NOT NULL UNIQUE,
  reason TEXT,
  banned_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS moderation_tickets (
  id TEXT PRIMARY KEY NOT NULL,
  created_by TEXT NOT NULL,
  created_by_username TEXT NOT NULL,
  reported_user_id TEXT NOT NULL,
  reported_username TEXT NOT NULL,
  scope TEXT NOT NULL,
  room TEXT,
  message_ids TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO channels (name, private, invite_code, created_by, created_at)
VALUES ('general', 0, NULL, 'system', datetime('now'));
--> statement-breakpoint
DROP TABLE IF EXISTS messages_repair;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS messages_repair (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  from_user_id text NOT NULL,
  username text NOT NULL,
  avatar_url text NOT NULL,
  content text NOT NULL,
  badges text NOT NULL,
  sent_at text NOT NULL,
  room text,
  to_user_id text,
  reply_to_id integer
);
--> statement-breakpoint
INSERT INTO messages_repair (id, from_user_id, username, avatar_url, content, badges, sent_at, room, to_user_id, reply_to_id)
SELECT id, from_user_id, username, avatar_url, content, badges, sent_at, room, to_user_id, reply_to_id
FROM messages;
--> statement-breakpoint
DROP TABLE IF EXISTS messages;
--> statement-breakpoint
ALTER TABLE messages_repair RENAME TO messages;
