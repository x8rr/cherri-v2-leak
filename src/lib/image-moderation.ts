import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { imageHashBlocklist } from "../db/schema";
import { AI_OPENAI_API_KEY, IMAGE_MODERATION_MODEL, IMAGE_MODERATION_URL } from "../config/constants";
import { quarantineDirectory } from "../config/paths";

mkdirSync(quarantineDirectory, { recursive: true });

export interface ModerationResult {
	flagged: boolean;
	reason?: string;
}



const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
	"image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
	"image/jpg":  (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
	"image/png":  (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
	"image/gif":  (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
	"image/webp": (b) =>
		b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
		b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};

export function checkMagicBytes(buffer: ArrayBuffer, claimedMime: string): boolean {
	const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 12));
	const check = MAGIC[claimedMime];
	return check ? check(bytes) : false;
}



export function sha256hex(buffer: ArrayBuffer): string {
	return createHash("sha256").update(Buffer.from(buffer)).digest("hex");
}



export async function isHashBlocked(hash: string): Promise<string | null> {
	const row = await db
		.select({ reason: imageHashBlocklist.reason })
		.from(imageHashBlocklist)
		.where(eq(imageHashBlocklist.hash, hash))
		.get();
	return row?.reason ?? (row ? "previously flagged content" : null);
}

async function recordBlockedHash(
	hash: string,
	reason: string,
	uploaderId: string,
	uploaderUsername: string,
) {
	try {
		await db
			.insert(imageHashBlocklist)
			.values({
				hash,
				reason,
				uploaderId,
				uploaderUsername,
				createdAt: new Date().toISOString(),
			})
			.onConflictDoNothing();
	} catch {}
}



export async function quarantineImage(
	filename: string,
	buffer: ArrayBuffer,
): Promise<void> {
	try {
		const dest = resolve(quarantineDirectory, filename);
		await Bun.write(dest, buffer);
	} catch (err) {
		console.error("[moderation] Failed to quarantine image", { filename, err });
	}
}



async function callAiModeration(buffer: ArrayBuffer, mimeType: string): Promise<ModerationResult> {
	if (!AI_OPENAI_API_KEY) return { flagged: false };

	const base64 = Buffer.from(buffer).toString("base64");
	const dataUrl = `data:${mimeType};base64,${base64}`;

	let res: Response;
	try {
		res = await fetch(IMAGE_MODERATION_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${AI_OPENAI_API_KEY}`,
			},
			body: JSON.stringify({
				model: IMAGE_MODERATION_MODEL,
				input: [{ type: "image_url", image_url: { url: dataUrl } }],
			}),
		});
	} catch {
		
		return { flagged: true, reason: "moderation service unavailable" };
	}

	if (!res.ok) {
		return { flagged: true, reason: `moderation service error (HTTP ${res.status})` };
	}

	let data: { results?: { flagged?: boolean; categories?: Record<string, boolean> }[] };
	try {
		data = await res.json();
	} catch {
		return { flagged: true, reason: "moderation service returned invalid response" };
	}

	const result = data.results?.[0];
	if (result?.flagged) {
		const triggered = Object.entries(result.categories ?? {})
			.filter(([, v]) => v)
			.map(([k]) => k.replace(/\//g, " / "));
		return { flagged: true, reason: triggered.join(", ") || "policy violation" };
	}

	return { flagged: false };
}



export interface ModerateUploadOptions {
		processedBuffer: ArrayBuffer;
		processedMime: string;
		originalBuffer: ArrayBuffer;
		filename: string;
	uploaderId: string;
	uploaderUsername: string;
}

export async function moderateUpload(opts: ModerateUploadOptions): Promise<ModerationResult> {
	const { processedBuffer, processedMime, originalBuffer, filename, uploaderId, uploaderUsername } = opts;

	
	const hash = sha256hex(originalBuffer);
	const blockedReason = await isHashBlocked(hash);
	if (blockedReason) {
		
		await quarantineImage(`reupload_${Date.now()}_${filename}`, originalBuffer);
		emitAlert(uploaderId, uploaderUsername, `hash-blocked: ${blockedReason}`);
		return { flagged: true, reason: blockedReason };
	}

	
	const aiResult = await callAiModeration(processedBuffer, processedMime);
	if (aiResult.flagged) {
		const reason = aiResult.reason ?? "policy violation";

		
		await quarantineImage(filename, processedBuffer);

		
		await recordBlockedHash(hash, reason, uploaderId, uploaderUsername);

		emitAlert(uploaderId, uploaderUsername, reason);
		return { flagged: true, reason };
	}

	return { flagged: false };
}

function emitAlert(userId: string, username: string, reason: string) {
	
	console.error(
		`\n${"█".repeat(60)}\n` +
		`  CONTENT MODERATION ALERT\n` +
		`  User   : ${username} (${userId})\n` +
		`  Reason : ${reason}\n` +
		`  Time   : ${new Date().toISOString()}\n` +
		`${"█".repeat(60)}\n`,
	);
}
