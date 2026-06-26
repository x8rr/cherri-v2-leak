import { IP_HEADER_NAMES, TRUSTED_PROXY_IPS } from "../config/constants";

export interface RequestNetworkDetails {
	clientIp: string | null;
	ipChain: string[];
	headers: Record<string, string>;
}

export function normalizeIpCandidate(value: unknown): string {
	let candidate = String(value ?? "")
		.trim()
		.replace(/^for=/i, "")
		.replace(/^"|"$/g, "");

	if (!candidate || candidate.toLowerCase() === "unknown") {
		return "";
	}

	if (candidate.startsWith("[") && candidate.includes("]")) {
		candidate = candidate.slice(1, candidate.indexOf("]"));
	}

	if (candidate.includes(":") && candidate.includes(".")) {
		const lastColonIndex = candidate.lastIndexOf(":");
		const lastDotIndex = candidate.lastIndexOf(".");
		if (lastColonIndex > lastDotIndex) {
			candidate = candidate.slice(0, lastColonIndex);
		}
	}

	return candidate.trim();
}

function isTrustedProxyAddress(remoteAddress: string | null) {
	const candidate = normalizeIpCandidate(remoteAddress);
	return Boolean(candidate) && TRUSTED_PROXY_IPS.includes(candidate);
}

function getForwardedForValues(headerValue: string): string[] {
	return headerValue
		.split(",")
		.map((value) => normalizeIpCandidate(value))
		.filter(Boolean);
}

function getForwardedHeaderValues(headerValue: string): string[] {
	const values: string[] = [];
	const matches = headerValue.matchAll(/for=("?)(\[[^\]]+\]|[^;,"]+)\1/gi);
	for (const match of matches) {
		const candidate = normalizeIpCandidate(match[2]);
		if (candidate) {
			values.push(candidate);
		}
	}
	return values;
}

export function getRequestNetworkDetails(
	request: Request,
	remoteAddress: string | null = null,
): RequestNetworkDetails {
	const ipChain: string[] = [];
	const trustedProxy = isTrustedProxyAddress(remoteAddress);

	const pushCandidate = (value: unknown) => {
		const candidate = normalizeIpCandidate(value);
		if (candidate && !ipChain.includes(candidate)) {
			ipChain.push(candidate);
		}
	};

	if (trustedProxy) {
		for (const value of getForwardedForValues(
			request.headers.get("x-forwarded-for") ?? "",
		)) {
			pushCandidate(value);
		}

		const xRealIp = request.headers.get("x-real-ip");
		if (xRealIp) {
			pushCandidate(xRealIp);
		}
	}

	const headers: Record<string, string> = {};
	for (const headerName of IP_HEADER_NAMES) {
		const headerValue = request.headers.get(headerName);
		if (headerValue) {
			headers[headerName] = headerValue;
		}
	}

	pushCandidate(remoteAddress);

	if (remoteAddress) {
		headers.remoteAddress = remoteAddress;
	}

	return {
		clientIp: ipChain[0] ?? null,
		ipChain,
		headers,
	};
}

export function isTrustedOrigin(request: Request): boolean {
	const origin = request.headers.get("origin");
	if (!origin) {
		return true;
	}

	try {
		const originHost = new URL(origin).host;
		const requestHost = request.headers.get("host");
		return Boolean(requestHost) && originHost === requestHost;
	} catch {
		return false;
	}
}
