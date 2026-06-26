import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import {
	ADMIN_USERNAMES,
	OWNER_USERNAMES,
	RATE_LIMIT_WINDOWS,
	ROOM_NAME_REGEX,
} from "../config/constants";
import { db } from "../db/client";
import { channelMembers, channels, messages } from "../db/schema";
import { json } from "../lib/http/response";
import { isPlainObject, stripHtml } from "../lib/parsing";
import { rejectIfCrossOrigin } from "../lib/security";
import type { RequestContext } from "../server/context";
import type { RouteDefinition } from "../server/router";
import { isAdminUser } from "../lib/admin";

async function requireAuth(ctx: RequestContext) {
	const auth = await ctx.auth();
	if (!auth) {
		return {
			auth: null,
			response: json({ error: "Authentication required" }, { status: 401 }),
		};
	}

	return { auth };
}

export const channelRoutes: RouteDefinition[] = [
	{
		method: "GET",
		path: "/api/channels",
		async handler(ctx) {
			const auth = await ctx.auth();

			const publicChannels = await db
				.select()
				.from(channels)
				.where(eq(channels.private, false));

			if (!auth) {
				return json({
					channels: publicChannels.map((channel) => ({
						name: channel.name,
						private: false,
						locked: channel.locked,
						trusted_only: channel.trustedOnly,
						member: false,
					})),
				});
			}

			const isAdmin = isAdminUser(auth.user.username);

			const memberRows = await db
				.select()
				.from(channelMembers)
				.where(eq(channelMembers.userId, auth.user.id));

			const memberChannelNames = new Set(
				memberRows.map((row) => row.channelName),
			);

			const privateChannels = await db
				.select()
				.from(channels)
				.where(eq(channels.private, true));

			const visiblePrivate = isAdmin
				? privateChannels
				: privateChannels.filter((channel) =>
						memberChannelNames.has(channel.name),
					);

			return json({
				channels: [
					...publicChannels.map((channel) => ({
						name: channel.name,
						private: false,
						locked: channel.locked,
						trusted_only: channel.trustedOnly,
						member: true,
						inviteCode: null,
					})),
					...visiblePrivate.map((channel) => ({
						name: channel.name,
						private: true,
						locked: channel.locked,
						trusted_only: channel.trustedOnly,
						member: isAdmin ? memberChannelNames.has(channel.name) : true,
						inviteCode: channel.inviteCode,
					})),
				],
			});
		},
	},
	{
		method: "POST",
		path: "/api/channels",
		rateLimit: {
			key: "channels:create",
			max: 10,
			windowMs: RATE_LIMIT_WINDOWS.minute,
		},
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const authResult = await requireAuth(ctx);
			if (authResult.response) {
				return authResult.response;
			}
			const auth = authResult.auth!;

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) {
				return json({ error: "Invalid request body" }, { status: 400 });
			}

			const name = stripHtml(body.name)
				.toLowerCase()
				.replace(/[^a-z0-9_-]/g, "-")
				.replace(/^-+|-+$/g, "");

			if (!ROOM_NAME_REGEX.test(name)) {
				return json({ error: "Invalid channel name" }, { status: 400 });
			}

			const isPrivate = Boolean(body.private);

			if (!isPrivate && !isAdminUser(auth.user.username)) {
				return json(
					{ error: "Only moderators can create public channels" },
					{ status: 403 },
				);
			}
			const existing = await db
				.select()
				.from(channels)
				.where(eq(channels.name, name))
				.limit(1);

			if (existing.length > 0) {
				return json({ error: "Channel already exists" }, { status: 409 });
			}

			const now = new Date().toISOString();
			const inviteCode = isPrivate ? randomBytes(6).toString("hex") : null;

			await db.insert(channels).values({
				name,
				private: isPrivate,
				inviteCode,
				createdBy: auth.user.id,
				createdAt: now,
			});

			await db.insert(channelMembers).values({
				channelName: name,
				userId: auth.user.id,
				joinedAt: now,
			});

			return json({
				channel: {
					name,
					private: isPrivate,
					member: true,
					inviteCode,
				},
			});
		},
	},
	{
		method: "POST",
		path: "/api/channels/join",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const authResult = await requireAuth(ctx);
			if (authResult.response) {
				return authResult.response;
			}
			const auth = authResult.auth!;

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) {
				return json({ error: "Invalid request body" }, { status: 400 });
			}

			const code = String(body.code ?? "").trim();
			if (!code) {
				return json({ error: "Invite code is required" }, { status: 400 });
			}

			const channelRows = await db
				.select()
				.from(channels)
				.where(eq(channels.inviteCode, code))
				.limit(1);

			if (channelRows.length === 0) {
				return json({ error: "Invalid invite code" }, { status: 404 });
			}

			const channel = channelRows[0];
			const now = new Date().toISOString();

			await db
				.insert(channelMembers)
				.values({
					channelName: channel.name,
					userId: auth.user.id,
					joinedAt: now,
				})
				.onConflictDoNothing();

			return json({
				channel: {
					name: channel.name,
					private: channel.private,
					member: true,
					inviteCode: channel.inviteCode,
				},
			});
		},
	},
	{
		method: "DELETE",
		path: "/api/channels/:name",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const authResult = await requireAuth(ctx);
			if (authResult.response) {
				return authResult.response;
			}
			const auth = authResult.auth!;

			if (!ADMIN_USERNAMES.has(auth.user.username)) {
				return json({ error: "Not authorized" }, { status: 403 });
			}

			const { name } = ctx.params;
			if (!ROOM_NAME_REGEX.test(name)) {
				return json({ error: "Invalid channel name" }, { status: 400 });
			}

			if (name === "general") {
				return json(
					{ error: "Cannot delete the general channel" },
					{ status: 400 },
				);
			}

			const existing = await db
				.select()
				.from(channels)
				.where(eq(channels.name, name))
				.limit(1);

			if (existing.length === 0) {
				return json({ error: "Channel not found" }, { status: 404 });
			}

			await db.delete(messages).where(eq(messages.room, name));
			await db
				.delete(channelMembers)
				.where(eq(channelMembers.channelName, name));
			await db.delete(channels).where(eq(channels.name, name));

			return json({ ok: true });
		},
	},
	{
		method: "PATCH",
		path: "/api/channels/:name/lock",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const authResult = await requireAuth(ctx);
			if (authResult.response) return authResult.response;
			const auth = authResult.auth!;

			if (!OWNER_USERNAMES.has(auth.user.username)) {
				return json({ error: "Only the owner can lock channels" }, { status: 403 });
			}

			const { name } = ctx.params;
			if (!ROOM_NAME_REGEX.test(name)) {
				return json({ error: "Invalid channel name" }, { status: 400 });
			}

			const body = await ctx.jsonBody();
			const locked = Boolean((body as any)?.locked);

			const result = await db
				.update(channels)
				.set({ locked })
				.where(eq(channels.name, name))
				.returning();

			if (result.length === 0) {
				return json({ error: "Channel not found" }, { status: 404 });
			}

			return json({ ok: true, locked });
		},
	},
];
