import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { cloudSaves } from "../db/schema";
import { json } from "../lib/http/response";
import { isPlainObject } from "../lib/parsing";
import { toCloudSaveResponse } from "../lib/serializers";
import { rejectIfCrossOrigin } from "../lib/security";
import type { RequestContext } from "../server/context";
import type { RouteDefinition } from "../server/router";

function isValidCloudSaveUserId(value: string): boolean {
	return value.length >= 3 && value.length <= 128;
}

async function ensureCloudSaveAccess(ctx: RequestContext, userId: string) {
	const auth = await ctx.auth();
	if (!auth) {
		return {
			auth: null,
			response: json({ error: "Authentication required" }, { status: 401 }),
		};
	}

	if (auth.user.id !== userId) {
		return {
			auth: null,
			response: json(
				{ error: "You can only access your own cloud save" },
				{ status: 403 },
			),
		};
	}

	return { auth };
}

export const cloudSaveRoutes: RouteDefinition[] = [
	{
		method: "GET",
		path: "/api/cloud-saves/:userId",
		async handler(ctx) {
			const { userId } = ctx.params;
			if (!isValidCloudSaveUserId(userId)) {
				return json({ error: "Invalid user id" }, { status: 400 });
			}

			const access = await ensureCloudSaveAccess(ctx, userId);
			if (access.response) {
				return access.response;
			}

			const rows = await db
				.select()
				.from(cloudSaves)
				.where(eq(cloudSaves.userId, userId))
				.limit(1);

			if (rows.length === 0) {
				return json({ data: null });
			}

			return json({ data: toCloudSaveResponse(rows[0]) });
		},
	},
	{
		method: "PUT",
		path: "/api/cloud-saves/:userId",
		async handler(ctx) {
			const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
			if (crossOriginResponse) {
				return crossOriginResponse;
			}

			const { userId } = ctx.params;
			if (!isValidCloudSaveUserId(userId)) {
				return json({ error: "Invalid user id" }, { status: 400 });
			}

			const access = await ensureCloudSaveAccess(ctx, userId);
			if (access.response) {
				return access.response;
			}

			const body = await ctx.jsonBody();
			if (!isPlainObject(body) || !isPlainObject(body.ls)) {
				return json(
					{
						error: "Request body must include an object field named 'ls'",
					},
					{ status: 400 },
				);
			}

			let serializedSave: string;
			try {
				serializedSave = JSON.stringify(body.ls);
			} catch {
				return json(
					{ error: "Cloud save payload is not serializable JSON" },
					{ status: 400 },
				);
			}

			const updatedAt = new Date().toISOString();
			await db
				.insert(cloudSaves)
				.values({
					userId,
					ls: serializedSave,
					updatedAt,
				})
				.onConflictDoUpdate({
					target: cloudSaves.userId,
					set: {
						ls: serializedSave,
						updatedAt,
					},
				});

			return json({
				ok: true,
				updated_at: updatedAt,
			});
		},
	},
];
