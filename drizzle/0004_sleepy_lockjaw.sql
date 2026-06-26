CREATE TABLE IF NOT EXISTS `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`username` text,
	`action` text NOT NULL,
	`success` integer NOT NULL,
	`ip` text,
	`ip_chain` text,
	`headers` text,
	`method` text,
	`route` text,
	`metadata` text,
	`created_at` text NOT NULL
);
