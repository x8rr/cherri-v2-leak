import { and, eq, or } from "drizzle-orm";
import { db } from "../db/client";
import { userBlocks, users } from "../db/schema";
import { json } from "../lib/http/response";
import { rejectIfCrossOrigin } from "../lib/security";
import { toPublicUser } from "../lib/serializers";
import type { RequestContext } from "../server/context";
import type { RouteDefinition } from "../server/router";

async function requireAuth(ctx: RequestContext) {
	const auth = await ctx.auth();
	if (!auth) {
		return {
			auth: null,
			response: json({ error: "Authentication required" }, { status: 401 }),
		};
	}
	return { auth };
}

export const blockRoutes: RouteDefinition[] = [
	{
		method: "GET",
		path: "/api/blocks",
		async handler(ctx) {
			const authResult = await requireAuth(ctx);
			if (authResult.response) return authResult.response;
			const auth = authResult.auth!;

			const rows = await db
				.select({ blockedId: userBlocks.blockedId })
				.from(userBlocks)
				.where(eq(userBlocks.blockerId, auth.user.id));

			if (rows.length === 0) return json({ blocked: [] });

			const blockedIds = rows.map((r) => r.blockedId);
			const userRows = await db
				.select()
				.from(users)
				.where(
					blockedIds.length === 1
						? eq(users.id, blockedIds[0])
						: blockedIds.reduce<ReturnType<typeof eq> | undefined>(
								(acc, id) => {
									const cond = eq(users.id, id);
									return acc ? (acc as any).or(cond) : cond;
								},
								undefined,
							)!,
				);

			const userMap = new Map(userRows.map((u) => [u.id, u]));

			return json({
				blocked: blockedIds
					.map((id) => {
						const u = userMap.get(id);
						return u ? toPublicUser(u) : null;
					})
					.filter(Boolean),
			});
		},
	},
];
