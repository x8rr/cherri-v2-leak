-- Add missing columns to users
ALTER TABLE `users` ADD COLUMN `bio` text;
ALTER TABLE `users` ADD COLUMN `banner_url` text;
ALTER TABLE `users` ADD COLUMN `hwid` text;
ALTER TABLE `users` ADD COLUMN `trusted_user` integer NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `trusted_revoked_manually` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Add missing columns to channels
ALTER TABLE `channels` ADD COLUMN `locked` integer NOT NULL DEFAULT 0;
ALTER TABLE `channels` ADD COLUMN `trusted_only` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Add missing columns to messages
ALTER TABLE `messages` ADD COLUMN `reply_to_id` integer;
ALTER TABLE `messages` ADD COLUMN `group_id` text;
ALTER TABLE `messages` ADD COLUMN `message_type` text NOT NULL DEFAULT 'text';
ALTER TABLE `messages` ADD COLUMN `attachment_url` text;
--> statement-breakpoint
-- Create missing tables
CREATE TABLE IF NOT EXISTS `friendships` (
	`id` text PRIMARY KEY NOT NULL,
	`requester_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`status` text NOT NULL DEFAULT 'pending',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hw_bans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hwid` text NOT NULL UNIQUE,
	`reason` text,
	`banned_at` integer NOT NULL DEFAULT (unixepoch()),
	`banned_by` text,
	`expires_at` text,
	`ip_at_ban` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_blocks` (
	`blocker_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `infractions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`username` text NOT NULL,
	`type` text NOT NULL,
	`reason` text,
	`issued_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `image_hash_blocklist` (
	`hash` text PRIMARY KEY NOT NULL,
	`reason` text,
	`uploader_id` text,
	`uploader_username` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `saved_quotes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`author_username` text NOT NULL,
	`author_display` text NOT NULL,
	`author_avatar` text NOT NULL,
	`content` text NOT NULL,
	`saved_at` text NOT NULL
);
