import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { RATE_LIMIT_WINDOWS } from "../config/constants";
import { db } from "../db/client";
import { banAppeals, ipBans } from "../db/schema";
import { logAuditEvent } from "../lib/audit";
import { json } from "../lib/http/response";
import { isPlainObject, stripHtml } from "../lib/parsing";
import { rejectIfCrossOrigin } from "../lib/security";
import type { RequestContext } from "../server/context";
import type { RouteDefinition } from "../server/router";
import { requireAdmin } from "./admin";

export const appealsRoutes: RouteDefinition[] = [
  {
    method: "POST",
    path: "/api/appeals",
    rateLimit: {
      key: "appeals:create",
      max: 5,
      windowMs: RATE_LIMIT_WINDOWS.minute,
    },
    async handler(ctx: RequestContext) {
      const crossOriginResponse = rejectIfCrossOrigin(ctx.request);
      if (crossOriginResponse) return crossOriginResponse;

      const body = await ctx.jsonBody();
      if (!isPlainObject(body)) return json({ error: "Invalid request body" }, { status: 400 });

      const message = stripHtml(String(body.message ?? "")).trim();
      if (!message) return json({ error: "Message is required" }, { status: 400 });

      const ip = ctx.clientIp ?? null;

      const id = randomUUID();
      const now = new Date().toISOString();
      await db.insert(banAppeals).values({
        id,
        ip,
        userId: null,
        username: null,
        message,
        status: "open",
        adminResponse: null,
        createdAt: now,
        resolvedAt: null,
      });

      await logAuditEvent({
        request: ctx.request,
        path: ctx.url.pathname,
        remoteAddress: ctx.remoteAddress,
        action: "appeal.created",
        metadata: { id, ip, message },
      });

      return json({ ok: true, id });
    },
  },
  {
    method: "GET",
    path: "/api/admin/ban-appeals",
    async handler(ctx: RequestContext) {
      const adminResult = await requireAdmin(ctx);
      if (adminResult.response) return adminResult.response;
      const rows = await db
        .select()
        .from(banAppeals)
        .where(eq(banAppeals.status, "open"))
        .orderBy(desc(banAppeals.createdAt));
      return json({ appeals: rows });
    },
  },
  {
    method: "POST",
    path: "/api/admin/ban-appeals/:id/resolve",
    async handler(ctx: RequestContext) {
      const adminResult = await requireAdmin(ctx);
      if (adminResult.response) return adminResult.response;
      const auth = adminResult.auth!;
      const { id } = ctx.params;
      const body = await ctx.jsonBody();
      if (!isPlainObject(body)) return json({ error: "Invalid request body" }, { status: 400 });

      const action = String(body.action || "");
      const adminResponse = stripHtml(String(body.adminResponse ?? "")).trim() || null;

      const rows = await db.select().from(banAppeals).where(eq(banAppeals.id, id)).limit(1);
      if (rows.length === 0) return json({ error: "Appeal not found" }, { status: 404 });
      const appeal = rows[0];

      const now = new Date().toISOString();

      if (action === "lift" && appeal.ip) {
        
        await db.delete(ipBans).where(eq(ipBans.ip, appeal.ip));
        await logAuditEvent({
          request: ctx.request,
          path: ctx.url.pathname,
          remoteAddress: ctx.remoteAddress,
          action: "admin.ipban.lift",
          userId: auth.user.id,
          username: auth.user.username,
          metadata: { appealId: id, ip: appeal.ip },
        });
      }

      await db.update(banAppeals).set({ status: "resolved", adminResponse, resolvedAt: now }).where(eq(banAppeals.id, id));

      await logAuditEvent({
        request: ctx.request,
        path: ctx.url.pathname,
        remoteAddress: ctx.remoteAddress,
        action: "admin.appeal.resolve",
        userId: auth.user.id,
        username: auth.user.username,
        metadata: { appealId: id, action, adminResponse },
      });

      return json({ ok: true });
    },
  },
];

export default appealsRoutes;
