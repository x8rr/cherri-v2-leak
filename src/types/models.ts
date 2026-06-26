import type { InferSelectModel } from "drizzle-orm";
import type {
	auditLogs,
	channelMembers,
	channels,
	cloudSaves,
	ipBans,
	messages,
	moderationTickets,
	sessions,
	users,
} from "../db/schema";

export type UserRow = InferSelectModel<typeof users>;
export type SessionRow = InferSelectModel<typeof sessions>;
export type MessageRow = InferSelectModel<typeof messages>;
export type AuditLogRow = InferSelectModel<typeof auditLogs>;
export type CloudSaveRow = InferSelectModel<typeof cloudSaves>;
export type ChannelRow = InferSelectModel<typeof channels>;
export type ChannelMemberRow = InferSelectModel<typeof channelMembers>;
export type IpBanRow = InferSelectModel<typeof ipBans>;
export type ModerationTicketRow = InferSelectModel<typeof moderationTickets>;

export interface PublicUser {
	id: string;
	username: string;
	display: string;
	badges: string[];
	pfp: string;
	bio: string | null;
	bannerUrl: string | null;
	created_at: string;
	trusted: boolean;
}

export interface MessageResponse {
	id: number;
	from: string;
	username: string;
	display: string;
	avatar_url: string;
	content: string;
	badges: string[];
	sent_at: string;
	room: string | null;
	to: string | null;
	reply_to_id: number | null;
	message_type: string;
	attachment_url: string | null;
	blocked?: boolean;
	trusted?: boolean;
}

export interface AuthenticatedUser {
	sessionToken: string;
	sessionHash: string;
	session: SessionRow;
	userRow: UserRow;
	user: PublicUser;
}
