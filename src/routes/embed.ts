import { json } from "../lib/http/response";
import type { RouteDefinition } from "../server/router";

interface EmbedMeta {
	title: string | null;
	description: string | null;
	color: string | null;
}

const cache = new Map<string, { data: EmbedMeta; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_SIZE = 500;
const MAX_BODY_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 5000;

function isAllowedUrl(raw: string): boolean {
	let url: URL;
	try { url = new URL(raw); } catch { return false; }
	if (url.protocol !== "http:" && url.protocol !== "https:") return false;
	const h = url.hostname.toLowerCase();
	if (h === "localhost" || h.endsWith(".local")) return false;
	if (/^(127\.|10\.|169\.254\.|192\.168\.)/.test(h)) return false;
	if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
	if (h === "::1" || h === "[::1]") return false;
	return true;
}

function decodeEntities(s: string): string {
	return s
		.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"').replace(/&#39;|&#x27;|&apos;/gi, "'")
		.replace(/&nbsp;/gi, " ");
}

function getMeta(html: string, prop: string): string | null {
	const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re1 = new RegExp(`<meta[^>]+property=["']${esc}["'][^>]+content=["']([^"'<>]*)["']`, "i");
	const re2 = new RegExp(`<meta[^>]+content=["']([^"'<>]*)["'][^>]+property=["']${esc}["']`, "i");
	const m = html.match(re1) || html.match(re2);
	return m ? decodeEntities(m[1].trim()) || null : null;
}

function getMetaName(html: string, name: string): string | null {
	const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re1 = new RegExp(`<meta[^>]+name=["']${esc}["'][^>]+content=["']([^"'<>]*)["']`, "i");
	const re2 = new RegExp(`<meta[^>]+content=["']([^"'<>]*)["'][^>]+name=["']${esc}["']`, "i");
	const m = html.match(re1) || html.match(re2);
	return m ? decodeEntities(m[1].trim()) || null : null;
}

function parseEmbed(html: string, _pageUrl: string): EmbedMeta {
	const title =
		getMeta(html, "og:title") ||
		html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
		null;

	const description =
		getMeta(html, "og:description") ||
		getMetaName(html, "description") ||
		null;

	const color = getMetaName(html, "theme-color") || getMeta(html, "theme-color") || null;

	return {
		title: title ? title.slice(0, 200) : null,
		description: description ? description.slice(0, 300) : null,
		color: color ? color.slice(0, 20) : null,
	};
}

async function fetchEmbed(rawUrl: string): Promise<EmbedMeta | null> {
	const cached = cache.get(rawUrl);
	if (cached && cached.expiresAt > Date.now()) return cached.data;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		const res = await fetch(rawUrl, {
			signal: controller.signal,
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; CherriBot/1.0)",
				"Accept": "text/html,application/xhtml+xml",
				"Accept-Language": "en-US,en;q=0.9",
			},
			redirect: "follow",
		});
		clearTimeout(timer);

		const ct = res.headers.get("content-type") || "";
		if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;

		const reader = res.body?.getReader();
		if (!reader) return null;

		const chunks: Uint8Array[] = [];
		let total = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done || !value) break;
			chunks.push(value);
			total += value.length;
			if (total >= MAX_BODY_BYTES) { reader.cancel(); break; }
		}

		let offset = 0;
		const merged = new Uint8Array(total);
		for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
		const html = new TextDecoder().decode(merged);

		const data = parseEmbed(html, res.url || rawUrl);

		if (cache.size >= MAX_CACHE_SIZE) {
			cache.delete(cache.keys().next().value!);
		}
		cache.set(rawUrl, { data, expiresAt: Date.now() + CACHE_TTL_MS });
		return data;
	} catch {
		clearTimeout(timer);
		return null;
	}
}

export const embedRoutes: RouteDefinition[] = [
	{
		method: "GET",
		path: "/api/embed",
		async handler(ctx) {
			const urlParam = ctx.url.searchParams.get("url");
			if (!urlParam) return json({ error: "Missing url" }, { status: 400 });
			if (!isAllowedUrl(urlParam)) return json({ error: "URL not allowed" }, { status: 400 });

			const data = await fetchEmbed(urlParam);
			if (!data || !data.title) return json({ error: "No embed data" }, { status: 200 });

			return json(data);
		},
	},
];
