export const APP_PORT = Number.parseInt(process.env.PORT ?? "2000", 10) || 2000;

export const SESSION_COOKIE_NAME = "cherri_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const MAX_AVATAR_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_AVATAR_DIMENSION = 512;
export const AVATAR_WEBP_QUALITY = 82;
export const MAX_CHAT_MESSAGE_LENGTH = 2000;
export const ADMIN_DEFAULT_CHAT_MUTE_MINUTES = 10;

export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;
export const ROOM_NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export const RATE_LIMIT_WINDOWS = {
	minute: 60_000,
	day: 86_400_000,
} as const;

export const AI_ALLOWED_MODELS = new Set([
	"gpt-5.4-mini",
	"gpt-5.4",
	"gemini-3-flash-preview",
]);

export const AI_DEFAULT_MODEL = "gpt-5.4-mini";
export const AI_MAX_CONTEXT_MESSAGES = 15;
export const AI_MAX_MESSAGE_LENGTH = 8_000;

export const AI_OPENAI_BASE_URL = (
	process.env.AI_OPENAI_BASE_URL ??
	process.env.OPENAI_COMPAT_BASE_URL ??
	""
).trim();
export const AI_OPENAI_API_KEY = (
	process.env.AI_OPENAI_API_KEY ??
	process.env.OPENAI_API_KEY ??
	""
).trim();

export const TRUSTED_PROXY_IPS = (
	process.env.TRUSTED_PROXY_IPS ?? "127.0.0.1,::1,::ffff:127.0.0.1"
)
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean);

export const IP_INTELLIGENCE_ENABLED =
	(process.env.IP_INTELLIGENCE_ENABLED ?? "false").trim().toLowerCase() !==
	"false";
export const IP_INTELLIGENCE_BASE_URL = (
	process.env.IP_INTELLIGENCE_BASE_URL ?? ""
)
	.trim()
	.replace(/\/+$/, "");

export const IP_HEADER_NAMES = ["x-forwarded-for", "x-real-ip"] as const;

export const ALLOWED_AVATAR_MIME_TO_EXT: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
};

export const OWNER_USERNAMES = new Set<string>([]);

export const AUTO_PUNISHMENT_THRESHOLDS: {
	warnCount: number;
	action: "mute" | "ban";
	minutes?: number;
}[] = [
	{ warnCount: 3, action: "mute", minutes: 60 },
	{ warnCount: 5, action: "mute", minutes: 1440 },
	{ warnCount: 7, action: "ban" },
];

export const ADMIN_USERNAMES = new Set<string>([]);

export const ADMIN_USERNAMES_PANEL = new Set<string>([]);

export const SUPERADMIN = new Set<string>([]);
export const IMMUNE_USERNAMES = new Set<string>([]);

export const SOCKET_MAX_MESSAGES_PER_MINUTE = 120;
export const SOCKET_MAX_MESSAGES_PER_MINUTE_PER_IP = 600;

export const IMAGE_MODERATION_URL = (
	process.env.IMAGE_MODERATION_URL ?? ""
).trim();
export const IMAGE_MODERATION_MODEL = "omni-moderation-latest";

export type BadgeEntry =
	| { type: "icon"; icon: string; bg: string; color: string }
	| {
			type: "text";
			label: string;
			bg: string;
			color: string;
			marginLeft?: string;
	  };

export const BADGE_CONFIG: Record<string, BadgeEntry[]> = {};

export const SHIELD_USERS: string[] = [];
