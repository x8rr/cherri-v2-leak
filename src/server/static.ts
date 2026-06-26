import { extname, resolve } from "node:path";
import { publicPath } from "../config/paths";

function resolvePublicCandidate(pathname: string): string[] {
	if (pathname === "/") {
		return ["/index.html"];
	}

	if (pathname.endsWith("/")) {
		return [`${pathname}index.html`];
	}

	const candidates = [pathname];
	if (!extname(pathname)) {
		candidates.push(`${pathname}.html`, `${pathname}/index.html`);
	}

	return candidates;
}

const MAX_PATH_COMPONENT_BYTES = 255;

function toSafePath(candidate: string): string | null {
	const sanitized = candidate.startsWith("/") ? candidate : `/${candidate}`;
	const resolved = resolve(publicPath, `.${sanitized}`);
	if (!resolved.startsWith(publicPath)) {
		return null;
	}

	for (const segment of resolved.split(/[\\/]/)) {
		if (Buffer.byteLength(segment, "utf8") > MAX_PATH_COMPONENT_BYTES) {
			return null;
		}
	}

	return resolved;
}

function getStaticCacheControl(absolutePath: string): string {
	const extension = extname(absolutePath).toLowerCase();
	const normalizedPath = absolutePath.replaceAll("\\", "/");

	if (extension === ".html") {
		return "no-store, no-cache, must-revalidate";
	}

	if (
		normalizedPath.includes("/assets/js/") ||
		normalizedPath.includes("/assets/css/") ||
		extension === ".js" ||
		extension === ".mjs" ||
		extension === ".css" ||
		extension === ".wasm" ||
		extension === ".json"
	) {
		return "public, max-age=0, s-maxage=3600, stale-while-revalidate=120";
	}

	return "public, max-age=0, s-maxage=86400, stale-while-revalidate=3600";
}

export async function servePublicAsset(
	pathname: string,
): Promise<Response | null> {
	for (const candidate of resolvePublicCandidate(pathname)) {
		const safePath = toSafePath(candidate);
		if (!safePath) {
			continue;
		}

		const file = Bun.file(safePath);
		let exists = false;
		try {
			exists = await file.exists();
		} catch {
			continue;
		}
		if (!exists) {
			continue;
		}

		const headers = new Headers();
		if (file.type) {
			headers.set("Content-Type", file.type);
		}
		headers.set("Cache-Control", getStaticCacheControl(safePath));
		headers.set("Cross-Origin-Resource-Policy", "cross-origin");
		if (extname(safePath).toLowerCase() === ".html") {
			headers.set("Pragma", "no-cache");
			headers.set("Expires", "0");
		}

		return new Response(file, { headers });
	}

	return null;
}
