import {
	AI_ALLOWED_MODELS,
	AI_DEFAULT_MODEL,
	AI_MAX_CONTEXT_MESSAGES,
	AI_MAX_MESSAGE_LENGTH,
	RATE_LIMIT_WINDOWS,
} from "../config/constants";
import {
	AiProviderError,
	createAiChatCompletion,
	type AiChatMessage,
} from "../lib/ai";
import { json } from "../lib/http/response";
import { MemoryRateLimiter } from "../lib/rate-limit";
import type { RouteDefinition } from "../server/router";

const SYSTEM_PROMPT =
	"All mathematical notation must be rendered using LaTeX. For block equations, use $$equation$$. For inline, use $equation$. Ensure block equations ($$) are self-contained.";

interface AiImageContent {
	type: "image_url";
	image_url: { url: string };
}

interface AiTextContent {
	type: "text";
	text: string;
}

type AiMessageContent = string | Array<AiTextContent | AiImageContent>;

interface AiChatRequestBody {
	model?: string;
	messages?: Array<{
		role?: string;
		content?: AiMessageContent;
	}>;
}

const aiLimiter = new MemoryRateLimiter();

function normalizeMessages(
	body: AiChatRequestBody | null,
): AiChatMessage[] | null {
	if (!body?.messages || !Array.isArray(body.messages)) {
		return null;
	}

	const conversationHistory = body.messages.filter((m) => m.role !== "system");
	const recentHistory = conversationHistory.slice(-AI_MAX_CONTEXT_MESSAGES);

	const normalized = recentHistory
		.map((message) => {
			const role = (
				message.role === "assistant" ? "assistant" : "user"
			) as AiChatMessage["role"];

			let content: AiMessageContent;

			if (Array.isArray(message.content)) {
				content = message.content
					.filter((part) => {
						if (part.type === "text") return part.text?.trim().length > 0;
						if (part.type === "image_url") return !!part.image_url?.url;
						return false;
					})
					.map((part) => {
						if (part.type === "text")
							return { type: "text" as const, text: part.text.trim() };
						return {
							type: "image_url" as const,
							image_url: { url: part.image_url.url },
						};
					});

				if ((content as unknown[]).length === 0) return null;
			} else {
				const text = String(message.content ?? "").trim();
				if (!text) return null;
				if (text.length > AI_MAX_MESSAGE_LENGTH) return "toolong";
				content = text;
			}

			return { role, content };
		})
		.filter(Boolean);

	if (normalized.includes("toolong")) return [];

	const valid = normalized as AiChatMessage[];
	if (valid.length === 0) return null;

	return [{ role: "system", content: SYSTEM_PROMPT }, ...valid];
}

function consumeAiRateLimit(clientIp: string | null) {
	const ip = clientIp ?? "anonymous";
	const minuteResult = aiLimiter.consume(
		`ai:minute:${ip}`,
		5,
		RATE_LIMIT_WINDOWS.minute,
	);

	if (!minuteResult.allowed) {
		return {
			allowed: false,
			response: json(
				{
					error: `AI rate limit exceeded. Retry in ${Math.max(1, Math.ceil(minuteResult.retryAfterMs / 1000))}`,
					limit: "5 messages per minute",
				},
				{
					status: 429,
					headers: {
						"Retry-After": String(
							Math.max(1, Math.ceil(minuteResult.retryAfterMs / 1000)),
						),
					},
				},
			),
		};
	}

	const dayResult = aiLimiter.consume(
		`ai:day:${ip}`,
		100,
		RATE_LIMIT_WINDOWS.day,
	);

	if (!dayResult.allowed) {
		return {
			allowed: false,
			response: json(
				{ error: "AI daily limit exceeded", limit: "100 messages per day" },
				{
					status: 429,
					headers: {
						"Retry-After": String(
							Math.max(1, Math.ceil(dayResult.retryAfterMs / 1000)),
						),
					},
				},
			),
		};
	}

	return { allowed: true, response: null };
}

export const aiRoutes: RouteDefinition[] = [
	{
		method: "POST",
		path: "/api/ai/chat",
		async handler(ctx) {
			const rateLimit = consumeAiRateLimit(ctx.clientIp);
			if (!rateLimit.allowed) {
				return rateLimit.response!;
			}

			const body = await ctx.jsonBody<AiChatRequestBody>();
			const messages = normalizeMessages(body);
			if (messages === null) {
				return json({ error: "Invalid AI request body" }, { status: 400 });
			}

			if (messages.length === 0) {
				return json(
					{
						error: `Messages must be <= ${AI_MAX_MESSAGE_LENGTH} characters`,
					},
					{ status: 400 },
				);
			}

			const requestedModel = body?.model?.trim() || AI_DEFAULT_MODEL;
			if (!AI_ALLOWED_MODELS.has(requestedModel)) {
				return json(
					{
						error: "Unsupported AI model",
						allowedModels: Array.from(AI_ALLOWED_MODELS),
					},
					{ status: 400 },
				);
			}

			try {
				const completion = await createAiChatCompletion({
					model: requestedModel,
					messages,
				});
				return json({
					model: completion.model,
					content: completion.content,
				});
			} catch (error) {
				if (error instanceof AiProviderError && error.status === 429) {
					console.warn("AI provider rate limited request", {
						clientIp: ctx.clientIp,
						model: requestedModel,
						message: error.message,
					});
					return json({ error: error.message }, { status: 429 });
				}

				console.error("AI request failed", {
					error: error instanceof Error ? error.message : String(error),
					providerStatus:
						error instanceof AiProviderError ? error.status : undefined,
					clientIp: ctx.clientIp,
					model: requestedModel,
				});
				return json(
					{
						error:
							error instanceof Error
								? error.message
								: "AI request failed",
					},
					{ status: 502 },
				);
			}
		},
	},
];
