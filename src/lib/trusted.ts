import { and, count, eq, gte, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { infractions, messages, users } from "../db/schema";

const TRUSTED_MIN_MESSAGES = 1000;
const TRUSTED_MIN_ACCOUNT_AGE_DAYS = 7;
const TRUSTED_INFRACTION_LOOKBACK_DAYS = 30;

export async function checkTrustEligibility(userId: string): Promise<boolean> {
	const userRow = await db
		.select({ createdAt: users.createdAt })
		.from(users)
		.where(eq(users.id, userId))
		.get();

	if (!userRow) return false;

	const accountAgeMs = Date.now() - Date.parse(userRow.createdAt);
	if (accountAgeMs < TRUSTED_MIN_ACCOUNT_AGE_DAYS * 86_400_000) return false;

	const [msgRow] = await db
		.select({ total: count() })
		.from(messages)
		.where(and(eq(messages.fromUserId, userId), isNull(messages.toUserId)));

	if ((msgRow?.total ?? 0) < TRUSTED_MIN_MESSAGES) return false;

	const cutoff = new Date(
		Date.now() - TRUSTED_INFRACTION_LOOKBACK_DAYS * 86_400_000,
	).toISOString();

	const [infraRow] = await db
		.select({ total: count() })
		.from(infractions)
		.where(
			and(eq(infractions.userId, userId), gte(infractions.createdAt, cutoff)),
		);

	if ((infraRow?.total ?? 0) > 0) return false;

	return true;
}

export async function tryAutoGrantTrust(userId: string): Promise<boolean> {
	const userRow = await db
		.select({
			trustedUser: users.trustedUser,
			trustedRevokedManually: users.trustedRevokedManually,
		})
		.from(users)
		.where(eq(users.id, userId))
		.get();

	if (!userRow) return false;
	if (userRow.trustedUser) return true;
	if (userRow.trustedRevokedManually) return false;

	const eligible = await checkTrustEligibility(userId);
	if (!eligible) return false;

	await db
		.update(users)
		.set({ trustedUser: true, updatedAt: new Date().toISOString() })
		.where(eq(users.id, userId));

	return true;
}

export async function revokeTrustOnInfraction(userId: string): Promise<void> {
	await db
		.update(users)
		.set({ trustedUser: false, updatedAt: new Date().toISOString() })
		.where(and(eq(users.id, userId), eq(users.trustedUser, true)));
}
