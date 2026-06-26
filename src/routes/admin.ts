import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, isNotNull, like, not, or, sql } from "drizzle-orm";
import {
	ADMIN_DEFAULT_CHAT_MUTE_MINUTES,
	SUPERADMIN,
} from "../config/constants";
import { db } from "../db/client";
import {
	auditLogs,
	channels,
	hwBans,
	infractions,
	ipBans,
	messages,
	moderationTickets,
	sessions,
	users,
} from "../db/schema";
import {
	getActiveChatMute,
	isAdminPanelUser,
	resolveAdminTarget,
	terminateUser,
} from "../lib/admin";
import { logAuditEvent } from "../lib/audit";
import { checkAutoPunishments } from "../lib/auto-punish";
import { revokeTrustOnInfraction } from "../lib/trusted";
import { json } from "../lib/http/response";
import { normalizeIpCandidate } from "../lib/network";
import { isPlainObject, stripHtml } from "../lib/parsing";
import { toPublicUser } from "../lib/serializers";
import { rejectIfCrossOrigin } from "../lib/security";
import { sendModerationWarning } from "../server/chat-socket";
import type { RequestContext } from "../server/context";
import type { RouteDefinition } from "../server/router";

function isLocalhostOrServerIp(ip: string | null): boolean {
	const normalized = String(ip ?? "").trim().toLowerCase();
	return (
		normalized === "127.0.0.1" ||
		normalized === "::1" ||
		normalized === "::ffff:127.0.0.1" ||
		normalized === "0.0.0.0" ||
		normalized === "::"
	);
}

export async function requireAdmin(ctx: RequestContext) {
	const auth = await ctx.auth();
	if (!auth || !isAdminPanelUser(auth.user.username)) {
		return {
			auth: null,
			response: json({ error: "Not authorized" }, { status: 403 }),
		};
	}

	return { auth };
}

