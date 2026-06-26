export function json(data: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	if (!headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json; charset=utf-8");
	}

	return new Response(JSON.stringify(data), {
		...init,
		headers,
	});
}

export function text(body: string, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	if (!headers.has("Content-Type")) {
		headers.set("Content-Type", "text/plain; charset=utf-8");
	}

	return new Response(body, {
		...init,
		headers,
	});
}

export function noContent(init: ResponseInit = {}): Response {
	return new Response(null, {
		status: init.status ?? 204,
		headers: init.headers,
		statusText: init.statusText,
	});
}

export function applyStandardHeaders(
	response: Response,
	pathname: string,
): Response {
	const headers = new Headers(response.headers);
	headers.set("Cross-Origin-Resource-Policy", "cross-origin");

	if (pathname.startsWith("/api/")) {
		headers.set(
			"Cache-Control",
			"private, no-store, no-cache, must-revalidate",
		);
		headers.set("Pragma", "no-cache");
		headers.set("Expires", "0");
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
