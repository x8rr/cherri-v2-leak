-- Create table for ban appeals
CREATE TABLE IF NOT EXISTS ban_appeals (
  id TEXT PRIMARY KEY,
  ip TEXT,
  user_id TEXT,
  username TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  admin_response TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
