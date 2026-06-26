import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from "../../config/constants";

export function parseCookies(
	cookieHeader: string | null,
): Record<string, string> {
	const cookies: Record<string, string> = {};
	if (!cookieHeader) {
		return cookies;
	}

	for (const pair of cookieHeader.split(";")) {
		const [rawName, ...rest] = pair.trim().split("=");
		if (!rawName || rest.length === 0) {
			continue;
		}
		cookies[rawName] = decodeURIComponent(rest.join("="));
	}

	return cookies;
}

export function buildSessionCookie(token: string): string {
	const isSecure = process.env.NODE_ENV === "production";
	const securePart = isSecure ? "Secure; " : "";

	return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; ${securePart}HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

export function buildClearSessionCookie(): string {
	const isSecure = process.env.NODE_ENV === "production";
	const securePart = isSecure ? "Secure; " : "";

	return `${SESSION_COOKIE_NAME}=; Path=/; ${securePart}HttpOnly; SameSite=Lax; Max-Age=0`;
}
