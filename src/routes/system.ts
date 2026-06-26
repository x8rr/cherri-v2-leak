import { dbFilePath } from "../db/client";
import { json } from "../lib/http/response";
import type { RouteDefinition } from "../server/router";

export const systemRoutes: RouteDefinition[] = [
	{
		method: "GET",
		path: "/api/system/network",
		handler(ctx) {
			const digits = String(ctx.clientIp ?? "")
				.replace(/\D/g, "")
				.slice(0, 2);

			return json({
				ip: ctx.clientIp,
				ipChain: ctx.network.ipChain,
				nowggPrefix: digits.length === 2 ? digits : null,
			});
		},
	},
	{
		method: "GET",
		path: "/api/health",
		handler() {
			return json({
				ok: true,
				database: {
					type: "sqlite",
					file: dbFilePath,
				},
				auth: {
					provider: "local",
				},
			});
		},
	},
];
