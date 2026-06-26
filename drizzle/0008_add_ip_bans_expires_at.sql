-- Add expires_at column (nullable) to ip_bans for temporary bans
ALTER TABLE ip_bans ADD COLUMN expires_at TEXT;
