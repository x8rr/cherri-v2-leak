export type PlainObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is PlainObject {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function safeJsonStringify(value: unknown): string | null {
	if (value === undefined) return null;
	try {
		return JSON.stringify(value);
	} catch {
		return JSON.stringify({ error: "serialization_failed" });
	}
}

export function stripHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/<\/?[^>]+(>|$)/g, "")
		.trim();
}

const ALLOWED_GIF_HOSTS = new Set([
	"giphy.com",
	"media.giphy.com",
	"i.giphy.com",
	"media0.giphy.com",
	"media1.giphy.com",
	"media2.giphy.com",
	"media3.giphy.com",
	"media4.giphy.com",
]);

export function isAllowedGifUrl(value: unknown): boolean {
	if (typeof value !== "string") return false;
	const trimmed = value.trim();
	if (!trimmed) return false;

	try {
		if (trimmed.startsWith("/")) {
			const path = trimmed.split(/[?#]/, 1)[0] ?? "";
			return path.toLowerCase().endsWith(".gif");
		}

		const url = new URL(trimmed);
		if (url.protocol !== "https:") return false;
		if (!ALLOWED_GIF_HOSTS.has(url.hostname.toLowerCase())) return false;
		return url.pathname.toLowerCase().endsWith(".gif");
	} catch {
		return false;
	}
}

export function containsOnlyAllowedGifTags(value: unknown): boolean {
	const content = String(value ?? "");
	const gifTagRegex = /\[gif:([^\]]+)\]/g;

	for (const match of content.matchAll(gifTagRegex)) {
		if (!isAllowedGifUrl(match[1])) return false;
	}

	return true;
}

export function parseJsonArray<T>(value: unknown, fallback: T[] = []): T[] {
	if (Array.isArray(value)) return value as T[];
	if (typeof value !== "string") return fallback;
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? (parsed as T[]) : fallback;
	} catch {
		return fallback;
	}
}
