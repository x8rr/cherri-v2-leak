import { mkdirSync } from "node:fs";
import { APP_PORT } from "../config/constants";
import { avatarDirectory, bannerDirectory } from "../config/paths";
import { closeDatabase, runMigrationsIfPresent } from "../db/client";
import { handleRequest } from "./app";

type FetchHandler = (
	request: Request,
	server: Bun.Server<any>,
) => Response | Promise<Response | undefined> | undefined;

type ServerStartOptions = {
	fetchHandler?: FetchHandler;
	websocket?: Bun.WebSocketHandler<any>;
};

export function startServer(options: ServerStartOptions = {}) {
	const { fetchHandler, websocket } = options;

	mkdirSync(avatarDirectory, { recursive: true });
	mkdirSync(bannerDirectory, { recursive: true });
	runMigrationsIfPresent();

	const fetch = async (request: Request, bunServer: Bun.Server<any>) => {
		if (fetchHandler) {
			const customResponse = await fetchHandler(request, bunServer);
			if (customResponse !== undefined) {
				return customResponse;
			}
		}

		return (
			(await handleRequest(request, bunServer)) ??
			new Response("WebSocket upgrade unavailable", { status: 426 })
		);
	};

	const server = websocket
		? Bun.serve({
				port: APP_PORT,
				hostname: "0.0.0.0",
				websocket,
				fetch,
			})
		: Bun.serve({
				port: APP_PORT,
				hostname: "0.0.0.0",
				fetch,
			});

	function shutdown() {
		closeDatabase();
		server.stop(true);
		process.exit(0);
	}

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);

	process.on("unhandledRejection", (reason) => {
		console.error("Unhandled promise rejection", { reason });
	});
	process.on("uncaughtException", (error) => {
		console.error("Uncaught exception", { error });
	});

	return server;
}
