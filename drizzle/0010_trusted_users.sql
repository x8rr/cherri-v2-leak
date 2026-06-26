-- Trusted user system
ALTER TABLE users ADD COLUMN trusted_user INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN trusted_revoked_manually INTEGER NOT NULL DEFAULT 0;
ALTER TABLE channels ADD COLUMN trusted_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE messages ADD COLUMN attachment_url TEXT;
