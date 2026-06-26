type WispWebSocketHandler = Bun.WebSocketHandler<undefined>;

type WispModule = {
	default?: unknown;
	server?: unknown;
	logging?: {
		setLevel?: (level: string) => void;
		enable?: () => void;
		disable?: () => void;
	};
};

type WispHandler = {
	websocket?: WispWebSocketHandler;
	fetch?: (request: Request, server: Bun.Server<undefined>) => unknown;
	upgrade?: (request: Request, server: Bun.Server<undefined>) => unknown;
	handleUpgrade?: (
		request: Request,
		server: Bun.Server<undefined>,
	) => unknown;
	routeRequest?: (
		request: Request,
		server: Bun.Server<undefined>,
	) => unknown;
	routeUpgrade?: (
		request: Request,
		server: Bun.Server<undefined>,
	) => unknown;
	open?: WispWebSocketHandler["open"];
	message?: WispWebSocketHandler["message"];
	close?: WispWebSocketHandler["close"];
	drain?: WispWebSocketHandler["drain"];
	ping?: WispWebSocketHandler["ping"];
	pong?: WispWebSocketHandler["pong"];
};

export type DevWispBridge = {
	handleRequest: (
		request: Request,
		server: Bun.Server<undefined>,
	) => Promise<Response | undefined>;
	websocket?: WispWebSocketHandler;
};

function isResponse(value: unknown): value is Response {
	return value instanceof Response;
}

function isUpgradeRequest(request: Request) {
	return request.headers.get("upgrade")?.toLowerCase() === "websocket";
}

function toWebSocketHandler(candidate: WispHandler): WispWebSocketHandler {
	if (candidate.websocket) {
		return candidate.websocket;
	}

	return {
		open: candidate.open?.bind(candidate),
		message: candidate.message?.bind(candidate) ?? (() => {}),
		close: candidate.close?.bind(candidate),
		drain: candidate.drain?.bind(candidate),
		ping: candidate.ping?.bind(candidate),
		pong: candidate.pong?.bind(candidate),
	};
}

async function invokeWispHandler(
	candidate: WispHandler,
	request: Request,
	server: Bun.Server<undefined>,
): Promise<Response | undefined> {
	const handlers = [
		candidate.fetch,
		candidate.upgrade,
		candidate.handleUpgrade,
		candidate.routeRequest,
		candidate.routeUpgrade,
	].filter((handler): handler is NonNullable<typeof handler> =>
		typeof handler === "function",
	);

	for (const handler of handlers) {
		const result = await handler.call(candidate, request, server);

		if (isResponse(result)) {
			return result;
		}

		if (result === true) {
			return undefined;
		}
	}

	return new Response("Failed to upgrade Wisp dev socket", { status: 500 });
}

export async function createDevWispBridge(): Promise<DevWispBridge> {
	const mod = (await import("@mercuryworkshop/wisp-js/server")) as WispModule;
	const candidate = ((mod.server ?? mod.default ?? mod) as WispHandler) ?? {};

	if (mod.logging?.setLevel) {
		mod.logging.setLevel("debug");
	}

	const websocket = toWebSocketHandler(candidate);

	return {
		websocket,
		async handleRequest(request, server) {
			const url = new URL(request.url);
			if (!url.pathname.startsWith("/socket/")) {
				return new Response("Not found", { status: 404 });
			}

			if (!isUpgradeRequest(request)) {
				return new Response("Wisp dev endpoint requires WebSocket", {
					status: 426,
				});
			}

			return invokeWispHandler(candidate, request, server);
		},
	};
}
