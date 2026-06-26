import { eq } from "drizzle-orm";
import {
	ADMIN_USERNAMES,
	ADMIN_USERNAMES_PANEL,
	IMMUNE_USERNAMES,
	SUPERADMIN,
} from "../config/constants";
import { db } from "../db/client";
import {
	channelMembers,
	cloudSaves,
	messages,
	sessions,
	users,
} from "../db/schema";
import type { AuthenticatedUser, UserRow } from "../types/models";

export function isAdminUser(username: string | null | undefined): boolean {
	return (
		Boolean(username) && ADMIN_USERNAMES.has(String(username).toLowerCase())
	);
}

export function isAdminPanelUser(username: string | null | undefined): boolean {
	return (
		Boolean(username) &&
		ADMIN_USERNAMES_PANEL.has(String(username).toLowerCase())
	);
}

export async function resolveAdminTarget(
	userId: string,
	auth: AuthenticatedUser,
): Promise<{ target: UserRow | null; error?: string }> {
	const targetRows = await db
		.select()
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (targetRows.length === 0) {
		return { target: null, error: "User not found" };
	}

	const target = targetRows[0];
	if (
		IMMUNE_USERNAMES.has(target.username) &&
		!SUPERADMIN.has(auth.user.username)
	) {
		return { target: null, error: "This user cannot be modified" };
	}

	return { target };
}

export async function getActiveChatMute(userId: string): Promise<string | null> {
	const rows = await db
		.select({
			chatMutedUntil: users.chatMutedUntil,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	const row = rows[0];
	if (!row?.chatMutedUntil) {
		return null;
	}

	const mutedUntilTime = Date.parse(row.chatMutedUntil);
	if (Number.isNaN(mutedUntilTime) || mutedUntilTime <= Date.now()) {
		await db
			.update(users)
			.set({ chatMutedUntil: null })
			.where(eq(users.id, userId));
		return null;
	}

	return row.chatMutedUntil;
}

export async function terminateUser(userId: string) {
	await db.delete(sessions).where(eq(sessions.userId, userId));
	await db.delete(messages).where(eq(messages.fromUserId, userId));
	await db.delete(cloudSaves).where(eq(cloudSaves.userId, userId));
	await db.delete(channelMembers).where(eq(channelMembers.userId, userId));
	await db.delete(users).where(eq(users.id, userId));
}
