import { randomUUID } from "node:crypto";
import { db } from "../db/client";
import { auditLogs } from "../db/schema";
import { getRequestNetworkDetails } from "./network";
import { safeJsonStringify } from "./parsing";

interface LogAuditEventArgs {
	request: Request;
	path: string;
	remoteAddress?: string | null;
	action: string;
	success?: boolean;
	userId?: string | null;
	username?: string | null;
	metadata?: unknown;
}

export async function logAuditEvent({
	request,
	path,
	remoteAddress = null,
	action,
	success = true,
	userId = null,
	username = null,
	metadata,
}: LogAuditEventArgs) {
	const createdAt = new Date().toISOString();
	const network = getRequestNetworkDetails(request, remoteAddress);

	try {
		await db.insert(auditLogs).values({
			id: randomUUID(),
			userId,
			username,
			action,
			success,
			ip: network.clientIp,
			userAgent: request.headers.get("user-agent"),
			ipChain: safeJsonStringify(network.ipChain),
			headers: safeJsonStringify(network.headers),
			method: request.method,
			route: path,
			metadata: safeJsonStringify(metadata),
			createdAt,
		});
	} catch (error) {
		console.error("Failed to write audit log", { error, action, path });
	}
}
