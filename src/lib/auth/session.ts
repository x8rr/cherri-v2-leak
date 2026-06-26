import { createHash, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from "../../config/constants";
import { db } from "../../db/client";
import { sessions, users } from "../../db/schema";
import type { AuthenticatedUser } from "../../types/models";
import { parseCookies } from "../http/cookies";
import { toPublicUser } from "../serializers";

export function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken(): string {
	return `${randomUUID()}-${randomBytes(16).toString("hex")}`;
}

export async function getAuthenticatedUser(
	request: Request,
): Promise<AuthenticatedUser | null> {
	const cookies = parseCookies(request.headers.get("cookie"));
	const rawToken = cookies[SESSION_COOKIE_NAME];
	if (!rawToken) {
		return null;
	}

	const sessionHash = hashToken(rawToken);
	const sessionRows = await db
		.select()
		.from(sessions)
		.where(eq(sessions.tokenHash, sessionHash))
		.limit(1);

	if (sessionRows.length === 0) {
		return null;
	}

	const sessionRow = sessionRows[0];
	if (new Date(sessionRow.expiresAt).getTime() <= Date.now()) {
		await db.delete(sessions).where(eq(sessions.tokenHash, sessionHash));
		return null;
	}

	const userRows = await db
		.select()
		.from(users)
		.where(eq(users.id, sessionRow.userId))
		.limit(1);

	if (userRows.length === 0) {
		return null;
	}

	return {
		sessionToken: rawToken,
		sessionHash,
		session: sessionRow,
		userRow: userRows[0],
		user: toPublicUser(userRows[0]),
	};
}

export function createSessionExpiryTimestamp(): string {
	return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}
