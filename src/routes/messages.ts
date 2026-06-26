import { and, desc, eq, isNull, or, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
	MAX_CHAT_MESSAGE_LENGTH,
	OWNER_USERNAMES,
	RATE_LIMIT_WINDOWS,
	ROOM_NAME_REGEX,
} from "../config/constants";
import { tryAutoGrantTrust } from "../lib/trusted";
import { db } from "../db/client";
import { channelMembers, channels, messages, moderationTickets, users } from "../db/schema";

import { getActiveChatMute, isAdminUser } from "../lib/admin";
import { logAuditEvent } from "../lib/audit";
import { json } from "../lib/http/response";
import {
	containsOnlyAllowedGifTags,
	isPlainObject,
	stripHtml,
} from "../lib/parsing";
import { userBlocks } from "../db/schema";
import {
	toMessageResponse,
	toMessageResponseWithUser,
	toPublicUser,
} from "../lib/serializers";
import { rejectIfCrossOrigin } from "../lib/security";
import type { RequestContext } from "../server/context";
import type { RouteDefinition } from "../server/router";
import {
	loadMessageById,
	publishMessageCreated,
	publishMessageDeleted,
	publishMessageUpdated,
} from "../server/chat-socket";

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

async function ensureChannelAccess(ctx: RequestContext, room: string) {
	const channelRows = await db
		.select()
		.from(channels)
		.where(eq(channels.name, room))
		.limit(1);

	if (channelRows.length > 0 && channelRows[0].private) {
		const authResult = await requireAuth(ctx);
		if (authResult.response) {
			return authResult;
		}

		const memberRows = await db
			.select()
			.from(channelMembers)
			.where(
				and(
					eq(channelMembers.channelName, room),
					eq(channelMembers.userId, authResult.auth!.user.id),
				),
			)
			.limit(1);

		if (memberRows.length === 0 && !isAdminUser(authResult.auth!.user.username)) {
			return {
				auth: authResult.auth,
				response: json(
					{ error: "Not a member of this channel" },
					{ status: 403 },
				),
			};
		}

		return authResult;
	}

	return {
		auth: null as Awaited<ReturnType<RequestContext["auth"]>>,
		response: null as Response | null,
	};
}

