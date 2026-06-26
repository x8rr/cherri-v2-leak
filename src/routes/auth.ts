import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { and, count, desc, eq } from "drizzle-orm";
import sharp from "sharp";
import { isWithinPixelBudget, withSharpSlot } from "../lib/image-processing";
import {
	ALLOWED_AVATAR_MIME_TO_EXT,
	AVATAR_WEBP_QUALITY,
	MAX_AVATAR_FILE_BYTES,
	MAX_AVATAR_DIMENSION,
	RATE_LIMIT_WINDOWS,
	USERNAME_REGEX,
} from "../config/constants";
import { avatarDirectory, bannerDirectory } from "../config/paths";
import { db } from "../db/client";
import { messages, sessions, users } from "../db/schema";
import { logAuditEvent } from "../lib/audit";
import {
	buildClearSessionCookie,
	buildSessionCookie,
	parseCookies,
} from "../lib/http/cookies";
import { json } from "../lib/http/response";
import { isPlainObject, stripHtml } from "../lib/parsing";
import { toPublicUser } from "../lib/serializers";
import { rejectIfCrossOrigin } from "../lib/security";
import {
	createSessionExpiryTimestamp,
	createSessionToken,
	hashToken,
} from "../lib/auth/session";
import { isAdminUser } from "../lib/admin";
import type { PlainObject } from "../lib/parsing";
import type { RequestContext } from "../server/context";
import type { RouteDefinition } from "../server/router";

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

function getString(body: PlainObject, key: string): string {
	const value = body[key];
	return typeof value === "string" ? value : "";
}

function isUniqueUsernameConstraintError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const maybeError = error as { code?: unknown; message?: unknown };
	return (
		maybeError.code === "SQLITE_CONSTRAINT_UNIQUE" &&
		typeof maybeError.message === "string" &&
		maybeError.message.includes("users.username")
	);
}

