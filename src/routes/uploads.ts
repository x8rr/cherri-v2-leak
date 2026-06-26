import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync } from "node:fs";
import { extname, resolve } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db/client";
import { users } from "../db/schema";
import { json } from "../lib/http/response";
import { rejectIfCrossOrigin } from "../lib/security";
import { publicPath } from "../config/paths";
import { logAuditEvent } from "../lib/audit";
import { SlidingWindowRateLimiter } from "../lib/rate-limit";
import {
	checkMagicBytes,
	moderateUpload,
} from "../lib/image-moderation";
import { isWithinPixelBudget, withSharpSlot } from "../lib/image-processing";
import type { RequestContext } from "../server/context";
import type { RouteDefinition } from "../server/router";

const mediaDirectory = resolve(publicPath, "uploads/media");
mkdirSync(mediaDirectory, { recursive: true });

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; 
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;  

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/jpg":  "jpg",
	"image/png":  "png",
	"image/gif":  "gif",
	"image/webp": "webp",
};

const VOICE_EXT_BY_MIME: Record<string, string> = {
	"audio/webm": "webm",
	"audio/ogg":  "ogg",
	"audio/mpeg": "mp3",
	"audio/mp4":  "mp4",
	"audio/wav":  "wav",
	"audio/x-wav":"wav",
	"audio/aac":  "aac",
};

const VOICE_EXT_BY_NAME: Record<string, string> = {
	webm: "webm",
	ogg:  "ogg",
	mp3:  "mp3",
	mp4:  "mp4",
	wav:  "wav",
	aac:  "aac",
};


const imageUploadLimiter = new SlidingWindowRateLimiter();
const IMAGE_UPLOAD_MAX = 20;
const IMAGE_UPLOAD_WINDOW_MS = 60 * 60 * 1000;



const voiceUploadLimiter = new SlidingWindowRateLimiter();
const VOICE_UPLOAD_MAX = 20;
const VOICE_UPLOAD_WINDOW_MS = 60 * 60 * 1000;

async function requireTrustedAuth(ctx: RequestContext) {
	const auth = await ctx.auth();
	if (!auth) {
		return {
			auth: null,
			response: json({ error: "Authentication required" }, { status: 401 }),
		};
	}

	const userRow = await db
		.select({ trustedUser: users.trustedUser })
		.from(users)
		.where(eq(users.id, auth.user.id))
		.get();

	if (!userRow?.trustedUser) {
		return {
			auth: null,
			response: json(
				{ error: "Only trusted users can upload media." },
				{ status: 403 },
			),
		};
	}

	return { auth, response: null };
}

async function compressImage(
	buffer: ArrayBuffer,
	mimeType: string,
): Promise<{ data: Buffer; mime: string; ext: string } | null> {
	const src = Buffer.from(buffer);
	const animated = mimeType === "image/gif";

	
	if (!(await isWithinPixelBudget(src, animated))) return null;

	if (animated) {
		try {
			const data = await withSharpSlot(() =>
				sharp(src, { animated: true }).gif().toBuffer(),
			);
			if (data.length > MAX_OUTPUT_BYTES) return null;
			return { data, mime: "image/gif", ext: "gif" };
		} catch {
			return null;
		}
	}

	
	for (const quality of [85, 70, 55, 40]) {
		try {
			const data = await withSharpSlot(() =>
				sharp(src)
					.rotate()                                                   
					.resize(4096, 4096, { fit: "inside", withoutEnlargement: true })
					.webp({ quality, effort: 4 })
					.toBuffer(),
			);
			if (data.length <= MAX_OUTPUT_BYTES) {
				return { data, mime: "image/webp", ext: "webp" };
			}
		} catch {
			return null;
		}
	}

	return null; 
}

