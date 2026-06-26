import { chatWebSocketHandler } from "./server/chat-socket";
import { createDevWispBridge } from "./server/dev-wisp";
import { startServer } from "./server/start";

const wispBridge = await createDevWispBridge();

const websocket: Bun.WebSocketHandler<any> = {
	open(socket) {
		if (socket.data?.kind === "chat") {
			chatWebSocketHandler.open?.(socket);
			return;
		}

		wispBridge.websocket?.open?.(socket);
	},

	message(socket, message) {
		if (socket.data?.kind === "chat") {
			chatWebSocketHandler.message?.(socket, message);
			return;
		}

		wispBridge.websocket?.message?.(socket, message);
	},

	close(socket, code, reason) {
		if (socket.data?.kind === "chat") {
			chatWebSocketHandler.close?.(socket, code, reason);
			return;
		}

		wispBridge.websocket?.close?.(socket, code, reason);
	},

	drain(socket) {
		if (socket.data?.kind === "chat") {
			chatWebSocketHandler.drain?.(socket);
			return;
		}

		wispBridge.websocket?.drain?.(socket);
	},

	ping(socket, data) {
		if (socket.data?.kind === "chat") {
			chatWebSocketHandler.ping?.(socket, data);
			return;
		}

		wispBridge.websocket?.ping?.(socket, data);
	},

	pong(socket, data) {
		if (socket.data?.kind === "chat") {
			chatWebSocketHandler.pong?.(socket, data);
			return;
		}

		wispBridge.websocket?.pong?.(socket, data);
	},
};

const server = startServer({
	websocket,
	async fetchHandler(request, bunServer) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/socket/")) {
			return wispBridge.handleRequest(request, bunServer as Bun.Server<undefined>);
		}

		return undefined;
	},
});

console.log(`Dev server is running on http://localhost:${server.port}`);
