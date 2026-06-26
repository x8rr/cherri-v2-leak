import {
	AI_ALLOWED_MODELS,
	AI_DEFAULT_MODEL,
	AI_OPENAI_API_KEY,
	AI_OPENAI_BASE_URL,
} from "../config/constants";

export interface AiChatMessage {
	role: "system" | "user" | "assistant";
	content:
		| string
		| Array<{
				type?: string;
				text?: string;
				image_url?: { url: string };
		  }>;
}

interface OpenAiCompatibleChoice {
	message?: {
		content?: string | Array<{ type?: string; text?: string }>;
	};
}

interface OpenAiCompatibleResponse {
	error?: {
		message?: string;
	};
	choices?: OpenAiCompatibleChoice[];
}

export class AiProviderError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "AiProviderError";
		this.status = status;
	}
}

function getChatCompletionsUrl() {
	const baseUrl = AI_OPENAI_BASE_URL.replace(/\/+$/, "");
	if (!baseUrl) {
		throw new Error("AI_OPENAI_BASE_URL is not configured");
	}

	if (baseUrl.endsWith("/chat/completions")) {
		return baseUrl;
	}

	if (baseUrl.endsWith("/v1")) {
		return `${baseUrl}/chat/completions`;
	}

	return `${baseUrl}/v1/chat/completions`;
}

function normalizeModel(model: string | null | undefined) {
	if (!model || !AI_ALLOWED_MODELS.has(model)) {
		return AI_DEFAULT_MODEL;
	}

	return model;
}

function getResponseText(data: OpenAiCompatibleResponse): string {
	const content = data.choices?.[0]?.message?.content;
	if (typeof content === "string") {
		return content.trim();
	}

	if (Array.isArray(content)) {
		return content
			.map((part) => (typeof part.text === "string" ? part.text : ""))
			.join("")
			.trim();
	}

	return "";
}

export async function createAiChatCompletion(input: {
	model?: string | null;
	messages: AiChatMessage[];
}) {
	const response = await fetch(getChatCompletionsUrl(), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(AI_OPENAI_API_KEY
				? { Authorization: `Bearer ${AI_OPENAI_API_KEY}` }
				: {}),
		},
		body: JSON.stringify({
			model: normalizeModel(input.model),
			messages: input.messages,
		}),
	});

	const data = (await response.json().catch(() => ({}))) as OpenAiCompatibleResponse;

	if (!response.ok) {
		throw new AiProviderError(
			data.error?.message ||
				`AI provider request failed with status ${response.status}`,
			response.status,
		);
	}

	const content = getResponseText(data);
	if (!content) {
		throw new Error("AI provider returned an empty response");
	}

	return {
		model: normalizeModel(input.model),
		content,
	};
}
