import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

const resolvedDbPath = resolve(process.cwd(), "data/cherri.sqlite");
const migrationsFolder = resolve(process.cwd(), "drizzle");

mkdirSync(dirname(resolvedDbPath), { recursive: true });

const sqlite = new Database(resolvedDbPath, {
	create: true,
	strict: true,
});

sqlite.run("PRAGMA journal_mode = WAL;");
sqlite.run("PRAGMA synchronous = NORMAL;");
sqlite.run("PRAGMA foreign_keys = ON;");
sqlite.run("PRAGMA busy_timeout = 5000;");
sqlite.run("PRAGMA cache_size = -32000;");
sqlite.run("PRAGMA temp_store = MEMORY;");

export const db = drizzle({ client: sqlite, schema });
export const dbFilePath = resolvedDbPath;
export const sqliteClient = sqlite;

function getTableColumns(tableName: string): Set<string> {
	const rows = [...sqlite.query(`PRAGMA table_info('${tableName}')`)];
	return new Set(
		rows.map((row: any) => (Array.isArray(row) ? row[1] : row.name)),
	);
}

function ensureColumn(
	tableName: string,
	columnName: string,
	definition: string,
) {
	const columns = getTableColumns(tableName);
	if (!columns.has(columnName)) {
		sqlite.run(`ALTER TABLE "${tableName}" ADD COLUMN ${definition};`);
	}
}

function ensureTable(createSql: string) {
	sqlite.run(createSql);
}

function repairDatabaseSchema() {
	try {
		ensureColumn("messages", "to_user_id", "to_user_id TEXT");
		ensureColumn("messages", "reply_to_id", "reply_to_id INTEGER");
		ensureColumn("messages", "group_id", "group_id TEXT");
		ensureColumn("hw_bans", "banned_by", "banned_by TEXT");
		ensureColumn("hw_bans", "expires_at", "expires_at TEXT");
		ensureColumn("hw_bans", "ip_at_ban", "ip_at_ban TEXT");
		ensureColumn("channels", "locked", "locked INTEGER NOT NULL DEFAULT 0");
		ensureColumn("channels", "trusted_only", "trusted_only INTEGER NOT NULL DEFAULT 0");
		ensureColumn("users", "trusted_user", "trusted_user INTEGER NOT NULL DEFAULT 0");
		ensureColumn("users", "trusted_revoked_manually", "trusted_revoked_manually INTEGER NOT NULL DEFAULT 0");
		ensureColumn("messages", "message_type", "message_type TEXT NOT NULL DEFAULT 'text'");
		ensureColumn("messages", "attachment_url", "attachment_url TEXT");
		ensureColumn("users", "bio", "bio TEXT");
		ensureColumn("users", "banner_url", "banner_url TEXT");

		ensureTable(`CREATE TABLE IF NOT EXISTS "friendships" (
			"id" TEXT PRIMARY KEY,
			"requester_id" TEXT NOT NULL,
			"recipient_id" TEXT NOT NULL,
			"status" TEXT NOT NULL DEFAULT 'pending',
			"created_at" TEXT NOT NULL
		)`);

		ensureTable(`CREATE TABLE IF NOT EXISTS "infractions" (
			"id" TEXT PRIMARY KEY,
			"user_id" TEXT NOT NULL,
			"username" TEXT NOT NULL,
			"type" TEXT NOT NULL,
			"reason" TEXT,
			"issued_by" TEXT NOT NULL,
			"created_at" TEXT NOT NULL
		)`);

		ensureTable(`CREATE TABLE IF NOT EXISTS "user_blocks" (
			"blocker_id" TEXT NOT NULL,
			"blocked_id" TEXT NOT NULL,
			"created_at" TEXT NOT NULL,
			PRIMARY KEY ("blocker_id", "blocked_id")
		)`);

		ensureTable(`CREATE TABLE IF NOT EXISTS "group_chats" (
			"id" TEXT PRIMARY KEY,
			"name" TEXT NOT NULL,
			"created_by" TEXT NOT NULL,
			"created_at" TEXT NOT NULL
		)`);

		ensureTable(`CREATE TABLE IF NOT EXISTS "group_chat_members" (
			"group_id" TEXT NOT NULL,
			"user_id" TEXT NOT NULL,
			"role" TEXT NOT NULL DEFAULT 'member',
			"joined_at" TEXT NOT NULL,
			PRIMARY KEY ("group_id", "user_id")
		)`);

		ensureTable(`CREATE TABLE IF NOT EXISTS "image_hash_blocklist" (
			"hash" TEXT PRIMARY KEY,
			"reason" TEXT,
			"uploader_id" TEXT,
			"uploader_username" TEXT,
			"created_at" TEXT NOT NULL
		)`);
	} catch (error) {
		console.error("Failed to repair database schema", { error });
	}
}

export function runMigrationsIfPresent() {
	if (!existsSync(migrationsFolder)) {
		repairDatabaseSchema();
		return false;
	}

	migrate(db, { migrationsFolder });
	repairDatabaseSchema();
	return true;
}

export function closeDatabase() {
	sqlite.close();
}
