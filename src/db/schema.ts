import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	username: text("username").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	display: text("display").notNull(),
	badges: text("badges").notNull(),
	pfp: text("pfp").notNull(),
	bio: text("bio"),
	bannerUrl: text("banner_url"),
	chatMutedUntil: text("chat_muted_until"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
	hwid: text("hwid"),
	trustedUser: integer("trusted_user", { mode: "boolean" }).notNull().default(false),
	trustedRevokedManually: integer("trusted_revoked_manually", { mode: "boolean" }).notNull().default(false),
});

export const friendships = sqliteTable("friendships", {
	id: text("id").primaryKey(),
	requesterId: text("requester_id").notNull(),
	recipientId: text("recipient_id").notNull(),
	status: text("status").notNull().default("pending"), 
	createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
	tokenHash: text("token_hash").primaryKey(),
	userId: text("user_id").notNull(),
	expiresAt: text("expires_at").notNull(),
	createdAt: text("created_at").notNull(),
});

export const messages = sqliteTable("messages", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	fromUserId: text("from_user_id").notNull(),
	username: text("username").notNull(),
	avatarUrl: text("avatar_url").notNull(),
	content: text("content").notNull(),
	badges: text("badges").notNull(),
	sentAt: text("sent_at").notNull(),
	room: text("room"),
	toUserId: text("to_user_id"),
	replyToId: integer("reply_to_id"),
	groupId: text("group_id"),
	messageType: text("message_type").notNull().default("text"),
	attachmentUrl: text("attachment_url"),
});

export const auditLogs = sqliteTable("audit_logs", {
	id: text("id").primaryKey(),
	userId: text("user_id"),
	username: text("username"),
	action: text("action").notNull(),
	success: integer("success", { mode: "boolean" }).notNull(),
	ip: text("ip"),
	userAgent: text("user_agent"),
	ipChain: text("ip_chain"),
	headers: text("headers"),
	method: text("method"),
	route: text("route"),
	metadata: text("metadata"),
	createdAt: text("created_at").notNull(),
});

export const cloudSaves = sqliteTable("cloud_saves", {
	userId: text("user_id").primaryKey(),
	ls: text("ls").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const channels = sqliteTable("channels", {
	name: text("name").primaryKey(),
	private: integer("private", { mode: "boolean" }).notNull().default(false),
	locked: integer("locked", { mode: "boolean" }).notNull().default(false),
	trustedOnly: integer("trusted_only", { mode: "boolean" }).notNull().default(false),
	inviteCode: text("invite_code"),
	createdBy: text("created_by").notNull(),
	createdAt: text("created_at").notNull(),
});

export const channelMembers = sqliteTable("channel_members", {
	channelName: text("channel_name").notNull(),
	userId: text("user_id").notNull(),
	joinedAt: text("joined_at").notNull(),
});

export const ipBans = sqliteTable("ip_bans", {
	id: text("id").primaryKey(),
	ip: text("ip").notNull().unique(),
	reason: text("reason"),
	expiresAt: text("expires_at"),
	bannedBy: text("banned_by").notNull(),
	createdAt: text("created_at").notNull(),
});

export const moderationTickets = sqliteTable("moderation_tickets", {
	id: text("id").primaryKey(),
	createdBy: text("created_by").notNull(),
	createdByUsername: text("created_by_username").notNull(),
	reportedUserId: text("reported_user_id").notNull(),
	reportedUsername: text("reported_username").notNull(),
	scope: text("scope").notNull(),
	room: text("room"),
	messageIds: text("message_ids").notNull(),
	notes: text("notes"),
	status: text("status").notNull().default("open"),
	createdAt: text("created_at").notNull(),
});

export const banAppeals = sqliteTable("ban_appeals", {
	id: text("id").primaryKey(),
	ip: text("ip"),
	userId: text("user_id"),
	username: text("username"),
	message: text("message"),
	status: text("status").notNull().default("open"),
	adminResponse: text("admin_response"),
	createdAt: text("created_at").notNull(),
	resolvedAt: text("resolved_at"),
});

export const hwBans = sqliteTable("hw_bans", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	hwid: text("hwid").notNull().unique(),
	reason: text("reason"),
	bannedAt: integer("banned_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	bannedBy: text("banned_by"),
	expiresAt: text("expires_at"),
	ipAtBan: text("ip_at_ban"),
});

export const userBlocks = sqliteTable("user_blocks", {
	blockerId: text("blocker_id").notNull(),
	blockedId: text("blocked_id").notNull(),
	createdAt: text("created_at").notNull(),
});


export const infractions = sqliteTable("infractions", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	username: text("username").notNull(),
	type: text("type").notNull(), 
	reason: text("reason"),
	issuedBy: text("issued_by").notNull(),
	createdAt: text("created_at").notNull(),
});

export const imageHashBlocklist = sqliteTable("image_hash_blocklist", {
	hash: text("hash").primaryKey(), 
	reason: text("reason"),
	uploaderId: text("uploader_id"),
	uploaderUsername: text("uploader_username"),
	createdAt: text("created_at").notNull(),
});

export const savedQuotes = sqliteTable("saved_quotes", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	userId: text("user_id").notNull(),
	authorUsername: text("author_username").notNull(),
	authorDisplay: text("author_display").notNull(),
	authorAvatar: text("author_avatar").notNull(),
	content: text("content").notNull(),
	savedAt: text("saved_at").notNull(),
	sourceMessageId: integer("source_message_id"),
});
