import {
	IP_INTELLIGENCE_BASE_URL,
	IP_INTELLIGENCE_ENABLED,
} from "../config/constants";

interface IpThreatDetails {
	is_vpn?: boolean;
	is_datacenter?: boolean;
}

interface IpInfoResponse {
	threat?: IpThreatDetails | null;
}

interface CachedIpDecision {
	deny: boolean;
	reason: string | null;
	expiresAt: number;
}

const CACHE_TTL_MS = 1000 * 60 * 15;
const LOOKUP_FAILURE_TTL_MS = 1000 * 60;
const PROVIDER_ERROR_TTL_MS = 1000 * 60 * 5;
const PROVIDER_RATE_LIMIT_TTL_MS = 1000 * 60 * 15;
const requestCache = new Map<string, CachedIpDecision>();
let primaryProviderCooldownExpiresAt = 0;

function cacheDecision(ip: string, reason: string | null, ttlMs: number) {
	requestCache.set(ip, {
		deny: reason !== null,
		reason,
		expiresAt: Date.now() + ttlMs,
	});
}

function getFailurePreview(body: string) {
	const trimmed = body.trim();
	if (!trimmed) {
		return undefined;
	}

	return trimmed.slice(0, 200);
}

function applyProviderCooldown(
	provider: string,
	status: number,
	body: string,
	ttlMs: number,
	currentExpiry: number,
) {
	const nextExpiry = Date.now() + ttlMs;
	if (currentExpiry >= nextExpiry) {
		return currentExpiry;
	}

	console.warn("IP intelligence provider disabled temporarily", {
		provider,
		status,
		retryAt: new Date(nextExpiry).toISOString(),
		body: getFailurePreview(body),
	});
	return nextExpiry;
}

function cacheResolvedDecision(ip: string, reason: string | null) {
	requestCache.set(ip, {
		deny: reason !== null,
		reason,
		expiresAt: Date.now() + CACHE_TTL_MS,
	});
}

async function lookupPrimaryProvider(ip: string) {
	if (!IP_INTELLIGENCE_BASE_URL) {
		return { handled: false as const, reason: null };
	}

	if (primaryProviderCooldownExpiresAt > Date.now()) {
		return { handled: false as const, reason: null };
	}

	try {
		const response = await fetch(
			`${IP_INTELLIGENCE_BASE_URL}/${encodeURIComponent(ip)}`,
			{
				headers: {
					Accept: "application/json",
				},
			},
		);
		const rawBody = await response.text();

		if (!response.ok) {
			if (response.status === 403 || response.status === 429) {
				primaryProviderCooldownExpiresAt = applyProviderCooldown(
					"primary",
					response.status,
					rawBody,
					PROVIDER_RATE_LIMIT_TTL_MS,
					primaryProviderCooldownExpiresAt,
				);
				return { handled: false as const, reason: null };
			}

			if (response.status >= 500) {
				primaryProviderCooldownExpiresAt = applyProviderCooldown(
					"primary",
					response.status,
					rawBody,
					PROVIDER_ERROR_TTL_MS,
					primaryProviderCooldownExpiresAt,
				);
				return { handled: false as const, reason: null };
			}

			console.warn("IP intelligence primary lookup skipped", {
				ip,
				status: response.status,
				body: getFailurePreview(rawBody),
			});
			return { handled: false as const, reason: null };
		}

		const data = rawBody ? (JSON.parse(rawBody) as IpInfoResponse) : {};
		const threat = data.threat ?? {};
		const deny =
			threat.is_vpn === true || threat.is_datacenter === true;
		return {
			handled: true as const,
			reason: deny ? "VPN / datacenter connections are not allowed" : null,
		};
	} catch (error) {
		console.warn("IP intelligence primary lookup failed", {
			ip,
			error: error instanceof Error ? error.message : String(error),
		});
		return { handled: false as const, reason: null };
	}
}

function isIpv4InCidr(ip: string, network: string, prefixLength: number) {
	const octets = ip.split(".").map((part) => Number.parseInt(part, 10));
	const networkOctets = network.split(".").map((part) => Number.parseInt(part, 10));
	if (octets.length !== 4 || networkOctets.length !== 4) {
		return false;
	}

	let ipValue = 0;
	let networkValue = 0;
	for (let index = 0; index < 4; index += 1) {
		ipValue = (ipValue << 8) | octets[index];
		networkValue = (networkValue << 8) | networkOctets[index];
	}

	const mask =
		prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
	return (ipValue & mask) === (networkValue & mask);
}

export function isPrivateOrLoopbackIp(ip: string | null) {
	if (!ip) {
		return true;
	}

	const normalized = ip.trim().toLowerCase();
	if (
		normalized === "127.0.0.1" ||
		normalized === "::1" ||
		normalized === "::ffff:127.0.0.1"
	) {
		return true;
	}

	if (
		isIpv4InCidr(normalized, "10.0.0.0", 8) ||
		isIpv4InCidr(normalized, "172.16.0.0", 12) ||
		isIpv4InCidr(normalized, "192.168.0.0", 16) ||
		isIpv4InCidr(normalized, "127.0.0.0", 8) ||
		isIpv4InCidr(normalized, "169.254.0.0", 16)
	) {
		return true;
	}

	return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

export async function getIpDenyReason(ip: string | null): Promise<string | null> {
	if (
		!IP_INTELLIGENCE_ENABLED ||
		!ip ||
		isPrivateOrLoopbackIp(ip)
	) {
		return null;
	}

	const now = Date.now();
	const cached = requestCache.get(ip);
	if (cached && cached.expiresAt > now) {
		return cached.reason;
	}

	const primaryResult = await lookupPrimaryProvider(ip);
	if (primaryResult.handled) {
		cacheResolvedDecision(ip, primaryResult.reason);
		return primaryResult.reason;
	}

	cacheDecision(ip, null, LOOKUP_FAILURE_TTL_MS);
	return null;
}
