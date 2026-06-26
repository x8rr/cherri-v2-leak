import { eq } from "drizzle-orm";
import { ipBans } from "../db/schema";
import { db } from "../db/client";
import { MemoryRateLimiter } from "../lib/rate-limit";
import { getIpDenyReason } from "../lib/ip-intelligence";
import {
	applyStandardHeaders,
	json,
	noContent,
	text,
} from "../lib/http/response";
import { RequestContext } from "./context";
import { matchRoute } from "./router";
import { servePublicAsset } from "./static";
import { systemRoutes } from "../routes/system";
import { authRoutes } from "../routes/auth";
import { cloudSaveRoutes } from "../routes/cloud-saves";
import { messageRoutes } from "../routes/messages";
import { userRoutes } from "../routes/users";
import { channelRoutes } from "../routes/channels";
import { adminRoutes } from "../routes/admin";
import { appealsRoutes } from "../routes/appeals";
import { aiRoutes } from "../routes/ai";
import { handleChatSocketRequest } from "./chat-socket";
import { voiceRoutes } from "../routes/voice";
import { uploadRoutes } from "../routes/uploads";
import { friendRoutes } from "../routes/friends";
import { profileRoutes } from "../routes/profile";
import { quotesRoutes } from "../routes/quotes";
import { embedRoutes } from "../routes/embed";
import { checkIpBan } from "../lib/ban";

const apiRoutes = [
	...systemRoutes,
	...authRoutes,
	...appealsRoutes,
	...cloudSaveRoutes,
	...messageRoutes,
	...userRoutes,
	...channelRoutes,
	...adminRoutes,
	...aiRoutes,
	...voiceRoutes,
	...uploadRoutes,
	...friendRoutes,
	...profileRoutes,
	...quotesRoutes,
	...embedRoutes,
];

const rateLimiter = new MemoryRateLimiter();

function getRemoteAddress(
	server: Bun.Server<any>,
	request: Request,
): string | null {
	try {
		return server.requestIP(request)?.address ?? null;
	} catch {
		return null;
	}
}

async function handleApiRequest(
	request: Request,
	url: URL,
	server: Bun.Server<any>,
): Promise<Response> {
	if (request.method === "OPTIONS") {
		return applyStandardHeaders(noContent(), url.pathname);
	}

	const matchedRoute = matchRoute(apiRoutes, request.method, url.pathname);
	if (!matchedRoute) {
		return applyStandardHeaders(
			json({ error: "Not found" }, { status: 404 }),
			url.pathname,
		);
	}

	const remoteAddress = getRemoteAddress(server, request);
	const ctx = new RequestContext(
		request,
		url,
		matchedRoute.params,
		remoteAddress,
	);

	const isAppealSubmission =
		matchedRoute.route.path === "/api/appeals" && request.method === "POST";
	if (!isAppealSubmission && (await checkIpBan(ctx.clientIp))) {
		return applyStandardHeaders(
			json({ error: "You are banned from this server" }, { status: 403 }),
			url.pathname,
		);
	}

	const deniedReason = await getIpDenyReason(ctx.clientIp);
	if (deniedReason) {
		return applyStandardHeaders(
			json({ error: deniedReason }, { status: 403 }),
			url.pathname,
		);
	}

	if (matchedRoute.route.rateLimit) {
		const { key, max, windowMs } = matchedRoute.route.rateLimit;
		const bucket = `${key}:${ctx.clientIp ?? "anonymous"}`;
		const result = rateLimiter.consume(bucket, max, windowMs);
		if (!result.allowed) {
			return applyStandardHeaders(
				json({ error: "Rate limit exceeded" }, { status: 429 }),
				url.pathname,
			);
		}
	}

	try {
		const response = await matchedRoute.route.handler(ctx);
		return applyStandardHeaders(response, url.pathname);
	} catch (error) {
		console.error("Unhandled API error", {
			error,
			method: request.method,
			path: url.pathname,
		});
		return applyStandardHeaders(
			json({ error: "Internal server error" }, { status: 500 }),
			url.pathname,
		);
	}
}

export async function handleRequest(
	request: Request,
	server: Bun.Server<any>,
): Promise<Response | undefined> {
	let url: URL;
	try {
		url = new URL(request.url);
	} catch {
		return text("Bad request", { status: 400 });
	}

	try {
		if (url.pathname === "/ws/chat") {
			return handleChatSocketRequest(request, url, server);
		}

		if (url.pathname.startsWith("/api/")) {
			return handleApiRequest(request, url, server);
		}

		
		if (url.pathname.startsWith("/u/") && url.pathname.length > 3) {
			return (await servePublicAsset("/pages/u.html")) ?? undefined;
		}

		const staticResponse = await servePublicAsset(url.pathname);
		if (staticResponse) {
			return staticResponse;
		}

		return text("Not found", { status: 404 });
	} catch (error) {
		console.error("Unhandled request error", {
			error,
			method: request.method,
			path: url.pathname,
		});
		return text("Internal server error", { status: 500 });
	}
}
