import { and, count, eq, or } from "drizzle-orm";
import { db } from "../db/client";
import { friendships, users } from "../db/schema";
import { json } from "../lib/http/response";
import { parseJsonArray } from "../lib/parsing";
import type { RouteDefinition } from "../server/router";

export const profileRoutes: RouteDefinition[] = [
	{
		method: "GET",
		path: "/api/profile/:username",
		async handler(ctx) {
			const { username } = ctx.params;

			const userRow = await db
				.select()
				.from(users)
				.where(eq(users.username, username.toLowerCase()))
				.get();

			if (!userRow) return json({ error: "User not found" }, { status: 404 });

			
			const [{ value: friendCount }] = await db
				.select({ value: count(friendships.id) })
				.from(friendships)
				.where(
					and(
						or(
							eq(friendships.requesterId, userRow.id),
							eq(friendships.recipientId, userRow.id),
						),
						eq(friendships.status, "accepted"),
					),
				);

			
			let friendshipStatus: string | null = null;
			const auth = await ctx.auth();
			if (auth && auth.user.id !== userRow.id) {
				const row = await db
					.select()
					.from(friendships)
					.where(
						or(
							and(
								eq(friendships.requesterId, auth.user.id),
								eq(friendships.recipientId, userRow.id),
							),
							and(
								eq(friendships.requesterId, userRow.id),
								eq(friendships.recipientId, auth.user.id),
							),
						),
					)
					.get();

				if (!row) friendshipStatus = "none";
				else if (row.status === "accepted") friendshipStatus = "friends";
				else friendshipStatus = row.requesterId === auth.user.id ? "pending_sent" : "pending_received";
			} else if (auth?.user.id === userRow.id) {
				friendshipStatus = "self";
			}

			return json({
				profile: {
					id: userRow.id,
					username: userRow.username,
					display: userRow.display,
					pfp: userRow.pfp || "/assets/img/fav.png",
					bio: userRow.bio || null,
					bannerUrl: userRow.bannerUrl || null,
					badges: parseJsonArray<string>(userRow.badges, ["user"]),
					trusted: userRow.trustedUser ?? false,
					createdAt: userRow.createdAt,
					friendCount: Number(friendCount),
					friendshipStatus,
				},
			});
		},
	},
];
