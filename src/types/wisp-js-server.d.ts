declare module "@mercuryworkshop/wisp-js/server" {
	const server: {
		routeRequest: (request: unknown, socket: unknown, head: unknown) => void;
	};
	const logging: {
		DEBUG?: string | number;
		INFO?: string | number;
		WARN?: string | number;
		ERROR?: string | number;
		NONE?: string | number;
		setLevel?: (level: string | number) => void;
		set_level?: (level: string | number) => void;
		enable?: () => void;
		disable?: () => void;
	};

	export { logging, server };
}
