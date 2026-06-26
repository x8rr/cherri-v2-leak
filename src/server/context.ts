import { getAuthenticatedUser } from "../lib/auth/session";
import { getRequestNetworkDetails } from "../lib/network";
import type { AuthenticatedUser } from "../types/models";

export class RequestContext {
	private bodyLoaded = false;
	private bodyValue: unknown | null = null;
	private authPromise: Promise<AuthenticatedUser | null> | null = null;

	readonly network;
	readonly clientIp: string | null;

	constructor(
		public readonly request: Request,
		public readonly url: URL,
		public readonly params: Record<string, string>,
		public readonly remoteAddress: string | null,
	) {
		this.network = getRequestNetworkDetails(request, remoteAddress);
		this.clientIp = this.network.clientIp;
	}

	async jsonBody<T = unknown>(): Promise<T | null> {
		if (this.bodyLoaded) {
			return this.bodyValue as T | null;
		}

		this.bodyLoaded = true;
		if (!this.request.body) {
			this.bodyValue = null;
			return null;
		}

		try {
			this.bodyValue = (await this.request.json()) as T;
		} catch {
			this.bodyValue = null;
		}

		return this.bodyValue as T | null;
	}

	async auth(): Promise<AuthenticatedUser | null> {
		this.authPromise ??= getAuthenticatedUser(this.request);
		return this.authPromise;
	}
}