export const uploadRoutes: RouteDefinition[] = [
	{
		method: "POST",
		path: "/api/upload/image",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const { auth, response: authResponse } = await requireTrustedAuth(ctx);
			if (authResponse) return authResponse;
			const { user } = auth!;

			
			const rlResult = imageUploadLimiter.consume(
				`img:${user.id}`,
				IMAGE_UPLOAD_MAX,
				IMAGE_UPLOAD_WINDOW_MS,
			);
			if (!rlResult.allowed) {
				return json(
					{ error: "Image upload limit reached. Try again later." },
					{ status: 429 },
				);
			}

			let formData: FormData;
			try {
				formData = await ctx.request.formData();
			} catch {
				return json({ error: "Invalid form data" }, { status: 400 });
			}

			const file = formData.get("file");
			if (!(file instanceof File)) {
				return json({ error: "Missing file field" }, { status: 400 });
			}

			if (file.size > MAX_UPLOAD_BYTES) {
				return json({ error: "File too large (max 10 MB)" }, { status: 413 });
			}

			const claimedMime = file.type.toLowerCase().split(";")[0].trim();
			if (!ALLOWED_IMAGE_TYPES[claimedMime]) {
				return json(
					{ error: "Unsupported image type. Allowed: JPEG, PNG, GIF, WebP" },
					{ status: 415 },
				);
			}

			const originalBuffer = await file.arrayBuffer();

			
			if (!checkMagicBytes(originalBuffer, claimedMime)) {
				await logAuditEvent({
					request: ctx.request,
					path: ctx.url.pathname,
					remoteAddress: ctx.remoteAddress,
					action: "upload.image.magic_bytes_fail",
					success: false,
					userId: user.id,
					username: user.username,
					metadata: { claimedMime },
				});
				return json({ error: "File content does not match its type." }, { status: 415 });
			}

			
			const compressed = await compressImage(originalBuffer, claimedMime);
			if (!compressed) {
				return json(
					{ error: "Image could not be compressed to under 5 MB. Please use a smaller image." },
					{ status: 413 },
				);
			}

			
			const filename = `${randomUUID()}.${compressed.ext}`;
			const filePath = resolve(mediaDirectory, filename);
			await Bun.write(filePath, compressed.data);

			
			const modResult = await moderateUpload({
				processedBuffer: compressed.data.buffer as ArrayBuffer,
				processedMime: compressed.mime,
				originalBuffer,
				filename,
				uploaderId: user.id,
				uploaderUsername: user.username,
			});

			if (modResult.flagged) {
				
				try { unlinkSync(filePath); } catch {}

				await logAuditEvent({
					request: ctx.request,
					path: ctx.url.pathname,
					remoteAddress: ctx.remoteAddress,
					action: "upload.image.moderation_blocked",
					success: false,
					userId: user.id,
					username: user.username,
					metadata: { filename, reason: modResult.reason },
				});

				return json(
					{ error: `Image rejected by content moderation${modResult.reason ? `: ${modResult.reason}` : ""}` },
					{ status: 422 },
				);
			}

			await logAuditEvent({
				request: ctx.request,
				path: ctx.url.pathname,
				remoteAddress: ctx.remoteAddress,
				action: "upload.image.success",
				userId: user.id,
				username: user.username,
				metadata: { filename, originalSize: file.size, compressedSize: compressed.data.length },
			});

			return json({ url: `/uploads/media/${filename}` });
		},
	},
	{
		method: "POST",
		path: "/api/upload/voice",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) return crossOriginResponse;

			const { auth, response } = await requireTrustedAuth(ctx);
			if (response) return response;
			const { user } = auth!;

			const rlResult = voiceUploadLimiter.consume(
				`voice:${user.id}`,
				VOICE_UPLOAD_MAX,
				VOICE_UPLOAD_WINDOW_MS,
			);
			if (!rlResult.allowed) {
				return json(
					{ error: "Voice upload limit reached. Try again later." },
					{ status: 429 },
				);
			}

			let formData: FormData;
			try {
				formData = await ctx.request.formData();
			} catch {
				return json({ error: "Invalid form data" }, { status: 400 });
			}

			const file = formData.get("file");
			if (!(file instanceof File)) {
				return json({ error: "Missing file field" }, { status: 400 });
			}

			if (file.size > MAX_UPLOAD_BYTES) {
				return json({ error: "File too large (max 10 MB)" }, { status: 413 });
			}

			const mimeBase = file.type.toLowerCase().split(";")[0].trim();
			const fileExt = extname(file.name).replace(".", "").toLowerCase();
			const ext = VOICE_EXT_BY_MIME[mimeBase] ?? VOICE_EXT_BY_NAME[fileExt] ?? "webm";

			const filename = `${randomUUID()}.${ext}`;
			const filePath = resolve(mediaDirectory, filename);

			const buffer = await file.arrayBuffer();
			await Bun.write(filePath, buffer);

			return json({ url: `/uploads/media/${filename}` });
		},
	},
];