export const messageRoutes: RouteDefinition[] = [
	{
		method: "GET",
		path: "/api/messages/:room",
		async handler(ctx) {
			const { room } = ctx.params;
			if (!ROOM_NAME_REGEX.test(room)) {
				return json({ error: "Invalid room name" }, { status: 400 });
			}

			const access = await ensureChannelAccess(ctx, room);
			if (access.response) {
				return access.response;
			}

			const url = new URL(ctx.request.url);
			const limit = Math.min(
				Number.parseInt(url.searchParams.get("limit") || "50", 10),
				100,
			);
			const before = url.searchParams.get("before")
				? Number.parseInt(url.searchParams.get("before")!, 10)
				: null;

			const conditions = [
				eq(messages.room, room),
				isNull(messages.toUserId),
			];
			if (before && !Number.isNaN(before)) {
				conditions.push(lt(messages.id, before));
			}

			const rows = await db
				.select({
					message: messages,
					sender: users,
				})
				.from(messages)
				.innerJoin(users, eq(users.id, messages.fromUserId))
				.where(and(...conditions))
				.orderBy(desc(messages.id))
				.limit(limit);

			const orderedRows = rows.reverse();

			return json({
				messages: orderedRows.map(({ message, sender }) =>
					toMessageResponseWithUser(message, sender),
				),
			});
		},
	},
	{
		method: "GET",
		path: "/api/dm/inbox",
		async handler(ctx) {
			const authResult = await requireAuth(ctx);
			if (authResult.response) {
				return authResult.response;
			}
			const auth = authResult.auth!;
			const myId = auth.user.id;

			const allDmMessages = await db
				.select({
					message: messages,
					sender: users,
				})
				.from(messages)
				.innerJoin(users, eq(users.id, messages.fromUserId))
				.where(
					and(
						isNull(messages.room),
						or(
							eq(messages.fromUserId, myId),
							eq(messages.toUserId, myId),
						),
					),
				)
				.orderBy(desc(messages.id));

			const threadMap = new Map<string, (typeof allDmMessages)[number]>();
			for (const entry of allDmMessages) {
				const { message } = entry;
				const otherId =
					message.fromUserId === myId
						? message.toUserId
						: message.fromUserId;
				if (!otherId) {
					continue;
				}

				if (!threadMap.has(otherId)) {
					threadMap.set(otherId, entry);
				}
			}

			if (threadMap.size === 0) {
				return json({ threads: [] });
			}

			const otherIds = Array.from(threadMap.keys());
			const otherUsers = await db
				.select()
				.from(users)
				.where(or(...otherIds.map((id) => eq(users.id, id))));

			const userMap = new Map(otherUsers.map((user) => [user.id, user]));
			const threads = otherIds
				.map((otherId) => {
					const userRow = userMap.get(otherId);
					if (!userRow) {
						return null;
					}

					const lastMessage = threadMap.get(otherId);
					if (!lastMessage) {
						return null;
					}

					return {
						user: toPublicUser(userRow),
						last_message: toMessageResponseWithUser(
							lastMessage.message,
							lastMessage.sender,
						),
					};
				})
				.filter(Boolean);

			return json({ threads });
		},
	},
	{
		method: "POST",
		path: "/api/messages/:room",
		rateLimit: {
			key: "messages:room-send",
			max: 45,
			windowMs: RATE_LIMIT_WINDOWS.minute,
		},
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const { room } = ctx.params;
			if (!ROOM_NAME_REGEX.test(room)) {
				return json({ error: "Invalid room name" }, { status: 400 });
			}

			const authResult = await requireAuth(ctx);
			if (authResult.response) {
				return authResult.response;
			}
			const auth = authResult.auth!;

			const channelAccess = await ensureChannelAccess(ctx, room);
			if (channelAccess.response) {
				return channelAccess.response;
			}

			const activeMute = await getActiveChatMute(auth.user.id);
			if (activeMute) {
				return json(
					{
						error: `You are muted from chat until ${activeMute}`,
					},
					{ status: 403 },
				);
			}

			
			const channelRow = await db
				.select({ locked: channels.locked, trustedOnly: channels.trustedOnly })
				.from(channels)
				.where(eq(channels.name, room))
				.limit(1);
			if (channelRow.length > 0 && channelRow[0].locked && !OWNER_USERNAMES.has(auth.user.username)) {
				return json(
					{ error: "This channel is locked. Only the owner can post here." },
					{ status: 403 },
				);
			}

			
			if (channelRow.length > 0 && channelRow[0].trustedOnly) {
				const userRow = await db
					.select({ trustedUser: users.trustedUser })
					.from(users)
					.where(eq(users.id, auth.user.id))
					.get();
				if (!userRow?.trustedUser) {
					return json(
						{ error: "Only trusted users can post in this channel." },
						{ status: 403 },
					);
				}
			}

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) {
				return json({ error: "Invalid request body" }, { status: 400 });
			}

			
			const messageType = body.message_type === "image" || body.message_type === "voice"
				? body.message_type
				: "text";

			let attachmentUrl: string | null = null;
			if (messageType !== "text") {
				const userRow = await db
					.select({ trustedUser: users.trustedUser })
					.from(users)
					.where(eq(users.id, auth.user.id))
					.get();
				if (!userRow?.trustedUser) {
					return json(
						{ error: "Only trusted users can send media messages." },
						{ status: 403 },
					);
				}
				const rawUrl = String(body.attachment_url ?? "").trim();
				if (!rawUrl.startsWith("/uploads/media/")) {
					return json({ error: "Invalid attachment URL." }, { status: 400 });
				}
				attachmentUrl = rawUrl;
			}

			const rawContent = stripHtml(body.content ?? "");

			// @everyone is owner-only
			if (/@everyone\b/i.test(rawContent) && !OWNER_USERNAMES.has(auth.user.username)) {
				return json(
					{ error: "Only the owner can use @everyone." },
					{ status: 403 },
				);
			}

			const content = rawContent;
			if (!content && messageType === "text") {
				return json({ error: "Message cannot be empty" }, { status: 400 });
			}

			if (messageType === "text") {
				if (!containsOnlyAllowedGifTags(content)) {
					return json(
						{ error: "GIF embeds must use allowed Giphy GIF URLs" },
						{ status: 400 },
					);
				}

				if (content.length > MAX_CHAT_MESSAGE_LENGTH) {
					return json(
						{
							error: `Message cannot exceed ${MAX_CHAT_MESSAGE_LENGTH} characters`,
						},
						{ status: 400 },
					);
				}
			}

			const replyToId = Number.isInteger(Number(body.reply_to_id))
				? Number(body.reply_to_id)
				: null;

			const rows = await db
				.insert(messages)
				.values({
					fromUserId: auth.user.id,
					username: auth.user.username,
					avatarUrl: auth.user.pfp,
					content,
					badges: JSON.stringify(auth.user.badges || []),
					sentAt: new Date().toISOString(),
					room,
					toUserId: null,
					replyToId,
					messageType,
					attachmentUrl,
				})
				.returning();

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "message.send.room",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: {
					messageId: rows[0]?.id ?? null,
					room,
					replyToId,
					messageType,
					contentLength: content.length,
				},
			});

			const message =
				rows.length > 0
					? toMessageResponseWithUser(rows[0], auth.userRow)
					: null;
			if (message) {
				publishMessageCreated(message);
			}

			
			tryAutoGrantTrust(auth.user.id).catch(() => {});

			return json({ message });
		},
	},
	{
		method: "POST",
		path: "/api/moderation/tickets",
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

			const messageIds = Array.isArray(body.message_ids)
				? body.message_ids
						.map((id) => Number(id))
						.filter((id) => Number.isInteger(id) && id > 0)
				: [];
			if (messageIds.length === 0) {
				return json(
					{ error: "At least one message must be selected" },
					{ status: 400 },
				);
			}

			const scope = body.scope === "dm" ? "dm" : "room";
			const room = scope === "room" ? String(body.room || "general") : null;
			const targetUserId = String(body.target_user_id || "");
			if (!targetUserId) {
				return json(
					{ error: "Reported user id is required" },
					{ status: 400 },
				);
			}

			const rows = await db
				.select()
				.from(messages)
				.where(or(...messageIds.map((id) => eq(messages.id, id))))
				.orderBy(messages.id);

			if (rows.length !== messageIds.length) {
				return json(
					{ error: "Selected messages are invalid" },
					{ status: 400 },
				);
			}

			const offenderIds = new Set(
				rows
					.filter((row) => row.fromUserId !== auth.user.id)
					.map((row) => row.fromUserId),
			);
			if (offenderIds.size !== 1 || offenderIds.has(auth.user.id)) {
				return json(
					{
						error: "Selected messages must belong to a single other user",
					},
					{ status: 400 },
				);
			}

			if (scope === "room") {
				if (!room || !ROOM_NAME_REGEX.test(room)) {
					return json({ error: "Invalid room name" }, { status: 400 });
				}
				if (
					rows.some((row) => row.room !== room || row.toUserId !== null)
				) {
					return json(
						{
							error: "Selected room messages must belong to the current room",
						},
						{ status: 400 },
					);
				}
			} else {
				if (rows.some((row) => row.room !== null)) {
					return json(
						{ error: "Selected DM messages must be direct messages" },
						{ status: 400 },
					);
				}
				if (
					rows.some(
						(row) =>
							row.fromUserId !== auth.user.id &&
							row.toUserId !== targetUserId &&
							row.fromUserId !== targetUserId,
					)
				) {
					return json(
						{ error: "Selected DMs must belong to the reported DM user" },
						{ status: 400 },
					);
				}
			}

			const reportedUsername =
				rows.find((row) => row.fromUserId !== auth.user.id)?.username ?? "";
			const notes = stripHtml(String(body.notes || "")).trim() || null;

			await db.insert(moderationTickets).values({
				id: randomUUID(),
				createdBy: auth.user.id,
				createdByUsername: auth.user.username,
				reportedUserId: targetUserId,
				reportedUsername,
				scope,
				room,
				messageIds: JSON.stringify(messageIds),
				notes,
				status: "open",
				createdAt: new Date().toISOString(),
			});

			return json({ ok: true });
		},
	},
	{
		method: "GET",
		path: "/api/dm/:recipientId",
		async handler(ctx) {
			const authResult = await requireAuth(ctx);
			if (authResult.response) {
				return authResult.response;
			}
			const auth = authResult.auth!;

			const { recipientId } = ctx.params;
			if (!recipientId || recipientId === auth.user.id) {
				return json({ error: "Invalid recipient" }, { status: 400 });
			}

			const recipientRows = await db
				.select()
				.from(users)
				.where(eq(users.id, recipientId))
				.limit(1);

			if (recipientRows.length === 0) {
				return json({ error: "Recipient not found" }, { status: 404 });
			}

			const block = await db
				.select()
				.from(userBlocks)
				.where(
					or(
						and(
							eq(userBlocks.blockerId, auth.user.id),
							eq(userBlocks.blockedId, recipientId),
						),
						and(
							eq(userBlocks.blockerId, recipientId),
							eq(userBlocks.blockedId, auth.user.id),
						),
					),
				)
				.limit(1);

			if (block.length > 0) {
				return json({ error: "Cannot message this user" }, { status: 403 });
			}

			const url = new URL(ctx.request.url);
			const limit = Math.min(
				Number.parseInt(url.searchParams.get("limit") || "50", 10),
				100,
			);
			const before = url.searchParams.get("before")
				? Number.parseInt(url.searchParams.get("before")!, 10)
				: null;

			const targetDmConditions = or(
				and(
					eq(messages.fromUserId, auth.user.id),
					eq(messages.toUserId, recipientId),
				),
				and(
					eq(messages.fromUserId, recipientId),
					eq(messages.toUserId, auth.user.id),
				),
			);

			const conditions = [isNull(messages.room), targetDmConditions];
			if (before && !Number.isNaN(before)) {
				conditions.push(lt(messages.id, before));
			}

			const rows = await db
				.select({
					message: messages,
					sender: users,
				})
				.from(messages)
				.innerJoin(users, eq(users.id, messages.fromUserId))
				.where(and(...conditions))
				.orderBy(desc(messages.id))
				.limit(limit);

			const orderedRows = rows.reverse();

			return json({
				recipient: toPublicUser(recipientRows[0]),
				messages: orderedRows.map(({ message, sender }) =>
					toMessageResponseWithUser(message, sender),
				),
			});
		},
	},
	{
		method: "POST",
		path: "/api/dm/:recipientId",
		rateLimit: {
			key: "messages:dm-send",
			max: 45,
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

			const { recipientId } = ctx.params;
			if (!recipientId || recipientId === auth.user.id) {
				return json({ error: "Invalid recipient" }, { status: 400 });
			}

			const recipientRows = await db
				.select()
				.from(users)
				.where(eq(users.id, recipientId))
				.limit(1);

			if (recipientRows.length === 0) {
				return json({ error: "Recipient not found" }, { status: 404 });
			}
			
			const block = await db
				.select()
				.from(userBlocks)
				.where(
					or(
						and(
							eq(userBlocks.blockerId, auth.user.id),
							eq(userBlocks.blockedId, recipientId),
						),
						and(
							eq(userBlocks.blockerId, recipientId),
							eq(userBlocks.blockedId, auth.user.id),
						),
					),
				)
				.limit(1);

			if (block.length > 0) {
				return json({ error: "Cannot message this user" }, { status: 403 });
			}

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) {
				return json({ error: "Invalid request body" }, { status: 400 });
			}

			const messageType = body.message_type === "image" || body.message_type === "voice"
				? body.message_type
				: "text";

			let attachmentUrl: string | null = null;
			if (messageType !== "text") {
				const userRow = db
					.select({ trustedUser: users.trustedUser })
					.from(users)
					.where(eq(users.id, auth.user.id))
					.get();
				if (!userRow?.trustedUser) {
					return json(
						{ error: "Only trusted users can send media messages." },
						{ status: 403 },
					);
				}
				const rawUrl = String(body.attachment_url ?? "").trim();
				if (!rawUrl.startsWith("/uploads/media/")) {
					return json({ error: "Invalid attachment URL." }, { status: 400 });
				}
				attachmentUrl = rawUrl;
			}

			const content = stripHtml(body.content ?? "");
			if (!content && messageType === "text") {
				return json({ error: "Message cannot be empty" }, { status: 400 });
			}

			if (messageType === "text") {
				if (!containsOnlyAllowedGifTags(content)) {
					return json(
						{ error: "GIF embeds must use allowed Giphy GIF URLs" },
						{ status: 400 },
					);
				}

				if (content.length > MAX_CHAT_MESSAGE_LENGTH) {
					return json(
						{
							error: `Message cannot exceed ${MAX_CHAT_MESSAGE_LENGTH} characters`,
						},
						{ status: 400 },
					);
				}
			}

			const replyToId = Number.isInteger(Number(body.reply_to_id))
				? Number(body.reply_to_id)
				: null;

			const rows = await db
				.insert(messages)
				.values({
					fromUserId: auth.user.id,
					username: auth.user.username,
					avatarUrl: auth.user.pfp,
					content,
					badges: JSON.stringify(auth.user.badges || []),
					sentAt: new Date().toISOString(),
					room: null,
					toUserId: recipientId,
					replyToId,
					messageType,
					attachmentUrl,
				})
				.returning();

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "message.send.dm",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: {
					messageId: rows[0]?.id ?? null,
					recipientId,
					replyToId,
					contentLength: content.length,
				},
			});

			const message =
				rows.length > 0
					? toMessageResponseWithUser(rows[0], auth.userRow)
					: null;
			if (message) {
				publishMessageCreated(message);
			}

			return json({ message });
		},
	},
	{
		method: "PUT",
		path: "/api/messages/:id",
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

			const id = Number.parseInt(ctx.params.id, 10);
			if (!Number.isInteger(id) || id < 1) {
				return json({ error: "Invalid message id" }, { status: 400 });
			}

			const content = stripHtml(body.content);
			if (!content) {
				return json({ error: "Message cannot be empty" }, { status: 400 });
			}

			if (!containsOnlyAllowedGifTags(content)) {
				return json(
					{ error: "GIF embeds must use allowed Giphy GIF URLs" },
					{ status: 400 },
				);
			}

			if (content.length > MAX_CHAT_MESSAGE_LENGTH) {
				return json(
					{
						error: `Message cannot exceed ${MAX_CHAT_MESSAGE_LENGTH} characters`,
					},
					{ status: 400 },
				);
			}

			const rows = await db
				.select()
				.from(messages)
				.where(eq(messages.id, id))
				.limit(1);

			if (rows.length === 0) {
				return json({ error: "Message not found" }, { status: 404 });
			}

			if (rows[0].fromUserId !== auth.user.id) {
				return json(
					{ error: "You can only edit your own messages" },
					{ status: 403 },
				);
			}

			await db.update(messages).set({ content }).where(eq(messages.id, id));
			const updatedMessage = await loadMessageById(id);
			if (updatedMessage) {
				publishMessageUpdated(updatedMessage);
			}
			return json({ ok: true });
		},
	},
	{
		method: "DELETE",
		path: "/api/messages/:id",
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

			const id = Number.parseInt(ctx.params.id, 10);
			if (!Number.isInteger(id) || id < 1) {
				return json({ error: "Invalid message id" }, { status: 400 });
			}

			const rows = await db
				.select()
				.from(messages)
				.where(eq(messages.id, id))
				.limit(1);

			if (rows.length === 0) {
				return json({ error: "Message not found" }, { status: 404 });
			}

			if (
				!isAdminUser(auth.user.username) &&
				rows[0].fromUserId !== auth.user.id
			) {
				return json(
					{ error: "You can only delete your own messages" },
					{ status: 403 },
				);
			}

			const deletedMessage = toMessageResponse(rows[0]);
			await db.delete(messages).where(eq(messages.id, id));
			publishMessageDeleted(deletedMessage);
			return json({ ok: true });
		},
	},
];