export const adminRoutes: RouteDefinition[] = [
	{
		method: "GET",
		path: "/api/admin/users/:userId/ip",
		async handler(ctx) {
			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;
			const { userId } = ctx.params;

			const rows = await db
				.select({ ip: auditLogs.ip, createdAt: auditLogs.createdAt })
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
				.limit(5);

			const isPrivileged = SUPERADMIN.has(auth.user.username);
			return json({
				privileged: isPrivileged,
				ips: rows.map((row) => ({
					ip: isPrivileged
						? row.ip
						: (row.ip ?? "").replace(/\d+/g, "***"),
					at: row.createdAt,
				})),
			});
		},
	},
	{
		method: "GET",
		path: "/api/admin/users",
		async handler(ctx) {
			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}

			const PAGE_SIZE = 50;
			const url = new URL(ctx.request.url);
			const page = Math.max(0, parseInt(url.searchParams.get("page") || "0", 10));
			const search = (url.searchParams.get("q") || "").trim();

			const where = search
				? or(
					like(users.username, `%${search}%`),
					like(users.display, `%${search}%`),
				)
				: undefined;

			const [totalRow, rows] = await Promise.all([
				db.select({ total: count() }).from(users).where(where),
				db.select().from(users)
					.where(where)
					.orderBy(desc(users.createdAt))
					.limit(PAGE_SIZE)
					.offset(page * PAGE_SIZE),
			]);

			const userIds = rows.map((u) => u.id);
			const infractionCounts = userIds.length
				? await db
						.select({ userId: infractions.userId, total: count() })
						.from(infractions)
						.where(inArray(infractions.userId, userIds))
						.groupBy(infractions.userId)
				: [];
			const infractionMap = new Map(
				infractionCounts.map((r) => [r.userId, r.total]),
			);

			return json({
				users: rows.map((u) => ({
					...toPublicUser(u),
					infraction_count: infractionMap.get(u.id) ?? 0,
				})),
				total: totalRow[0]?.total ?? 0,
				page,
				pageSize: PAGE_SIZE,
			});
		},
	},
	{
		method: "DELETE",
		path: "/api/admin/users/:userId",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;
			const { userId } = ctx.params;

			if (userId === auth.user.id) {
				return json(
					{ error: "Cannot delete your own account" },
					{ status: 400 },
				);
			}

			const { target, error } = await resolveAdminTarget(userId, auth);
			if (!target) {
				return json(
					{ error },
					{ status: error === "User not found" ? 404 : 403 },
				);
			}

			await terminateUser(userId);
			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.user.terminate",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { targetUserId: userId, targetUsername: target.username },
			});

			return json({ ok: true });
		},
	},
	{
		method: "POST",
		path: "/api/admin/users/:userId/ban",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;
			const { userId } = ctx.params;

			if (userId === auth.user.id) {
				return json({ error: "Cannot ban yourself" }, { status: 400 });
			}

			const { target, error } = await resolveAdminTarget(userId, auth);
			if (!target) {
				return json(
					{ error },
					{ status: error === "User not found" ? 404 : 403 },
				);
			}

			const body = await ctx.jsonBody();
			const reason =
				isPlainObject(body) && typeof body.reason === "string"
					? stripHtml(body.reason).trim() || null
					: null;

			
			let expiresAt: string | null = null;
			if (isPlainObject(body) && body.minutes) {
				const mins = Number(body.minutes);
				if (Number.isFinite(mins) && mins > 0) {
					
					const clamped = Math.min(Math.floor(mins), 525600);
					expiresAt = new Date(
						Date.now() + clamped * 60_000,
					).toISOString();
				}
			}

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

			const lastIp = loginRows[0]?.ip || null;
			if (lastIp && isLocalhostOrServerIp(lastIp)) {
				return json(
					{ error: "Cannot ban localhost or server addresses" },
					{ status: 400 },
				);
			}

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
						reason: reason ?? `Banned user: ${target.username}`,
						expiresAt: expiresAt,
						bannedBy: auth.user.username,
						createdAt: new Date().toISOString(),
					});
				}
			}

			await db.insert(infractions).values({
				id: randomUUID(),
				userId,
				username: target.username,
				type: "ban",
				reason: reason ?? null,
				issuedBy: auth.user.username,
				createdAt: new Date().toISOString(),
			});

			await revokeTrustOnInfraction(userId);

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.user.ban",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: {
					targetUserId: userId,
					targetUsername: target.username,
					ipBanned: lastIp,
					expiresAt: expiresAt,
				},
			});

			return json({ ok: true, ipBanned: lastIp });
		},
	},
	{
		method: "POST",
		path: "/api/admin/users/:userId/mute-chat",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;
			const { userId } = ctx.params;

			if (userId === auth.user.id) {
				return json(
					{ error: "Cannot mute yourself from chat" },
					{ status: 400 },
				);
			}

			const { target, error } = await resolveAdminTarget(userId, auth);
			if (!target) {
				return json(
					{ error },
					{ status: error === "User not found" ? 404 : 403 },
				);
			}

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) {
				return json({ error: "Invalid request body" }, { status: 400 });
			}

			const requestedMinutes = Number(body.minutes);
			const minutes = Number.isFinite(requestedMinutes)
				? Math.floor(requestedMinutes)
				: ADMIN_DEFAULT_CHAT_MUTE_MINUTES;
			if (minutes < 1 || minutes > 43_200) {
				return json(
					{ error: "Mute duration must be between 1 and 43200 minutes" },
					{ status: 400 },
				);
			}

			const mutedUntil = new Date(
				Date.now() + minutes * 60_000,
			).toISOString();

			await db
				.update(users)
				.set({
					chatMutedUntil: mutedUntil,
					updatedAt: new Date().toISOString(),
				})
				.where(eq(users.id, userId));

			await db.insert(infractions).values({
				id: randomUUID(),
				userId,
				username: target.username,
				type: "mute",
				reason: `Chat muted for ${minutes} minutes`,
				issuedBy: auth.user.username,
				createdAt: new Date().toISOString(),
			});

			await revokeTrustOnInfraction(userId);

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.user.mute_chat",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: {
					targetUserId: userId,
					targetUsername: target.username,
					minutes,
					mutedUntil,
				},
			});

			const activeMute = await getActiveChatMute(userId);
			return json({ ok: true, muted_until: activeMute });
		},
	},
	{
		method: "GET",
		path: "/api/admin/muted-users",
		async handler(ctx) {
			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}

			const rows = await db
				.select()
				.from(users)
				.where(isNotNull(users.chatMutedUntil))
				.orderBy(desc(users.chatMutedUntil));

			const activeMutes = [];
			const expiredMuteIds: string[] = [];

			for (const row of rows) {
				const mutedUntil = row.chatMutedUntil;
				if (!mutedUntil) {
					continue;
				}

				const mutedUntilTime = Date.parse(mutedUntil);
				if (Number.isNaN(mutedUntilTime) || mutedUntilTime <= Date.now()) {
					expiredMuteIds.push(row.id);
					continue;
				}

				activeMutes.push({
					...toPublicUser(row),
					muted_until: mutedUntil,
				});
			}

			for (const userId of expiredMuteIds) {
				await db
					.update(users)
					.set({
						chatMutedUntil: null,
						updatedAt: new Date().toISOString(),
					})
					.where(eq(users.id, userId));
			}

			return json({ users: activeMutes });
		},
	},
	{
		method: "GET",
		path: "/api/admin/moderation/tickets",
		async handler(ctx) {
			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}

			const rows = await db
				.select()
				.from(moderationTickets)
				.where(not(eq(moderationTickets.status, "dismissed")))
				.orderBy(desc(moderationTickets.createdAt));

			const allMessageIds = Array.from(
				new Set(
					rows.flatMap((ticket) => {
						try {
							const ids = JSON.parse(ticket.messageIds);
							return Array.isArray(ids)
								? ids
										.map((id) => Number(id))
										.filter(
											(value) =>
												Number.isInteger(value) && value > 0,
										)
								: [];
						} catch {
							return [];
						}
					}),
				),
			);

			const messageRows = allMessageIds.length
				? await db
						.select()
						.from(messages)
						.where(or(...allMessageIds.map((id) => eq(messages.id, id))))
				: [];

			const messageMap = new Map(messageRows.map((row) => [row.id, row]));

			return json({
				tickets: rows.map((ticket) => {
					let ticketMessageIds: number[] = [];
					try {
						const ids = JSON.parse(ticket.messageIds);
						if (Array.isArray(ids)) {
							ticketMessageIds = ids
								.map((id) => Number(id))
								.filter(
									(value) => Number.isInteger(value) && value > 0,
								);
						}
					} catch {}

					return {
						id: ticket.id,
						created_by: ticket.createdByUsername,
						reported_user_id: ticket.reportedUserId,
						reported_username: ticket.reportedUsername,
						scope: ticket.scope,
						room: ticket.room,
						message_ids: ticketMessageIds,
						messages: ticketMessageIds
							.map((id) => messageMap.get(id))
							.filter((m): m is NonNullable<typeof m> => Boolean(m))
							.map((message) => ({
								id: message.id,
								from: message.fromUserId,
								username: message.username,
								avatar_url: message.avatarUrl,
								content: message.content,
								badges: JSON.parse(message.badges || "[]"),
								sent_at: message.sentAt,
								room: message.room ?? null,
								to: message.toUserId ?? null,
								reply_to_id: message.replyToId ?? null,
							})),
						notes: ticket.notes,
						status: ticket.status,
						created_at: ticket.createdAt,
					};
				}),
			});
		},
	},
	{
		method: "POST",
		path: "/api/admin/moderation/tickets/:ticketId/resolve",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}

			const { ticketId } = ctx.params;
			await db
				.update(moderationTickets)
				.set({ status: "resolved" })
				.where(eq(moderationTickets.id, ticketId));

			return json({ ok: true });
		},
	},
	{
		method: "POST",
		path: "/api/admin/moderation/tickets/:ticketId/dismiss",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}

			const { ticketId } = ctx.params;
			await db
				.update(moderationTickets)
				.set({ status: "dismissed" })
				.where(eq(moderationTickets.id, ticketId));

			return json({ ok: true });
		},
	},
	{
		method: "DELETE",
		path: "/api/admin/users/:userId/mute-chat",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;
			const { userId } = ctx.params;

			const { target, error } = await resolveAdminTarget(userId, auth);
			if (!target) {
				return json(
					{ error },
					{ status: error === "User not found" ? 404 : 403 },
				);
			}

			await db
				.update(users)
				.set({
					chatMutedUntil: null,
					updatedAt: new Date().toISOString(),
				})
				.where(eq(users.id, userId));

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.user.unmute_chat",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: {
					targetUserId: userId,
					targetUsername: target.username,
				},
			});

			return json({ ok: true });
		},
	},
	{
		method: "PUT",
		path: "/api/admin/users/:userId/display",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) {
				return json({ error: "Invalid request body" }, { status: 400 });
			}

			const { userId } = ctx.params;
			const { target, error } = await resolveAdminTarget(userId, auth);
			if (!target) {
				return json(
					{ error },
					{ status: error === "User not found" ? 404 : 403 },
				);
			}

			const display = stripHtml(body.display).trim();
			if (display.length < 2 || display.length > 32) {
				return json(
					{ error: "Display name must be 2-32 characters" },
					{ status: 400 },
				);
			}

			await db
				.update(users)
				.set({ display, updatedAt: new Date().toISOString() })
				.where(eq(users.id, userId));

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.user.rename",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { targetUserId: userId, newDisplay: display },
			});

			return json({ ok: true });
		},
	},
	{
		method: "POST",
		path: "/api/admin/users/:userId/reset-pfp",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;

			const { userId } = ctx.params;
			const { target, error } = await resolveAdminTarget(userId, auth);
			if (!target) {
				return json(
					{ error },
					{ status: error === "User not found" ? 404 : 403 },
				);
			}

			await db
				.update(users)
				.set({
					pfp: "/assets/img/fav.png",
					updatedAt: new Date().toISOString(),
				})
				.where(eq(users.id, userId));

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.user.reset_pfp",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { targetUserId: userId },
			});

			return json({ ok: true });
		},
	},
	{
		method: "POST",
		path: "/api/admin/users/:userId/clear-sessions",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;
			const { userId } = ctx.params;

			const { target, error } = await resolveAdminTarget(userId, auth);
			if (!target) {
				return json(
					{ error },
					{ status: error === "User not found" ? 404 : 403 },
				);
			}

			await db.delete(sessions).where(eq(sessions.userId, userId));
			return json({ ok: true });
		},
	},
	{
		method: "POST",
		path: "/api/admin/users/:userId/reset-password",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) {
				return json({ error: "Invalid request body" }, { status: 400 });
			}

			const { userId } = ctx.params;
			const newPassword = String(body.password ?? "").trim();
			if (newPassword.length < 6 || newPassword.length > 128) {
				return json(
					{ error: "Password must be 6-128 characters" },
					{ status: 400 },
				);
			}

			const passwordHash = await Bun.password.hash(newPassword, {
				algorithm: "bcrypt",
				cost: 10,
			});

			await db
				.update(users)
				.set({ passwordHash, updatedAt: new Date().toISOString() })
				.where(eq(users.id, userId));
			await db.delete(sessions).where(eq(sessions.userId, userId));

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.user.reset_password",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { targetUserId: userId },
			});

			return json({ ok: true });
		},
	},
	{
		method: "DELETE",
		path: "/api/admin/users/:userId/messages",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;
			const { userId } = ctx.params;

			const { target, error } = await resolveAdminTarget(userId, auth);
			if (!target) {
				return json(
					{ error },
					{ status: error === "User not found" ? 404 : 403 },
				);
			}

			await db.delete(messages).where(eq(messages.fromUserId, userId));
			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.user.purge_messages",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { targetUserId: userId },
			});

			return json({ ok: true });
		},
	},
	{
		method: "PUT",
		path: "/api/admin/users/:userId/badges",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) {
				return json({ error: "Invalid request body" }, { status: 400 });
			}

			const { userId } = ctx.params;
			const { target, error } = await resolveAdminTarget(userId, auth);
			if (!target) {
				return json(
					{ error },
					{ status: error === "User not found" ? 404 : 403 },
				);
			}

			const badges = Array.isArray(body.badges) ? body.badges : ["user"];
			await db
				.update(users)
				.set({
					badges: JSON.stringify(badges),
					updatedAt: new Date().toISOString(),
				})
				.where(eq(users.id, userId));

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.user.update_badges",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { targetUserId: userId, badges },
			});

			return json({ ok: true });
		},
	},
	{
		method: "GET",
		path: "/api/admin/ip-bans",
		async handler(ctx) {
			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;
			const isPrivileged = SUPERADMIN.has(auth.user.username);
			const rows = await db
				.select()
				.from(ipBans)
				.orderBy(desc(ipBans.createdAt));

			const auditRows = await db
				.select({
					metadata: auditLogs.metadata,
					createdAt: auditLogs.createdAt,
				})
				.from(auditLogs)
				.where(eq(auditLogs.action, "admin.user.ban"))
				.orderBy(desc(auditLogs.createdAt));

			const bannedUsernamesByIp = new Map<string, string>();
			for (const row of auditRows) {
				if (!row.metadata) {
					continue;
				}

				try {
					const metadata = JSON.parse(row.metadata) as {
						ipBanned?: string;
						targetUsername?: string;
					};
					if (
						typeof metadata.ipBanned === "string" &&
						typeof metadata.targetUsername === "string" &&
						!bannedUsernamesByIp.has(metadata.ipBanned)
					) {
						bannedUsernamesByIp.set(
							metadata.ipBanned,
							metadata.targetUsername,
						);
					}
				} catch {}
			}

			return json({
				privileged: isPrivileged,
				bans: rows.map((ban) => ({
					...ban,
					ip: isPrivileged ? ban.ip : ban.ip.replace(/\d+/g, "***"),
					bannedUser: bannedUsernamesByIp.get(ban.ip) ?? null,
				})),
			});
		},
	},
	{
		method: "POST",
		path: "/api/admin/ip-bans",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) {
				return json({ error: "Invalid request body" }, { status: 400 });
			}

			const ip = normalizeIpCandidate(String(body.ip ?? "").trim());
			if (!ip) {
				return json({ error: "Invalid IP address" }, { status: 400 });
			}
			if (isLocalhostOrServerIp(ip)) {
				return json(
					{ error: "Cannot ban localhost or server addresses" },
					{ status: 400 },
				);
			}
			const reason = stripHtml(String(body.reason ?? "")).trim() || null;
			const existing = await db
				.select()
				.from(ipBans)
				.where(eq(ipBans.ip, ip))
				.limit(1);

			if (existing.length > 0) {
				return json({ error: "IP is already banned" }, { status: 409 });
			}

			await db.insert(ipBans).values({
				id: randomUUID(),
				ip,
				reason,
				bannedBy: auth.user.username,
				createdAt: new Date().toISOString(),
			});

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.ipban.create",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { ip, reason },
			});

			return json({ ok: true });
		},
	},
	{
		method: "DELETE",
		path: "/api/admin/ip-bans/:id",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) {
				return adminResult.response;
			}
			const auth = adminResult.auth!;
			const { id } = ctx.params;

			await db.delete(ipBans).where(eq(ipBans.id, id));
			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.ipban.delete",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { banId: id },
			});

			return json({ ok: true });
		},
	},
	{
		method: "POST",
		path: "/api/admin/users/:userId/hw-ban",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) return adminResult.response;
			const auth = adminResult.auth!;
			const { userId } = ctx.params;

			if (userId === auth.user.id) {
				return json({ error: "Cannot ban yourself" }, { status: 400 });
			}

			const { target, error } = await resolveAdminTarget(userId, auth);
			if (!target) {
				return json(
					{ error },
					{ status: error === "User not found" ? 404 : 403 },
				);
			}

			const userRow = await db
				.select()
				.from(users)
				.where(eq(users.id, userId))
				.get();
			if (!userRow?.hwid) {
				return json(
					{ error: "No hardware ID on record for this user" },
					{ status: 404 },
				);
			}

			const existing = await db
				.select()
				.from(hwBans)
				.where(eq(hwBans.hwid, userRow.hwid))
				.get();
			if (existing) {
				return json(
					{ error: "Hardware ID is already banned" },
					{ status: 409 },
				);
			}

			const body = await ctx.jsonBody();
			const reason =
				isPlainObject(body) && typeof body.reason === "string"
					? stripHtml(body.reason).trim() || null
					: null;

			const lastIpRow = await db
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
				.limit(1)
				.get();

			await db.insert(hwBans).values({
				hwid: userRow.hwid,
				reason: reason ?? `Banned user: ${target.username}`,
				bannedBy: auth.user.username,
				expiresAt: null,
				ipAtBan: lastIpRow?.ip ?? null,
			});

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.user.hw_ban",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { targetUserId: userId, targetUsername: target.username },
			});

			return json({ ok: true });
		},
	},
	{
		method: "GET",
		path: "/api/admin/hw-bans",
		async handler(ctx) {
			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) return adminResult.response;

			const rows = await db
				.select({
					id: hwBans.id,
					hwid: hwBans.hwid,
					reason: hwBans.reason,
					bannedAt: hwBans.bannedAt,
					bannedBy: hwBans.bannedBy,
					expiresAt: hwBans.expiresAt,
					ipAtBan: hwBans.ipAtBan,
					username: users.username,
				})
				.from(hwBans)
				.leftJoin(users, eq(users.hwid, hwBans.hwid))
				.orderBy(desc(hwBans.bannedAt));

			return json({
				bans: rows.map((ban) => ({
					id: ban.id,
					hwid: ban.hwid,
					reason: ban.reason,
					bannedAt: ban.bannedAt,
					bannedBy: ban.bannedBy,
					expiresAt: ban.expiresAt,
					ipAtBan: ban.ipAtBan,
					username: ban.username,
				})),
			});
		},
	},
	{
		method: "POST",
		path: "/api/admin/hw-bans",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) return adminResult.response;
			const auth = adminResult.auth!;

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) {
				return json({ error: "Invalid request body" }, { status: 400 });
			}

			const hwid = String(body.hwid ?? "").trim();
			if (!hwid) return json({ error: "hwid is required" }, { status: 400 });

			const reason =
				typeof body.reason === "string"
					? stripHtml(body.reason).trim() || null
					: null;

			let expiresAt: string | null = null;
			if (body.minutes) {
				const mins = Number(body.minutes);
				if (Number.isFinite(mins) && mins > 0) {
					expiresAt = new Date(
						Date.now() + Math.min(Math.floor(mins), 525600) * 60_000,
					).toISOString();
				}
			}

			const existing = await db
				.select()
				.from(hwBans)
				.where(eq(hwBans.hwid, hwid))
				.get();
			if (existing)
				return json(
					{ error: "Hardware ID is already banned" },
					{ status: 409 },
				);

			await db.insert(hwBans).values({
				hwid,
				reason,
				bannedBy: auth.user.username,
				expiresAt,
				ipAtBan: null,
			});

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.hwban.create",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { hwid, reason, expiresAt },
			});

			return json({ ok: true });
		},
	},
	{
		method: "DELETE",
		path: "/api/admin/hw-bans/:id",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) return adminResult.response;
			const auth = adminResult.auth!;

			const id = Number.parseInt(ctx.params.id, 10);
			if (!Number.isInteger(id) || id < 1) {
				return json({ error: "Invalid ban ID" }, { status: 400 });
			}

			const existing = await db
				.select()
				.from(hwBans)
				.where(eq(hwBans.id, id))
				.get();
			if (!existing)
				return json({ error: "Ban not found" }, { status: 404 });

			await db.delete(hwBans).where(eq(hwBans.id, id));

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.hwban.delete",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { banId: id, hwid: existing.hwid },
			});

			return json({ ok: true });
		},
	},
	{
		method: "POST",
		path: "/api/admin/users/:userId/warn",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) return adminResult.response;
			const auth = adminResult.auth!;
			const { userId } = ctx.params;

			if (userId === auth.user.id) {
				return json({ error: "Cannot warn yourself" }, { status: 400 });
			}

			const { target, error } = await resolveAdminTarget(userId, auth);
			if (!target) {
				return json(
					{ error },
					{ status: error === "User not found" ? 404 : 403 },
				);
			}

			const body = await ctx.jsonBody();
			const reason =
				isPlainObject(body) && typeof body.reason === "string"
					? stripHtml(body.reason).trim() || null
					: null;

			const infraction = {
				id: randomUUID(),
				userId,
				username: target.username,
				type: "warn" as const,
				reason,
				issuedBy: auth.user.username,
				createdAt: new Date().toISOString(),
			};
			await db.insert(infractions).values(infraction);
			await revokeTrustOnInfraction(userId);

			sendModerationWarning(userId, reason ?? "No reason provided", auth.user.username);

			const autoPunishment = await checkAutoPunishments(userId, target.username);

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.user.warn",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: {
					targetUserId: userId,
					targetUsername: target.username,
					reason,
					autoPunishment: autoPunishment.fired ? autoPunishment : null,
				},
			});

			return json({ ok: true, infraction, auto_punishment: autoPunishment });
		},
	},
	{
		method: "GET",
		path: "/api/admin/users/:userId/infractions",
		async handler(ctx) {
			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) return adminResult.response;
			const { userId } = ctx.params;

			const rows = await db
				.select()
				.from(infractions)
				.where(eq(infractions.userId, userId))
				.orderBy(desc(infractions.createdAt));

			return json({ infractions: rows });
		},
	},
	{
		method: "DELETE",
		path: "/api/admin/infractions/:id",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) return adminResult.response;
			const auth = adminResult.auth!;
			const { id } = ctx.params;

			const existing = await db
				.select()
				.from(infractions)
				.where(eq(infractions.id, id))
				.get();
			if (!existing) return json({ error: "Infraction not found" }, { status: 404 });

			await db.delete(infractions).where(eq(infractions.id, id));

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.infraction.delete",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { infractionId: id, targetUsername: existing.username },
			});

			return json({ ok: true });
		},
	},
	{
		method: "GET",
		path: "/api/admin/infractions",
		async handler(ctx) {
			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) return adminResult.response;

			const url = new URL(ctx.request.url);
			const type = url.searchParams.get("type") || null;
			const limit = Math.min(
				100,
				Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)),
			);

			const where = type
				? eq(infractions.type, type)
				: undefined;

			const rows = await db
				.select()
				.from(infractions)
				.where(where)
				.orderBy(desc(infractions.createdAt))
				.limit(limit);

			return json({ infractions: rows });
		},
	},
	{
		method: "POST",
		path: "/api/admin/users/:userId/grant-trusted",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const auth = await ctx.auth();
			if (!auth || !SUPERADMIN.has(auth.user.username)) {
				return json({ error: "Not authorized" }, { status: 403 });
			}

			const { userId } = ctx.params;
			const targetRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
			if (targetRows.length === 0) return json({ error: "User not found" }, { status: 404 });

			await db
				.update(users)
				.set({ trustedUser: true, trustedRevokedManually: false, updatedAt: new Date().toISOString() })
				.where(eq(users.id, userId));

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.user.grant_trusted",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { targetUserId: userId, targetUsername: targetRows[0].username },
			});

			return json({ ok: true });
		},
	},
	{
		method: "POST",
		path: "/api/admin/users/:userId/revoke-trusted",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const auth = await ctx.auth();
			if (!auth || !SUPERADMIN.has(auth.user.username)) {
				return json({ error: "Not authorized" }, { status: 403 });
			}

			const { userId } = ctx.params;
			const targetRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
			if (targetRows.length === 0) return json({ error: "User not found" }, { status: 404 });

			await db
				.update(users)
				.set({ trustedUser: false, trustedRevokedManually: true, updatedAt: new Date().toISOString() })
				.where(eq(users.id, userId));

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.user.revoke_trusted",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { targetUserId: userId, targetUsername: targetRows[0].username },
			});

			return json({ ok: true });
		},
	},
	{
		method: "POST",
		path: "/api/admin/channels/:name/set-trusted-only",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const auth = await ctx.auth();
			if (!auth || !SUPERADMIN.has(auth.user.username)) {
				return json({ error: "Not authorized" }, { status: 403 });
			}

			const { name } = ctx.params;
			const body = await ctx.jsonBody();
			const trustedOnly = isPlainObject(body) && body.trusted_only === true;

			await db.update(channels).set({ trustedOnly }).where(eq(channels.name, name));

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.channel.set_trusted_only",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { channel: name, trustedOnly },
			});

			return json({ ok: true });
		},
	},
	{
		method: "PUT",
		path: "/api/admin/hw-bans/:id",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const adminResult = await requireAdmin(ctx);
			if (adminResult.response) return adminResult.response;
			const auth = adminResult.auth!;

			const id = Number.parseInt(ctx.params.id, 10);
			if (!Number.isInteger(id) || id < 1) {
				return json({ error: "Invalid ban ID" }, { status: 400 });
			}

			const existing = await db
				.select()
				.from(hwBans)
				.where(eq(hwBans.id, id))
				.get();
			if (!existing)
				return json({ error: "Ban not found" }, { status: 404 });

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) {
				return json({ error: "Invalid request body" }, { status: 400 });
			}

			const reason =
				typeof body.reason === "string"
					? stripHtml(body.reason).trim() || null
					: existing.reason;

			let expiresAt: string | null | undefined = undefined;
			if (body.expiresAt === null) {
				expiresAt = null;
			} else if (body.minutes) {
				const mins = Number(body.minutes);
				if (Number.isFinite(mins) && mins > 0) {
					expiresAt = new Date(
						Date.now() + Math.min(Math.floor(mins), 525600) * 60_000,
					).toISOString();
				}
			}

			await db
				.update(hwBans)
				.set({
					reason,
					...(expiresAt !== undefined ? { expiresAt } : {}),
				})
				.where(eq(hwBans.id, id));

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "admin.hwban.update",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: { banId: id, hwid: existing.hwid, reason, expiresAt },
			});

			return json({ ok: true });
		},
	},
];
