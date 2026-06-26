import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { db } from "../db/client";
import { friendships, users } from "../db/schema";
import { json } from "../lib/http/response";
import { rejectIfCrossOrigin } from "../lib/security";
import { toPublicUser } from "../lib/serializers";
import {
	sendFriendAccepted,
	sendFriendRequest,
	sendGameInvite,
} from "../server/chat-socket";
import type { RequestContext } from "../server/context";
import type { RouteDefinition } from "../server/router";

async function requireAuth(ctx: RequestContext) {
	const auth = await ctx.auth();
	if (!auth) {
		return { auth: null, response: json({ error: "Authentication required" }, { status: 401 }) };
	}
	return { auth };
}

function friendshipWhere(userA: string, userB: string) {
	return or(
		and(eq(friendships.requesterId, userA), eq(friendships.recipientId, userB)),
		and(eq(friendships.requesterId, userB), eq(friendships.recipientId, userA)),
	);
}

export const friendRoutes: RouteDefinition[] = [
	
	{
		method: "GET",
		path: "/api/friends",
		async handler(ctx) {
			const { auth, response } = await requireAuth(ctx);
			if (response) return response;
			const myId = auth!.user.id;

			const rows = await db
				.select()
				.from(friendships)
				.where(
					and(
						or(eq(friendships.requesterId, myId), eq(friendships.recipientId, myId)),
						eq(friendships.status, "accepted"),
					),
				);

			const friendIds = rows.map((r) =>
				r.requesterId === myId ? r.recipientId : r.requesterId,
			);

			if (friendIds.length === 0) return json({ friends: [] });

			const friendUsers = await db
				.select()
				.from(users)
				.where(or(...friendIds.map((id) => eq(users.id, id))));

			return json({ friends: friendUsers.map(toPublicUser) });
		},
	},

	
	{
		method: "GET",
		path: "/api/friends/requests",
		async handler(ctx) {
			const { auth, response } = await requireAuth(ctx);
			if (response) return response;
			const myId = auth!.user.id;

			const rows = await db
				.select()
				.from(friendships)
				.where(
					and(eq(friendships.recipientId, myId), eq(friendships.status, "pending")),
				);

			if (rows.length === 0) return json({ requests: [] });

			const requesterIds = rows.map((r) => r.requesterId);
			const requesterUsers = await db
				.select()
				.from(users)
				.where(or(...requesterIds.map((id) => eq(users.id, id))));

			const userMap = new Map(requesterUsers.map((u) => [u.id, u]));

			return json({
				requests: rows.map((r) => ({
					id: r.id,
					user: userMap.get(r.requesterId) ? toPublicUser(userMap.get(r.requesterId)!) : null,
					createdAt: r.createdAt,
				})).filter((r) => r.user !== null),
			});
		},
	},

	
	{
		method: "GET",
		path: "/api/friends/status/:userId",
		async handler(ctx) {
			const { auth, response } = await requireAuth(ctx);
			if (response) return response;
			const myId = auth!.user.id;
			const { userId } = ctx.params;

			if (userId === myId) return json({ status: "self" });

			const row = await db
				.select()
				.from(friendships)
				.where(friendshipWhere(myId, userId))
				.get();

			if (!row) return json({ status: "none" });
			if (row.status === "accepted") return json({ status: "friends" });
			
			return json({
				status: row.requesterId === myId ? "pending_sent" : "pending_received",
			});
		},
	},

	
	{
		method: "POST",
		path: "/api/friends/request/:userId",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const { auth, response } = await requireAuth(ctx);
			if (response) return response;
			const myId = auth!.user.id;
			const { userId } = ctx.params;

			if (userId === myId) return json({ error: "Cannot add yourself" }, { status: 400 });

			const target = await db.select().from(users).where(eq(users.id, userId)).get();
			if (!target) return json({ error: "User not found" }, { status: 404 });

			const existing = await db
				.select()
				.from(friendships)
				.where(friendshipWhere(myId, userId))
				.get();

			if (existing) return json({ error: "Friend request already exists" }, { status: 409 });

			await db.insert(friendships).values({
				id: randomUUID(),
				requesterId: myId,
				recipientId: userId,
				status: "pending",
				createdAt: new Date().toISOString(),
			});

			sendFriendRequest(userId, myId, auth!.user.username, auth!.user.pfp);

			return json({ ok: true });
		},
	},

	
	{
		method: "POST",
		path: "/api/friends/:userId/accept",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const { auth, response } = await requireAuth(ctx);
			if (response) return response;
			const myId = auth!.user.id;
			const { userId } = ctx.params;

			const row = await db
				.select()
				.from(friendships)
				.where(
					and(eq(friendships.requesterId, userId), eq(friendships.recipientId, myId)),
				)
				.get();

			if (!row || row.status !== "pending") {
				return json({ error: "No pending request from this user" }, { status: 404 });
			}

			await db
				.update(friendships)
				.set({ status: "accepted" })
				.where(eq(friendships.id, row.id));

			sendFriendAccepted(userId, myId, auth!.user.username, auth!.user.pfp);

			return json({ ok: true });
		},
	},

	
	{
		method: "DELETE",
		path: "/api/friends/request/:userId",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const { auth, response } = await requireAuth(ctx);
			if (response) return response;
			const myId = auth!.user.id;
			const { userId } = ctx.params;

			await db
				.delete(friendships)
				.where(
					and(friendshipWhere(myId, userId), eq(friendships.status, "pending")),
				);

			return json({ ok: true });
		},
	},

	
	{
		method: "DELETE",
		path: "/api/friends/:userId",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const { auth, response } = await requireAuth(ctx);
			if (response) return response;
			const myId = auth!.user.id;
			const { userId } = ctx.params;

			await db
				.delete(friendships)
				.where(friendshipWhere(myId, userId));

			return json({ ok: true });
		},
	},

	
	{
		method: "POST",
		path: "/api/friends/invite/:userId",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const { auth, response } = await requireAuth(ctx);
			if (response) return response;
			const myId = auth!.user.id;
			const { userId } = ctx.params;

			
			const row = await db
				.select()
				.from(friendships)
				.where(and(friendshipWhere(myId, userId), eq(friendships.status, "accepted")))
				.get();

			if (!row) return json({ error: "You must be friends to send a game invite" }, { status: 403 });

			const body = await ctx.jsonBody<Record<string, unknown>>();
			const gameName = typeof body?.gameName === "string" ? (body.gameName as string).slice(0, 80).trim() : "";
			const gameUrl = typeof body?.gameUrl === "string" ? (body.gameUrl as string).slice(0, 500).trim() : "";

			if (!gameName || !gameUrl) {
				return json({ error: "gameName and gameUrl are required" }, { status: 400 });
			}

			sendGameInvite(userId, myId, auth!.user.username, auth!.user.pfp, gameName, gameUrl);

			return json({ ok: true });
		},
	},
];
