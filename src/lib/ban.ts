import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { hwBans, ipBans } from "../db/schema";

export async function checkIpBan(clientIp: string | null): Promise<boolean> {
	if (!clientIp) return false;
	try {
		const rows = await db
			.select()
			.from(ipBans)
			.where(eq(ipBans.ip, clientIp))
			.limit(1);
		if (rows.length === 0) return false;
		const ban = rows[0];
		if (ban.expiresAt) {
			const exp = Date.parse(ban.expiresAt);
			if (Number.isNaN(exp) || exp <= Date.now()) {
				try {
					await db.delete(ipBans).where(eq(ipBans.ip, clientIp));
				} catch {}
				return false;
			}
		}
		return true;
	} catch (error) {
		console.error("Failed to query ip_bans table", { error });
		return false;
	}
}

export async function checkHwBan(hwid: string | null): Promise<boolean> {
	if (!hwid) return false;
	try {
		const ban = await db
			.select()
			.from(hwBans)
			.where(eq(hwBans.hwid, hwid))
			.get();
		if (!ban) return false;
		if (ban.expiresAt && new Date(ban.expiresAt) < new Date()) return false;
		return true;
	} catch (error) {
		console.error("Failed to query hw_bans table", { error });
		return false;
	}
}
