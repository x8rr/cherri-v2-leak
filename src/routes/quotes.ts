import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { messages, savedQuotes } from "../db/schema";
import { json } from "../lib/http/response";
import { RATE_LIMIT_WINDOWS } from "../config/constants";
import type { RequestContext } from "../server/context";
import type { RouteDefinition } from "../server/router";

async function requireAuth(ctx: RequestContext) {
	const auth = await ctx.auth();
	if (!auth) {
		return { auth: null, response: json({ error: "Authentication required" }, { status: 401 }) };
	}
	return { auth };
}

function extractQuotePayload(content: string): { u: string; d: string; a: string; t: string } | null {
	const match = content.match(/\[quote:([A-Za-z0-9+/=]+)\]/);
	if (!match) return null;
	try {
		const decoded = Buffer.from(match[1], "base64").toString("utf8");
		const q = JSON.parse(decoded);
		if (!q.t || !q.u) return null;
		return q;
	} catch {
		return null;
	}
}

export const quotesRoutes: RouteDefinition[] = [
	{
		method: "GET",
		path: "/api/quotes",
		async handler(ctx) {
			const { auth, response } = await requireAuth(ctx);
			if (response) return response;

			const quotes = await db
				.select()
				.from(savedQuotes)
				.where(eq(savedQuotes.userId, auth!.user.id))
				.orderBy(desc(savedQuotes.savedAt))
				.limit(100);

			return json({ quotes });
		},
	},
	{
		method: "POST",
		path: "/api/quotes",
		rateLimit: {
			key: "quotes:save",
			max: 30,
			windowMs: RATE_LIMIT_WINDOWS.minute,
		},
		async handler(ctx) {
			const { auth, response } = await requireAuth(ctx);
			if (response) return response;

			const body = (await ctx.jsonBody()) as Record<string, unknown>;
			const messageId = body?.message_id != null ? Number(body.message_id) : null;
			const sourceMessageId = body?.source_message_id != null ? Number(body.source_message_id) : null;

			let authorUsername: string;
			let authorDisplay: string;
			let authorAvatar: string;
			let content: string;
			let refMessageId: number;

			if (messageId != null && Number.isInteger(messageId) && messageId > 0) {
				const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
				if (!msg) return json({ error: "Message not found" }, { status: 404 });
				if (msg.messageType !== "text" || !msg.content || msg.content.startsWith("[quote:")) {
					return json({ error: "Cannot quote this message type" }, { status: 400 });
				}
				authorUsername = msg.username;
				authorDisplay = msg.username;
				authorAvatar = msg.avatarUrl;
				content = msg.content.replace(/\[gif:[^\]]+\]/g, "[gif]").slice(0, 500);
				refMessageId = messageId;
			} else if (sourceMessageId != null && Number.isInteger(sourceMessageId) && sourceMessageId > 0) {
				const [msg] = await db.select().from(messages).where(eq(messages.id, sourceMessageId)).limit(1);
				if (!msg) return json({ error: "Message not found" }, { status: 404 });
				const q = extractQuotePayload(msg.content);
				if (!q) return json({ error: "No quote found in that message" }, { status: 400 });
				authorUsername = String(q.u).slice(0, 50);
				authorDisplay = String(q.d || q.u).slice(0, 100);
				authorAvatar = String(q.a || "").slice(0, 500);
				content = String(q.t).slice(0, 500);
				refMessageId = sourceMessageId;
			} else {
				return json({ error: "message_id or source_message_id required" }, { status: 400 });
			}

			const existing = await db
				.select({ id: savedQuotes.id })
				.from(savedQuotes)
				.where(eq(savedQuotes.userId, auth!.user.id));

			if (existing.length >= 100) {
				return json({ error: "You can only save up to 100 quotes" }, { status: 400 });
			}

			const [quote] = await db
				.insert(savedQuotes)
				.values({
					userId: auth!.user.id,
					authorUsername,
					authorDisplay,
					authorAvatar,
					content,
					savedAt: new Date().toISOString(),
					sourceMessageId: refMessageId,
				})
				.returning();

			return json({ quote });
		},
	},
	{
		method: "DELETE",
		path: "/api/quotes/:id",
		async handler(ctx) {
			const { auth, response } = await requireAuth(ctx);
			if (response) return response;

			const id = Number(ctx.params.id);
			if (!Number.isInteger(id) || id <= 0) {
				return json({ error: "Invalid ID" }, { status: 400 });
			}

			await db
				.delete(savedQuotes)
				.where(and(eq(savedQuotes.id, id), eq(savedQuotes.userId, auth!.user.id)));

			return json({ success: true });
		},
	},
];
