import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import {
	USERNAME_REGEX,
	BADGE_CONFIG,
	SHIELD_USERS,
} from "../config/constants";
import { db } from "../db/client";
import { infractions, messages, users } from "../db/schema";
import { json } from "../lib/http/response";
import { stripHtml } from "../lib/parsing";
import { toPublicUser } from "../lib/serializers";
import type { RouteDefinition } from "../server/router";

export const userRoutes: RouteDefinition[] = [
	{
		method: "GET",
		path: "/api/users/by-username/:username",
		async handler(ctx) {
			const username = stripHtml(ctx.params.username).toLowerCase();
			if (!USERNAME_REGEX.test(username)) {
				return json({ error: "Invalid username" }, { status: 400 });
			}

			const rows = await db
				.select()
				.from(users)
				.where(eq(users.username, username))
				.limit(1);

			if (rows.length === 0) {
				return json({ error: "User not found" }, { status: 404 });
			}

			return json({ user: toPublicUser(rows[0]) });
		},
	},
	{
		method: "GET",
		path: "/api/users/me/standing",
		async handler(ctx) {
			const auth = await ctx.auth();
			if (!auth) {
				return json({ error: "Authentication required" }, { status: 401 });
			}

			const uid = auth.user.id;

			const [infractionRows, [totalRow], [roomRow], [dmRow]] = await Promise.all([
				db
					.select({
						id: infractions.id,
						type: infractions.type,
						reason: infractions.reason,
						createdAt: infractions.createdAt,
					})
					.from(infractions)
					.where(eq(infractions.userId, uid))
					.orderBy(desc(infractions.createdAt)),
				db
					.select({ value: count(messages.id) })
					.from(messages)
					.where(eq(messages.fromUserId, uid)),
				db
					.select({ value: count(messages.id) })
					.from(messages)
					.where(and(eq(messages.fromUserId, uid), isNotNull(messages.room))),
				db
					.select({ value: count(messages.id) })
					.from(messages)
					.where(and(eq(messages.fromUserId, uid), isNotNull(messages.toUserId))),
			]);

			return json({
				infractions: infractionRows,
				chatMutedUntil: auth.user.chatMutedUntil ?? null,
				stats: {
					totalMessages: totalRow?.value ?? 0,
					roomMessages: roomRow?.value ?? 0,
					dmMessages: dmRow?.value ?? 0,
					memberSince: auth.user.createdAt,
				},
			});
		},
	},
	{
		method: "GET",
		path: "/api/badges",
		async handler() {
			return json({
				badges: BADGE_CONFIG,
				shieldUsers: SHIELD_USERS,
			});
		},
	},
];
