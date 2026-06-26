import { AccessToken } from "livekit-server-sdk";
import { getAuthenticatedUser } from "../lib/auth/session";
import { json } from "../lib/http/response";
import { isPlainObject } from "../lib/parsing";
import type { RouteDefinition } from "../server/router";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;

export const voiceRoutes: RouteDefinition[] = [
	{
		method: "POST",
		path: "/api/voice/token",
		async handler(ctx) {
			const auth = await getAuthenticatedUser(ctx.request);
			if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

			const body = await ctx.jsonBody();
			if (
				!isPlainObject(body) ||
				typeof body.room !== "string" ||
				!body.room
			) {
				return json({ error: "Room is required" }, { status: 400 });
			}

			const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
				identity: auth.user.id,
				name: auth.user.username,
			});

			token.addGrant({
				roomJoin: true,
				room: body.room,
				canPublish: true,
				canSubscribe: true,
			});

			return json({ token: await token.toJwt() });
		},
	},
];