export const authRoutes: RouteDefinition[] = [
	{
		method: "POST",
		path: "/api/auth/signup",
		rateLimit: {
			key: "auth:signup",
			max: 10,
			windowMs: RATE_LIMIT_WINDOWS.minute,
		},
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) {
				return json({ error: "Invalid request body" }, { status: 400 });
			}

			const username = stripHtml(getString(body, "username")).toLowerCase();
			const password = getString(body, "password").trim();

			if (!USERNAME_REGEX.test(username)) {
				return json(
					{
						error: "Username must be 3-24 chars and use letters, numbers, or underscore",
					},
					{ status: 400 },
				);
			}

			if (password.length < 6 || password.length > 128) {
				return json(
					{ error: "Password must be 6-128 characters" },
					{ status: 400 },
				);
			}

			const existingUsers = await db
				.select()
				.from(users)
				.where(eq(users.username, username))
				.limit(1);

			if (existingUsers.length > 0) {
				await logAuditEvent({
					request: ctx.request,
					path: ctx.url.pathname,
					remoteAddress: ctx.remoteAddress,
					action: "auth.signup.conflict",
					success: false,
					username,
					metadata: {
						reason: "username_taken",
					},
				});

				return json(
					{ error: "Username is already taken" },
					{ status: 409 },
				);
			}

			const now = new Date().toISOString();
			const userId = randomUUID();
			const passwordHash = await Bun.password.hash(password, {
				algorithm: "bcrypt",
				cost: 10,
			});

			const userRow = {
				id: userId,
				username,
				passwordHash,
				display: username,
				badges: JSON.stringify(["user"]),
				pfp: `/assets/img/pfps/${Math.floor(Math.random() * 8) + 1}.png`,
				bio: null,
				bannerUrl: null,
				chatMutedUntil: null,
				createdAt: now,
				updatedAt: now,
				hwid: null,
				trustedUser: false,
				trustedRevokedManually: false,
			};

			try {
				await db.insert(users).values(userRow);
			} catch (error) {
				if (!isUniqueUsernameConstraintError(error)) {
					throw error;
				}

				await logAuditEvent({
					request: ctx.request,
					path: ctx.url.pathname,
					remoteAddress: ctx.remoteAddress,
					action: "auth.signup.conflict",
					success: false,
					username,
					metadata: {
						reason: "username_taken_race",
					},
				});

				return json(
					{ error: "Username is already taken" },
					{ status: 409 },
				);
			}

			const sessionToken = createSessionToken();
			await db.insert(sessions).values({
				tokenHash: hashToken(sessionToken),
				userId,
				expiresAt: createSessionExpiryTimestamp(),
				createdAt: now,
			});

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "auth.signup",
				userId,
				username,
				metadata: {
					sessionCreated: true,
				},
			});

			console.log(`[signup] ${username} — ${ctx.clientIp ?? "unknown ip"}`);

			const response = json({ user: toPublicUser(userRow) });
			response.headers.append(
				"Set-Cookie",
				buildSessionCookie(sessionToken),
			);
			return response;
		},
	},
	{
		method: "POST",
		path: "/api/auth/login",
		rateLimit: {
			key: "auth:login",
			max: 20,
			windowMs: RATE_LIMIT_WINDOWS.minute,
		},
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) {
				return json({ error: "Invalid request body" }, { status: 400 });
			}

			const username = stripHtml(getString(body, "username")).toLowerCase();
			const password = getString(body, "password").trim();

			if (!USERNAME_REGEX.test(username) || password.length < 6) {
				return json(
					{ error: "Invalid username or password" },
					{ status: 400 },
				);
			}

			const userRows = await db
				.select()
				.from(users)
				.where(eq(users.username, username))
				.limit(1);

			if (userRows.length === 0) {
				await logAuditEvent({
					request: ctx.request,
					path: ctx.url.pathname,
					remoteAddress: ctx.remoteAddress,
					action: "auth.login.failed",
					success: false,
					username,
					metadata: {
						reason: "invalid_credentials",
					},
				});

				return json(
					{ error: "Invalid username or password" },
					{ status: 401 },
				);
			}

			const userRow = userRows[0];
			const passwordMatches = await Bun.password.verify(
				password,
				userRow.passwordHash,
			);

			if (!passwordMatches) {
				await logAuditEvent({
					request: ctx.request,
					path: ctx.url.pathname,
					remoteAddress: ctx.remoteAddress,
					action: "auth.login.failed",
					success: false,
					userId: userRow.id,
					username: userRow.username,
					metadata: {
						reason: "invalid_credentials",
					},
				});

				return json(
					{ error: "Invalid username or password" },
					{ status: 401 },
				);
			}

			const now = new Date().toISOString();
			const sessionToken = createSessionToken();
			await db.insert(sessions).values({
				tokenHash: hashToken(sessionToken),
				userId: userRow.id,
				expiresAt: createSessionExpiryTimestamp(),
				createdAt: now,
			});

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "auth.login",
				userId: userRow.id,
				username: userRow.username,
				metadata: {
					sessionCreated: true,
				},
			});

			console.log(`[login] ${username} — ${ctx.clientIp ?? "unknown ip"}`);

			const response = json({ user: toPublicUser(userRow) });
			response.headers.append(
				"Set-Cookie",
				buildSessionCookie(sessionToken),
			);
			return response;
		},
	},
	{
		method: "POST",
		path: "/api/auth/logout",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const auth = await ctx.auth();
			const cookies = parseCookies(ctx.request.headers.get("cookie"));
			const rawToken =
				typeof cookies.cherri_session === "string"
					? cookies.cherri_session
					: null;

			if (rawToken) {
				await db
					.delete(sessions)
					.where(eq(sessions.tokenHash, hashToken(rawToken)));
			}

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "auth.logout",
				userId: auth?.user.id ?? null,
				username: auth?.user.username ?? null,
				metadata: {
					hadSessionCookie: Boolean(rawToken),
					hadAuthenticatedUser: Boolean(auth),
				},
			});

			console.log(
				`[logout] ${auth?.user.username ?? "anonymous"} — ${ctx.clientIp ?? "unknown ip"}`,
			);

			const response = json({ ok: true });
			response.headers.append("Set-Cookie", buildClearSessionCookie());
			return response;
		},
	},
	{
		method: "GET",
		path: "/api/auth/me",
		async handler(ctx) {
			const auth = await ctx.auth();
			return json({
				user: auth
					? {
							...auth.user,
							is_admin: isAdminUser(auth.user.username),
						}
					: null,
			});
		},
	},
	{
		method: "PUT",
		path: "/api/auth/profile",
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

			const display = stripHtml(getString(body, "display"));
			if (display.length < 2 || display.length > 32) {
				return json(
					{ error: "Display name must be 2-32 characters" },
					{ status: 400 },
				);
			}

			const bioUpdate = "bio" in body
				? { bio: (stripHtml(getString(body, "bio")).slice(0, 200) || null) }
				: {};

			const [messageCountRow] = await db
				.select({ value: count(messages.id) })
				.from(messages)
				.where(eq(messages.fromUserId, auth.user.id));
			const [latestMessageRow] = await db
				.select({
					id: messages.id,
					username: messages.username,
					sentAt: messages.sentAt,
				})
				.from(messages)
				.where(eq(messages.fromUserId, auth.user.id))
				.orderBy(desc(messages.sentAt))
				.limit(1);

			const updatedAt = new Date().toISOString();
			const updatedRows = await db
				.update(users)
				.set({ display, ...bioUpdate, updatedAt })
				.where(eq(users.id, auth.user.id))
				.returning();

			if (updatedRows.length === 0) {
				return json({ error: "User not found" }, { status: 404 });
			}

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "profile.display_update",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: {
					previousDisplay: auth.user.display,
					nextDisplay: display,
					chatSnapshot: {
						messageCount: Number(messageCountRow?.value || 0),
						latestMessageId: latestMessageRow?.id || null,
						latestMessageUsername: latestMessageRow?.username || null,
						latestMessageSentAt: latestMessageRow?.sentAt || null,
					},
				},
			});

			return json({ user: toPublicUser(updatedRows[0]) });
		},
	},
	{
		method: "POST",
		path: "/api/auth/avatar",
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

			const dataUrl = getString(body, "dataUrl");
			const matches = dataUrl.match(
				/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/,
			);

			if (!matches) {
				return json({ error: "Invalid avatar payload" }, { status: 400 });
			}

			const mimeType = matches[1].toLowerCase();
			const extension = ALLOWED_AVATAR_MIME_TO_EXT[mimeType];
			if (!extension) {
				return json({ error: "Unsupported image type" }, { status: 400 });
			}

			const base64Payload = matches[2];
			if (base64Payload.length > Math.ceil(MAX_AVATAR_FILE_BYTES / 3) * 4) {
				return json(
					{ error: "Avatar exceeds 10MB max size" },
					{ status: 400 },
				);
			}

			const buffer = Buffer.from(base64Payload, "base64");
			if (buffer.length === 0) {
				return json({ error: "Avatar file is empty" }, { status: 400 });
			}

			if (buffer.length > MAX_AVATAR_FILE_BYTES) {
				return json(
					{ error: "Avatar exceeds 10MB max size" },
					{ status: 400 },
				);
			}

			const avatarAnimated = mimeType === "image/gif";
			if (!(await isWithinPixelBudget(buffer, avatarAnimated))) {
				return json({ error: "Invalid avatar image" }, { status: 400 });
			}

			let optimizedBuffer: Buffer;
			try {
				optimizedBuffer = await withSharpSlot(() =>
					sharp(buffer, {
						animated: avatarAnimated,
					})
						.rotate()
						.resize(MAX_AVATAR_DIMENSION, MAX_AVATAR_DIMENSION, {
							fit: "inside",
							withoutEnlargement: true,
						})
						.webp({
							quality: AVATAR_WEBP_QUALITY,
							effort: 4,
						})
						.toBuffer(),
				);
			} catch {
				return json({ error: "Invalid avatar image" }, { status: 400 });
			}

			if (optimizedBuffer.length === 0) {
				return json({ error: "Invalid avatar image" }, { status: 400 });
			}

			const fileName = `${auth.user.id}-${Date.now()}-${randomBytes(6).toString("hex")}.webp`;
			const relativePath = `/uploads/avatars/${fileName}`;
			const absolutePath = resolve(avatarDirectory, fileName);

			await Bun.write(absolutePath, optimizedBuffer);

			const updatedRows = await db
				.update(users)
				.set({
					pfp: relativePath,
					updatedAt: new Date().toISOString(),
				})
				.where(eq(users.id, auth.user.id))
				.returning();

			if (updatedRows.length === 0) {
				return json({ error: "User not found" }, { status: 404 });
			}

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "profile.avatar_update",
				userId: auth.user.id,
				username: auth.user.username,
				metadata: {
					avatarPath: relativePath,
					sourceMimeType: mimeType,
					sourceExtension: extension,
					originalBytes: buffer.length,
					optimizedBytes: optimizedBuffer.length,
				},
			});

			return json({
				pfp: relativePath,
				user: toPublicUser(updatedRows[0]),
			});
		},
	},
	{
		method: "POST",
		path: "/api/auth/banner",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const authResult = await requireAuth(ctx);
			if (authResult.response) return authResult.response;
			const auth = authResult.auth!;

			const body = await ctx.jsonBody();
			if (!isPlainObject(body)) return json({ error: "Invalid request body" }, { status: 400 });

			const dataUrl = getString(body, "dataUrl");
			const matches = dataUrl.match(
				/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/,
			);
			if (!matches) return json({ error: "Invalid banner payload" }, { status: 400 });

			const mimeType = matches[1].toLowerCase();
			if (!ALLOWED_AVATAR_MIME_TO_EXT[mimeType]) {
				return json({ error: "Unsupported image type" }, { status: 400 });
			}

			const base64Payload = matches[2];
			if (base64Payload.length > Math.ceil(MAX_AVATAR_FILE_BYTES / 3) * 4) {
				return json({ error: "Banner exceeds 10MB max size" }, { status: 400 });
			}

			const buffer = Buffer.from(base64Payload, "base64");
			if (buffer.length === 0 || buffer.length > MAX_AVATAR_FILE_BYTES) {
				return json({ error: "Banner exceeds 10MB max size" }, { status: 400 });
			}

			if (!(await isWithinPixelBudget(buffer, false))) {
				return json({ error: "Invalid banner image" }, { status: 400 });
			}

			let optimizedBuffer: Buffer;
			try {
				optimizedBuffer = await withSharpSlot(() =>
					sharp(buffer)
						.rotate()
						.resize(1500, 500, { fit: "cover", withoutEnlargement: true })
						.webp({ quality: AVATAR_WEBP_QUALITY, effort: 4 })
						.toBuffer(),
				);
			} catch {
				return json({ error: "Invalid banner image" }, { status: 400 });
			}

			const fileName = `${auth.user.id}-${Date.now()}-${randomBytes(6).toString("hex")}.webp`;
			const relativePath = `/uploads/banners/${fileName}`;
			const absolutePath = resolve(bannerDirectory, fileName);

			await Bun.write(absolutePath, optimizedBuffer);

			const updatedRows = await db
				.update(users)
				.set({ bannerUrl: relativePath, updatedAt: new Date().toISOString() })
				.where(eq(users.id, auth.user.id))
				.returning();

			if (updatedRows.length === 0) return json({ error: "User not found" }, { status: 404 });

			return json({ bannerUrl: relativePath });
		},
	},
	{
		method: "POST",
		path: "/api/auth/preset-avatar",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const authResult = await requireAuth(ctx);
			if (authResult.response) return authResult.response;
			const auth = authResult.auth!;

			const body = await ctx.jsonBody<Record<string, unknown>>();
			const preset = Number(body?.preset);
			if (!Number.isInteger(preset) || preset < 1 || preset > 8) {
				return json({ error: "Invalid preset (must be 1–8)" }, { status: 400 });
			}

			const pfp = `/assets/img/pfps/${preset}.png`;
			const updatedRows = await db
				.update(users)
				.set({ pfp, updatedAt: new Date().toISOString() })
				.where(eq(users.id, auth.user.id))
				.returning();

			if (updatedRows.length === 0) return json({ error: "User not found" }, { status: 404 });

			return json({ user: toPublicUser(updatedRows[0]) });
		},
	},
];
