import { parseJsonArray } from "./parsing";
import type {
	CloudSaveRow,
	MessageResponse,
	MessageRow,
	PublicUser,
	UserRow,
} from "../types/models";

export function toPublicUser(userRow: UserRow): PublicUser {
	return {
		id: userRow.id,
		username: userRow.username,
		display: userRow.display,
		badges: parseJsonArray<string>(userRow.badges, ["user"]),
		pfp: userRow.pfp || "/assets/img/fav.png",
		bio: userRow.bio ?? null,
		bannerUrl: userRow.bannerUrl ?? null,
		created_at: userRow.createdAt,
		trusted: userRow.trustedUser ?? false,
	};
}

export function toMessageResponse(messageRow: MessageRow): MessageResponse {
	return {
		id: messageRow.id,
		from: messageRow.fromUserId,
		username: messageRow.username,
		display: messageRow.username,
		avatar_url: messageRow.avatarUrl,
		content: messageRow.content,
		badges: parseJsonArray<string>(messageRow.badges, []),
		sent_at: messageRow.sentAt,
		room: messageRow.room ?? null,
		to: messageRow.toUserId ?? null,
		reply_to_id: messageRow.replyToId ?? null,
		message_type: messageRow.messageType ?? "text",
		attachment_url: messageRow.attachmentUrl ?? null,
	};
}

export function toMessageResponseWithUser(
	messageRow: MessageRow,
	userRow: UserRow | null | undefined,
): MessageResponse {
	return {
		id: messageRow.id,
		from: messageRow.fromUserId,
		username: userRow?.username || messageRow.username,
		display: userRow?.display || userRow?.username || messageRow.username,
		avatar_url: userRow?.pfp || messageRow.avatarUrl,
		content: messageRow.content,
		badges: userRow
			? parseJsonArray<string>(userRow.badges, [])
			: parseJsonArray<string>(messageRow.badges, []),
		sent_at: messageRow.sentAt,
		room: messageRow.room ?? null,
		to: messageRow.toUserId ?? null,
		reply_to_id: messageRow.replyToId ?? null,
		message_type: messageRow.messageType ?? "text",
		attachment_url: messageRow.attachmentUrl ?? null,
		trusted: userRow?.trustedUser ?? false,
	};
}

export function toCloudSaveResponse(row: CloudSaveRow) {
	let parsed: Record<string, unknown> = {};
	try {
		const candidate = JSON.parse(row.ls);
		if (
			candidate &&
			typeof candidate === "object" &&
			!Array.isArray(candidate)
		) {
			parsed = candidate as Record<string, unknown>;
		}
	} catch {
		parsed = {};
	}

	return {
		ls: parsed,
		updated_at: row.updatedAt,
	};
}
