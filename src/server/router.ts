import type { RequestContext } from "./context";

export interface RateLimitConfig {
	key: string;
	max: number;
	windowMs: number;
}

export interface RouteDefinition {
	method: string;
	path: string;
	handler: (ctx: RequestContext) => Promise<Response> | Response;
	rateLimit?: RateLimitConfig;
}

function normalizePathname(pathname: string): string {
	if (pathname.length > 1 && pathname.endsWith("/")) {
		return pathname.slice(0, -1);
	}
	return pathname || "/";
}

function matchPath(
	pattern: string,
	pathname: string,
): Record<string, string> | null {
	const normalizedPattern = normalizePathname(pattern);
	const normalizedPathname = normalizePathname(pathname);

	const patternSegments = normalizedPattern.split("/").filter(Boolean);
	const pathnameSegments = normalizedPathname.split("/").filter(Boolean);

	if (patternSegments.length !== pathnameSegments.length) {
		return null;
	}

	const params: Record<string, string> = {};

	for (let index = 0; index < patternSegments.length; index += 1) {
		const patternSegment = patternSegments[index];
		const pathnameSegment = pathnameSegments[index];

		if (patternSegment.startsWith(":")) {
			params[patternSegment.slice(1)] = decodeURIComponent(pathnameSegment);
			continue;
		}

		if (patternSegment !== pathnameSegment) {
			return null;
		}
	}

	return params;
}

export function matchRoute(
	routes: RouteDefinition[],
	method: string,
	pathname: string,
): { route: RouteDefinition; params: Record<string, string> } | null {
	for (const route of routes) {
		if (route.method !== method) {
			continue;
		}

		const params = matchPath(route.path, pathname);
		if (params) {
			return { route, params };
		}
	}

	return null;
}
