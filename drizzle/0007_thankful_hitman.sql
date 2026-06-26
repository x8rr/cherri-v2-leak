CREATE TABLE  IF NOT EXISTS `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`username` text,
	`action` text NOT NULL,
	`success` integer NOT NULL,
	`ip` text,
	`user_agent` text,
	`ip_chain` text,
	`headers` text,
	`method` text,
	`route` text,
	`metadata` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `ban_appeals` (
	`id` text PRIMARY KEY NOT NULL,
	`ip` text,
	`user_id` text,
	`username` text,
	`message` text,
	`status` text DEFAULT 'open' NOT NULL,
	`admin_response` text,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `channel_members` (
	`channel_name` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `channels` (
	`name` text PRIMARY KEY NOT NULL,
	`private` integer DEFAULT false NOT NULL,
	`invite_code` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `ip_bans` (
	`id` text PRIMARY KEY NOT NULL,
	`ip` text NOT NULL,
	`reason` text,
	`expires_at` text,
	`banned_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `ip_bans_ip_unique` ON `ip_bans` (`ip`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `moderation_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`created_by_username` text NOT NULL,
	`reported_user_id` text NOT NULL,
	`reported_username` text NOT NULL,
	`scope` text NOT NULL,
	`room` text,
	`message_ids` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL
);