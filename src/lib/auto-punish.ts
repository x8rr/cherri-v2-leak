import { randomUUID } from "node:crypto";
import { and, count, desc, eq, or } from "drizzle-orm";
import { AUTO_PUNISHMENT_THRESHOLDS } from "../config/constants";
import { db } from "../db/client";
import { auditLogs, infractions, ipBans, users } from "../db/schema";
import { sendModerationWarning } from "../server/chat-socket";

function formatDuration(minutes: number) {
	if (minutes >= 1440) return `${minutes / 60}h`;
	return `${minutes}m`;
}

export type AutoPunishResult =
	| { fired: false }
	| { fired: true; action: "mute" | "ban"; label: string };

export async function checkAutoPunishments(
	userId: string,
	username: string,
): Promise<AutoPunishResult> {
	const [row] = await db
		.select({ total: count() })
		.from(infractions)
		.where(and(eq(infractions.userId, userId), eq(infractions.type, "warn")));

	const warnCount = row?.total ?? 0;
	const threshold = AUTO_PUNISHMENT_THRESHOLDS.find(
		(t) => t.warnCount === warnCount,
	);
	if (!threshold) return { fired: false };

	const now = new Date().toISOString();

	if (threshold.action === "mute") {
		const minutes = threshold.minutes!;
		const mutedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
		await db
			.update(users)
			.set({ chatMutedUntil: mutedUntil, updatedAt: now })
			.where(eq(users.id, userId));

		await db.insert(infractions).values({
			id: randomUUID(),
			userId,
			username,
			type: "auto_mute",
			reason: `Auto-muted after ${warnCount} warnings (${formatDuration(minutes)})`,
			issuedBy: "system",
			createdAt: now,
		});

		sendModerationWarning(
			userId,
			`You have been automatically muted for ${formatDuration(minutes)} after receiving ${warnCount} warnings.`,
			"System",
		);

		return { fired: true, action: "mute", label: `${formatDuration(minutes)} mute` };
	}

	if (threshold.action === "ban") {
		const loginRows = await db
			.select({ ip: auditLogs.ip })
			.from(auditLogs)
			.where(
				and(
					eq(auditLogs.userId, userId),
					or(
						eq(auditLogs.action, "auth.login"),
						eq(auditLogs.action, "auth.signup"),
					),
				),
			)
			.orderBy(desc(auditLogs.createdAt))
			.limit(1);

		const lastIp = loginRows[0]?.ip ?? null;
		if (lastIp) {
			const existing = await db
				.select()
				.from(ipBans)
				.where(eq(ipBans.ip, lastIp))
				.limit(1);
			if (existing.length === 0) {
				await db.insert(ipBans).values({
					id: randomUUID(),
					ip: lastIp,
					reason: `Auto-banned after ${warnCount} warnings`,
					expiresAt: null,
					bannedBy: "system",
					createdAt: now,
				});
			}
		}

		await db.insert(infractions).values({
			id: randomUUID(),
			userId,
			username,
			type: "auto_ban",
			reason: `Auto-banned after ${warnCount} warnings`,
			issuedBy: "system",
			createdAt: now,
		});

		sendModerationWarning(
			userId,
			`You have been automatically banned after receiving ${warnCount} warnings.`,
			"System",
		);

		return { fired: true, action: "ban", label: "permanent ban" };
	}

	return { fired: false };
}
