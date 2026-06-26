import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { ROOM_NAME_REGEX } from "../config/constants";
import { db } from "../db/client";
import {
	channelMembers,
	channels,
	messages,
	users,
	ipBans,
	hwBans,
	userBlocks,
} from "../db/schema";
import { getRequestNetworkDetails, isTrustedOrigin } from "../lib/network";
import { getAuthenticatedUser } from "../lib/auth/session";
import { isAdminUser } from "../lib/admin";
import { toMessageResponseWithUser, toPublicUser } from "../lib/serializers";
import type { MessageResponse, PublicUser } from "../types/models";
import { checkIpBan, checkHwBan } from "../lib/ban";

type ChatEvent =
	| { type: "ready"; user: PublicUser }
	| {
			type: "subscribed";
			scope: "room" | "dm";
			room?: string;
			userId?: string;
	  }
	| {
			type: "presence_snapshot";
			scope: "room" | "dm";
			room?: string;
			userId?: string;
			users: PublicUser[];
	  }
	| {
			type: "presence_update";
			scope: "room" | "dm";
			room?: string;
			userId?: string;
			users: PublicUser[];
	  }
	| {
			type: "typing_update";
			scope: "room" | "dm";
			room?: string;
			userId?: string;
			users: PublicUser[];
	  }
	| { type: "message_created"; message: MessageResponse }
	| { type: "message_updated"; message: MessageResponse }
	| {
			type: "message_deleted";
			id: number;
			room: string | null;
			from: string;
			to: string | null;
	  }
	| { type: "dm_inbox_refresh" }
	| { type: "pong"; ts: number }
	| { type: "error"; error: string }
	| { type: "voice_joined"; room: string; user: PublicUser }
	| { type: "voice_left"; room: string; userId: string }
	| { type: "voice_offer"; from: string; sdp: RTCSessionDescriptionInit }
	| { type: "voice_answer"; from: string; sdp: RTCSessionDescriptionInit }
	| { type: "voice_ice"; from: string; candidate: RTCIceCandidateInit }
	| { type: "block_list"; blockedIds: string[] }
	| { type: "user_blocked"; blockedId: string }
	| { type: "user_unblocked"; blockedId: string }
| {
		type: "reactions_update";
		messageId: number;
		reactions: { emoji: string; count: number; users: string[] }[];
  }
| {
		type: "channel_activity";
		room: string;
		from_username: string;
		content: string;
  }
| {
		type: "moderation_warning";
		reason: string;
		issued_by: string;
  }
| {
		type: "friend_request";
		fromUserId: string;
		fromUsername: string;
		fromPfp: string;
  }
| {
		type: "friend_accepted";
		fromUserId: string;
		fromUsername: string;
		fromPfp: string;
  }
| {
		type: "game_invite";
		fromUserId: string;
		fromUsername: string;
		fromPfp: string;
		gameName: string;
		gameUrl: string;
  };

type IncomingChatEvent =
	| { type?: "ping" }
	| { type?: "subscribe_room"; room?: string }
	| { type?: "subscribe_dm"; userId?: string }
	| { type?: "typing_start" }
	| { type?: "typing_stop" }
	| { type?: "unsubscribe_all" }
	| { type: "voice_join"; room?: string }
	| { type: "voice_leave" }
	| { type: "voice_offer"; target?: string; sdp?: RTCSessionDescriptionInit }
	| { type: "voice_answer"; target?: string; sdp?: RTCSessionDescriptionInit }
	| { type: "voice_ice"; target?: string; candidate?: RTCIceCandidateInit }
	| { type: "block_user"; userId?: string }
	| { type: "unblock_user"; userId?: string }
	| { type: "reaction_toggle"; messageId?: number; emoji?: string };

export type ChatSocketData = {
	kind: "chat";
	socketId: string;
	userId: string;
	user: PublicUser;
	currentRoom: string | null;
	currentDmUserId: string | null;
	currentVoiceRoom: string | null;
	msgWindowStart?: number | null;
	msgCount?: number | null;
	clientIp?: string | null;
	blockedIds: Set<string>;
};

function sendEvent(
	socket: Bun.ServerWebSocket<ChatSocketData>,
	event: ChatEvent,
) {
	try {
		if (socket.getBufferedAmount() > 1024 * 1024) {
			socket.close(1011, "Buffer overflow");
			return;
		}
		socket.send(JSON.stringify(event));
	} catch {}
}

function dmKey(userA: string, userB: string) {
	return [userA, userB].sort().join(":");
}

async function loadBlockedIds(userId: string): Promise<Set<string>> {
	const rows = await db
		.select({ blockedId: userBlocks.blockedId })
		.from(userBlocks)
		.where(eq(userBlocks.blockerId, userId));
	return new Set(rows.map((r) => r.blockedId));
}

class ChatRealtimeHub {
	private sockets = new Map<string, Bun.ServerWebSocket<ChatSocketData>>();
	private socketsByUserId = new Map<string, Set<string>>();
	private roomSubscribers = new Map<string, Set<string>>();
	private dmSubscribers = new Map<string, Set<string>>();
	private roomTyping = new Map<string, Map<string, Timer>>();
	private dmTyping = new Map<string, Map<string, Timer>>();
	private voiceSubscribers = new Map<string, Set<string>>();
	private messageReactions = new Map<number, Map<string, Set<string>>>();

	register(socket: Bun.ServerWebSocket<ChatSocketData>) {
		this.sockets.set(socket.data.socketId, socket);
		let userSockets = this.socketsByUserId.get(socket.data.userId);
		if (!userSockets) {
			userSockets = new Set();
			this.socketsByUserId.set(socket.data.userId, userSockets);
		}
		userSockets.add(socket.data.socketId);
		sendEvent(socket, { type: "ready", user: socket.data.user });
		sendEvent(socket, {
			type: "block_list",
			blockedIds: Array.from(socket.data.blockedIds),
		});
	}

	unregister(socket: Bun.ServerWebSocket<ChatSocketData>) {
		const { socketId, userId, currentRoom, currentDmUserId } = socket.data;
		this.clearTyping(socket);
		this.leaveAll(socket);
		this.leaveVoiceRoom(socket);
		this.sockets.delete(socketId);
		const userSockets = this.socketsByUserId.get(userId);
		if (userSockets) {
			userSockets.delete(socketId);
			if (userSockets.size === 0) {
				this.socketsByUserId.delete(userId);
			}
		}

		if (currentRoom) this.broadcastRoomPresence(currentRoom);
		if (currentDmUserId) this.broadcastDmPresence(userId, currentDmUserId);
	}

	leaveAll(socket: Bun.ServerWebSocket<ChatSocketData>) {
		const { socketId, currentRoom, currentDmUserId, userId } = socket.data;
		this.clearTyping(socket);

		if (currentRoom) {
			const roomSet = this.roomSubscribers.get(currentRoom);
			roomSet?.delete(socketId);
			if (roomSet && roomSet.size === 0)
				this.roomSubscribers.delete(currentRoom);
		}

		if (currentDmUserId) {
			const key = dmKey(userId, currentDmUserId);
			const dmSet = this.dmSubscribers.get(key);
			dmSet?.delete(socketId);
			if (dmSet && dmSet.size === 0) this.dmSubscribers.delete(key);
		}

		socket.data.currentRoom = null;
		socket.data.currentDmUserId = null;
	}

	subscribeRoom(socket: Bun.ServerWebSocket<ChatSocketData>, room: string) {
		const previousRoom = socket.data.currentRoom;
		const previousDmUserId = socket.data.currentDmUserId;
		this.leaveAll(socket);

		let roomSet = this.roomSubscribers.get(room);
		if (!roomSet) {
			roomSet = new Set();
			this.roomSubscribers.set(room, roomSet);
		}
		roomSet.add(socket.data.socketId);
		socket.data.currentRoom = room;

		sendEvent(socket, { type: "subscribed", scope: "room", room });
		sendEvent(socket, {
			type: "presence_snapshot",
			scope: "room",
			room,
			users: this.getRoomPresence(room),
		});

		if (previousRoom && previousRoom !== room)
			this.broadcastRoomPresence(previousRoom);
		if (previousDmUserId)
			this.broadcastDmPresence(socket.data.userId, previousDmUserId);
		this.broadcastRoomPresence(room);
	}

	subscribeDm(
		socket: Bun.ServerWebSocket<ChatSocketData>,
		otherUserId: string,
	) {
		const previousRoom = socket.data.currentRoom;
		const previousDmUserId = socket.data.currentDmUserId;
		this.leaveAll(socket);

		const key = dmKey(socket.data.userId, otherUserId);
		let dmSet = this.dmSubscribers.get(key);
		if (!dmSet) {
			dmSet = new Set();
			this.dmSubscribers.set(key, dmSet);
		}
		dmSet.add(socket.data.socketId);
		socket.data.currentDmUserId = otherUserId;

		sendEvent(socket, {
			type: "subscribed",
			scope: "dm",
			userId: otherUserId,
		});
		sendEvent(socket, {
			type: "presence_snapshot",
			scope: "dm",
			userId: otherUserId,
			users: this.getDmPresence(socket.data.userId, otherUserId),
		});

		if (previousRoom) this.broadcastRoomPresence(previousRoom);
		if (previousDmUserId && previousDmUserId !== otherUserId)
			this.broadcastDmPresence(socket.data.userId, previousDmUserId);
		this.broadcastDmPresence(socket.data.userId, otherUserId);
	}

	publishMessageCreated(
		message: MessageResponse,
		senderBlockedIds?: Set<string>,
	) {
		this.clearTypingForMessage(message);

		if (message.room) {
			this.broadcastToRoom(
				message.room,
				{ type: "message_created", message },
				message.from,
				senderBlockedIds,
			);
			this.broadcastChannelActivity(
				message.room,
				message.username,
				message.content,
			);
			return;
		}

		this.broadcastToDmParticipants(message.from, message.to, {
			type: "message_created",
			message,
		});
		this.broadcastDmInboxRefresh(message.from, message.to);
	}

	publishMessageUpdated(message: MessageResponse) {
		if (message.room) {
			this.broadcastToRoom(message.room, {
				type: "message_updated",
				message,
			});
			return;
		}

		this.broadcastToDmParticipants(message.from, message.to, {
			type: "message_updated",
			message,
		});
		this.broadcastDmInboxRefresh(message.from, message.to);
	}

	publishMessageDeleted(message: MessageResponse) {
		const event: ChatEvent = {
			type: "message_deleted",
			id: message.id,
			room: message.room,
			from: message.from,
			to: message.to,
		};

		if (message.room) {
			this.broadcastToRoom(message.room, event);
			return;
		}

		this.broadcastToDmParticipants(message.from, message.to, event);
		this.broadcastDmInboxRefresh(message.from, message.to);
	}

	notifyBlocked(blockerId: string, blockedId: string) {
		this.broadcastToUser(blockerId, { type: "user_blocked", blockedId });
		const blockerSockets = this.socketsByUserId.get(blockerId);
		if (blockerSockets) {
			for (const socketId of blockerSockets) {
				const socket = this.sockets.get(socketId);
				if (socket) socket.data.blockedIds.add(blockedId);
			}
		}
	}

	notifyUnblocked(blockerId: string, blockedId: string) {
		this.broadcastToUser(blockerId, { type: "user_unblocked", blockedId });
		const blockerSockets = this.socketsByUserId.get(blockerId);
		if (blockerSockets) {
			for (const socketId of blockerSockets) {
				const socket = this.sockets.get(socketId);
				if (socket) socket.data.blockedIds.delete(blockedId);
			}
		}
	}

	setTyping(socket: Bun.ServerWebSocket<ChatSocketData>, isTyping: boolean) {
		if (socket.data.currentRoom) {
			this.setScopedTyping(
				this.roomTyping,
				socket.data.currentRoom,
				socket.data.userId,
				isTyping,
				() => this.broadcastRoomTyping(socket.data.currentRoom!),
			);
			return;
		}

		if (socket.data.currentDmUserId) {
			const key = dmKey(socket.data.userId, socket.data.currentDmUserId);
			this.setScopedTyping(
				this.dmTyping,
				key,
				socket.data.userId,
				isTyping,
				() =>
					this.broadcastDmTyping(
						socket.data.userId,
						socket.data.currentDmUserId!,
					),
			);
			return;
		}

	}

	joinVoiceRoom(socket: Bun.ServerWebSocket<ChatSocketData>, room: string) {
		const previous = socket.data.currentVoiceRoom;
		if (previous) this.leaveVoiceRoom(socket);

		let roomSet = this.voiceSubscribers.get(room);
		if (!roomSet) {
			roomSet = new Set();
			this.voiceSubscribers.set(room, roomSet);
		}

		roomSet.add(socket.data.socketId);
		socket.data.currentVoiceRoom = room;

		this.broadcastVoiceRoom(room, {
			type: "voice_joined",
			room,
			user: socket.data.user,
		});
	}

	leaveVoiceRoom(socket: Bun.ServerWebSocket<ChatSocketData>) {
		const room = socket.data.currentVoiceRoom;
		if (!room) return;

		const roomSet = this.voiceSubscribers.get(room);
		roomSet?.delete(socket.data.socketId);
		if (roomSet?.size === 0) this.voiceSubscribers.delete(room);

		this.broadcastVoiceRoom(room, {
			type: "voice_left",
			room,
			userId: socket.data.userId,
		});

		socket.data.currentVoiceRoom = null;
	}

	private setScopedTyping(
		store: Map<string, Map<string, Timer>>,
		scopeKey: string,
		userId: string,
		isTyping: boolean,
		broadcast: () => void,
	) {
		let typingUsers = store.get(scopeKey);
		if (!typingUsers && isTyping) {
			typingUsers = new Map();
			store.set(scopeKey, typingUsers);
		}

		if (!typingUsers) return;

		const previousTimer = typingUsers.get(userId);
		if (previousTimer) {
			clearTimeout(previousTimer);
			typingUsers.delete(userId);
		}

		if (isTyping) {
			const timer = setTimeout(() => {
				const active = store.get(scopeKey);
				if (!active) return;
				active.delete(userId);
				if (active.size === 0) store.delete(scopeKey);
				broadcast();
			}, 4000);
			typingUsers.set(userId, timer);
		}

		if (!isTyping && typingUsers.size === 0) store.delete(scopeKey);

		broadcast();
	}

	private clearTyping(socket: Bun.ServerWebSocket<ChatSocketData>) {
		if (socket.data.currentRoom) {
			this.removeScopedTyping(
				this.roomTyping,
				socket.data.currentRoom,
				socket.data.userId,
				() => this.broadcastRoomTyping(socket.data.currentRoom!),
			);
		}

		if (socket.data.currentDmUserId) {
			this.removeScopedTyping(
				this.dmTyping,
				dmKey(socket.data.userId, socket.data.currentDmUserId),
				socket.data.userId,
				() =>
					this.broadcastDmTyping(
						socket.data.userId,
						socket.data.currentDmUserId!,
					),
			);
		}

	}

	private removeScopedTyping(
		store: Map<string, Map<string, Timer>>,
		scopeKey: string,
		userId: string,
		broadcast: () => void,
	) {
		const typingUsers = store.get(scopeKey);
		if (!typingUsers) return;

		const timer = typingUsers.get(userId);
		if (timer) {
			clearTimeout(timer);
			typingUsers.delete(userId);
		}

		if (typingUsers.size === 0) store.delete(scopeKey);

		broadcast();
	}

	private clearTypingForMessage(message: MessageResponse) {
		if (message.room) {
			this.removeScopedTyping(
				this.roomTyping,
				message.room,
				message.from,
				() => this.broadcastRoomTyping(message.room!),
			);
			return;
		}

		if (message.to) {
			this.removeScopedTyping(
				this.dmTyping,
				dmKey(message.from, message.to),
				message.from,
				() => this.broadcastDmTyping(message.from, message.to!),
			);
		}
	}

	private broadcastDmInboxRefresh(
		fromUserId: string,
		toUserId: string | null,
	) {
		this.broadcastToUser(fromUserId, { type: "dm_inbox_refresh" });
		if (toUserId)
			this.broadcastToUser(toUserId, { type: "dm_inbox_refresh" });
	}

	private broadcastChannelActivity(
		room: string,
		fromUsername: string,
		content: string,
	) {
		const event: ChatEvent = {
			type: "channel_activity",
			room,
			from_username: fromUsername,
			content,
		};
		const roomSubscriberIds = this.roomSubscribers.get(room) ?? new Set();
		for (const [, socket] of this.sockets) {
			
			if (roomSubscriberIds.has(socket.data.socketId)) continue;
			sendEvent(socket, event);
		}
	}

	private broadcastToRoom(
		room: string,
		event: ChatEvent,
		senderId?: string,
		senderBlockedIds?: Set<string>,
	) {
		const socketIds = this.roomSubscribers.get(room);
		if (!socketIds) return;

		for (const socketId of socketIds) {
			const socket = this.sockets.get(socketId);
			if (!socket) continue;

			const isBlockedBySelf =
				senderId && socket.data.blockedIds.has(senderId);
			const isBlockedByThem =
				senderBlockedIds &&
				senderId !== socket.data.userId &&
				senderBlockedIds.has(socket.data.userId);

			if (
				(isBlockedBySelf || isBlockedByThem) &&
				event.type === "message_created"
			) {
				sendEvent(socket, {
					...event,
					message: { ...event.message, blocked: true },
				});
				continue;
			}

			sendEvent(socket, event);
		}
	}

	private broadcastToDmParticipants(
		fromUserId: string,
		toUserId: string | null,
		event: ChatEvent,
	) {
		this.broadcastToUser(fromUserId, event);
		if (toUserId) this.broadcastToUser(toUserId, event);
	}

	sendToUser(userId: string, event: ChatEvent) {
		this.broadcastToUser(userId, event);
	}

	private broadcastToUser(userId: string, event: ChatEvent) {
		const socketIds = this.socketsByUserId.get(userId);
		if (!socketIds) return;

		for (const socketId of socketIds) {
			const socket = this.sockets.get(socketId);
			if (socket) sendEvent(socket, event);
		}
	}

	private broadcastVoiceRoom(room: string, event: ChatEvent) {
		const socketIds = this.voiceSubscribers.get(room);
		if (!socketIds) return;

		for (const socketId of socketIds) {
			const socket = this.sockets.get(socketId);
			if (socket) sendEvent(socket, event);
		}
	}

	forwardVoiceOffer(
		from: string,
		target: string,
		sdp: RTCSessionDescriptionInit,
	) {
		this.broadcastToUser(target, { type: "voice_offer", from, sdp });
	}

	forwardVoiceAnswer(
		from: string,
		target: string,
		sdp: RTCSessionDescriptionInit,
	) {
		this.broadcastToUser(target, { type: "voice_answer", from, sdp });
	}

	forwardVoiceIce(
		from: string,
		target: string,
		candidate: RTCIceCandidateInit,
	) {
		this.broadcastToUser(target, { type: "voice_ice", from, candidate });
	}

	toggleReaction(
		socket: Bun.ServerWebSocket<ChatSocketData>,
		messageId: number,
		emoji: string,
	) {
		let msgReactions = this.messageReactions.get(messageId);
		if (!msgReactions) {
			msgReactions = new Map();
			this.messageReactions.set(messageId, msgReactions);
		}

		let userSet = msgReactions.get(emoji);
		if (!userSet) {
			userSet = new Set();
			msgReactions.set(emoji, userSet);
		}

		if (userSet.has(socket.data.userId)) {
			userSet.delete(socket.data.userId);
			if (userSet.size === 0) msgReactions.delete(emoji);
		} else {
			userSet.add(socket.data.userId);
		}

		if (msgReactions.size === 0) this.messageReactions.delete(messageId);

		const reactions = this.buildReactionPayload(messageId);
		const event: ChatEvent = { type: "reactions_update", messageId, reactions };

		if (socket.data.currentRoom) {
			this.broadcastToRoom(socket.data.currentRoom, event);
		} else if (socket.data.currentDmUserId) {
			this.broadcastToDmParticipants(
				socket.data.userId,
				socket.data.currentDmUserId,
				event,
			);
		}
	}

	private buildReactionPayload(
		messageId: number,
	): { emoji: string; count: number; users: string[] }[] {
		const msgReactions = this.messageReactions.get(messageId);
		if (!msgReactions) return [];
		return Array.from(msgReactions.entries())
			.filter(([, users]) => users.size > 0)
			.map(([emoji, users]) => ({
				emoji,
				count: users.size,
				users: Array.from(users),
			}));
	}

	private getRoomPresence(room: string) {
		return this.collectUniqueUsers(this.roomSubscribers.get(room));
	}

	private getDmPresence(userA: string, userB: string) {
		return this.collectUniqueUsers(
			this.dmSubscribers.get(dmKey(userA, userB)),
		);
	}

	private collectUniqueUsers(socketIds: Set<string> | undefined) {
		if (!socketIds) return [];

		const usersById = new Map<string, PublicUser>();
		for (const socketId of socketIds) {
			const socket = this.sockets.get(socketId);
			if (!socket) continue;
			usersById.set(socket.data.userId, socket.data.user);
		}

		return Array.from(usersById.values()).sort((a, b) =>
			a.username.localeCompare(b.username),
		);
	}

	private broadcastRoomPresence(room: string) {
		this.broadcastToRoom(room, {
			type: "presence_update",
			scope: "room",
			room,
			users: this.getRoomPresence(room),
		});
	}

	private broadcastDmPresence(userA: string, userB: string) {
		const users = this.getDmPresence(userA, userB);
		this.broadcastToUser(userA, {
			type: "presence_update",
			scope: "dm",
			userId: userB,
			users,
		});
		this.broadcastToUser(userB, {
			type: "presence_update",
			scope: "dm",
			userId: userA,
			users,
		});
	}

	private getTypingUsers(
		store: Map<string, Map<string, Timer>>,
		scopeKey: string,
	) {
		const typingUsers = store.get(scopeKey);
		if (!typingUsers) return [];

		const users: PublicUser[] = [];
		for (const userId of typingUsers.keys()) {
			const socketIds = this.socketsByUserId.get(userId);
			if (!socketIds || socketIds.size === 0) continue;
			const firstSocketId = socketIds.values().next().value;
			const socket = firstSocketId ? this.sockets.get(firstSocketId) : null;
			if (socket) users.push(socket.data.user);
		}

		return users.sort((a, b) => a.username.localeCompare(b.username));
	}

	private broadcastRoomTyping(room: string) {
		this.broadcastToRoom(room, {
			type: "typing_update",
			scope: "room",
			room,
			users: this.getTypingUsers(this.roomTyping, room),
		});
	}

	private broadcastDmTyping(userA: string, userB: string) {
		const key = dmKey(userA, userB);
		const users = this.getTypingUsers(this.dmTyping, key);
		this.broadcastToUser(userA, {
			type: "typing_update",
			scope: "dm",
			userId: userB,
			users,
		});
		this.broadcastToUser(userB, {
			type: "typing_update",
			scope: "dm",
			userId: userA,
			users,
		});
	}
}

const chatHub = new ChatRealtimeHub();

async function canAccessRoom(userId: string, username: string, room: string) {
	const channelRows = await db
		.select()
		.from(channels)
		.where(eq(channels.name, room))
		.limit(1);

	if (channelRows.length === 0 || !channelRows[0].private) return true;
	if (isAdminUser(username)) return true;

	const memberRows = await db
		.select()
		.from(channelMembers)
		.where(
			and(
				eq(channelMembers.channelName, room),
				eq(channelMembers.userId, userId),
			),
		)
		.limit(1);

	return memberRows.length > 0;
}

async function canAccessDm(userId: string, otherUserId: string) {
	if (!otherUserId || otherUserId === userId) return false;

	const rows = await db
		.select()
		.from(users)
		.where(eq(users.id, otherUserId))
		.limit(1);
	if (rows.length === 0) return false;

	const block = await db
		.select()
		.from(userBlocks)
		.where(
			or(
				and(
					eq(userBlocks.blockerId, userId),
					eq(userBlocks.blockedId, otherUserId),
				),
				and(
					eq(userBlocks.blockerId, otherUserId),
					eq(userBlocks.blockedId, userId),
				),
			),
		)
		.limit(1);

	return block.length === 0;
}

export async function handleChatSocketRequest(
	request: Request,
	url: URL,
	server: Bun.Server<ChatSocketData>,
) {
	if (url.pathname !== "/ws/chat") return undefined;

	if (!isTrustedOrigin(request)) {
		return new Response("Cross-origin websocket connections not allowed", {
			status: 403,
		});
	}

	const remoteAddress = server.requestIP
		? (server.requestIP(request)?.address ?? null)
		: null;
	const net = getRequestNetworkDetails(request, remoteAddress);

	if (net.clientIp) {
		try {
			const banned = await checkIpBan(net.clientIp);
			if (banned) {
				return new Response("You are banned from this server", {
					status: 403,
				});
			}
		} catch (error) {
			console.error("Failed to query ip_bans table", { error });
		}
	}

	const auth = await getAuthenticatedUser(request);
	if (!auth) {
		return new Response("Authentication required", { status: 401 });
	}

	const clientHwid = url.searchParams.get("hwid");
	const storedHwid = auth.userRow.hwid;

	const hwid = storedHwid ?? clientHwid ?? null;

	if (clientHwid && !storedHwid) {
		await db
			.update(users)
			.set({ hwid: clientHwid })
			.where(eq(users.id, auth.user.id));
	}

	if (hwid) {
		if (hwid !== auth.userRow?.hwid) {
			await db.update(users).set({ hwid }).where(eq(users.id, auth.user.id));
		}

		const hwBanned = await checkHwBan(hwid);
		if (hwBanned) {
			return new Response("You are banned from this server", {
				status: 403,
			});
		}

		if (net.clientIp) {
			const existingBan = await db
				.select()
				.from(hwBans)
				.where(eq(hwBans.hwid, hwid))
				.get();
			if (!existingBan && net.clientIp) {
				const ipBan = await db
					.select()
					.from(ipBans)
					.where(eq(ipBans.ip, net.clientIp))
					.limit(1);
				if (ipBan.length > 0) {
					return new Response("You are banned from this server", {
						status: 403,
					});
				}
			}
		}
	}

	const blockedIds = await loadBlockedIds(auth.user.id);

	const upgraded = server.upgrade(request, {
		data: {
			kind: "chat",
			socketId: randomUUID(),
			userId: auth.user.id,
			user: auth.user,
			currentRoom: null,
			currentDmUserId: null,
			currentVoiceRoom: null,
			msgWindowStart: Date.now(),
			msgCount: 0,
			clientIp: net.clientIp ?? null,
			blockedIds,
		},
	});

	if (!upgraded) {
		return new Response("Failed to upgrade websocket", { status: 500 });
	}

	return undefined;
}

export const chatWebSocketHandler: Bun.WebSocketHandler<ChatSocketData> = {
	open(socket) {
		chatHub.register(socket);
	},

	async message(socket, rawMessage) {
			

		let payload: IncomingChatEvent | null = null;
		try {
			payload = JSON.parse(String(rawMessage)) as IncomingChatEvent;
		} catch {
			sendEvent(socket, {
				type: "error",
				error: "Invalid websocket payload",
			});
			return;
		}

		if (!payload || typeof payload !== "object") {
			sendEvent(socket, {
				type: "error",
				error: "Invalid websocket payload",
			});
			return;
		}

		switch (payload.type) {
			case "ping":
			case undefined:
				sendEvent(socket, { type: "pong", ts: Date.now() });
				return;

			case "unsubscribe_all":
				chatHub.setTyping(socket, false);
				chatHub.leaveAll(socket);
				return;

			case "subscribe_room": {
				const room = String(payload.room || "");
				if (!ROOM_NAME_REGEX.test(room)) {
					sendEvent(socket, { type: "error", error: "Invalid room name" });
					return;
				}
				if (
					!(await canAccessRoom(
						socket.data.userId,
						socket.data.user.username,
						room,
					))
				) {
					sendEvent(socket, {
						type: "error",
						error: "Not a member of this channel",
					});
					return;
				}
				chatHub.subscribeRoom(socket, room);
				return;
			}

			case "subscribe_dm": {
				const otherUserId = String(payload.userId || "");
				if (!(await canAccessDm(socket.data.userId, otherUserId))) {
					sendEvent(socket, { type: "error", error: "Invalid recipient" });
					return;
				}
				chatHub.subscribeDm(socket, otherUserId);
				return;
			}

			case "typing_start":
				chatHub.setTyping(socket, true);
				return;

			case "typing_stop":
				chatHub.setTyping(socket, false);
				return;

			case "block_user": {
				const targetId = String(payload.userId || "");
				if (!targetId || targetId === socket.data.userId) return;
				try {
					await db
						.insert(userBlocks)
						.values({
							blockerId: socket.data.userId,
							blockedId: targetId,
							createdAt: new Date().toISOString(),
						})
						.onConflictDoNothing();
					chatHub.notifyBlocked(socket.data.userId, targetId);
				} catch {}
				return;
			}

			case "unblock_user": {
				const targetId = String(payload.userId || "");
				if (!targetId) return;
				try {
					await db
						.delete(userBlocks)
						.where(
							and(
								eq(userBlocks.blockerId, socket.data.userId),
								eq(userBlocks.blockedId, targetId),
							),
						);
					chatHub.notifyUnblocked(socket.data.userId, targetId);
				} catch {}
				return;
			}

			case "voice_join": {
				const room = String(payload.room || "");
				const isDmVoice = room.startsWith("dm:");
				if (!isDmVoice && !ROOM_NAME_REGEX.test(room)) {
					sendEvent(socket, { type: "error", error: "Invalid room name" });
					return;
				}
				chatHub.joinVoiceRoom(socket, room);
				return;
			}

			case "voice_leave":
				chatHub.leaveVoiceRoom(socket);
				return;

			case "voice_offer":
				if (payload.target && payload.sdp) {
					chatHub.forwardVoiceOffer(
						socket.data.userId,
						payload.target,
						payload.sdp,
					);
				}
				return;

			case "voice_answer":
				if (payload.target && payload.sdp) {
					chatHub.forwardVoiceAnswer(
						socket.data.userId,
						payload.target,
						payload.sdp,
					);
				}
				return;

			case "voice_ice":
				if (payload.target && payload.candidate) {
					chatHub.forwardVoiceIce(
						socket.data.userId,
						payload.target,
						payload.candidate,
					);
				}
				return;

			case "reaction_toggle": {
				const messageId = Number(payload.messageId || 0);
				const emoji = String(payload.emoji || "").trim();
				if (!messageId || !emoji || emoji.length > 12) return;
				chatHub.toggleReaction(socket, messageId, emoji);
				return;
			}

			default:
				sendEvent(socket, {
					type: "error",
					error: "Unsupported websocket event",
				});
		}
	},

	close(socket) {
		chatHub.unregister(socket);
	},

	drain(_socket) {},
};

export function publishMessageCreated(
	message: MessageResponse,
	senderBlockedIds?: Set<string>,
) {
	chatHub.publishMessageCreated(message, senderBlockedIds);
}

export function publishMessageUpdated(message: MessageResponse) {
	chatHub.publishMessageUpdated(message);
}

export function publishMessageDeleted(message: MessageResponse) {
	chatHub.publishMessageDeleted(message);
}

export function sendModerationWarning(
	userId: string,
	reason: string,
	issuedBy: string,
) {
	chatHub.sendToUser(userId, {
		type: "moderation_warning",
		reason,
		issued_by: issuedBy,
	});
}

export function sendFriendRequest(
	toUserId: string,
	fromUserId: string,
	fromUsername: string,
	fromPfp: string,
) {
	chatHub.sendToUser(toUserId, { type: "friend_request", fromUserId, fromUsername, fromPfp });
}

export function sendFriendAccepted(
	toUserId: string,
	fromUserId: string,
	fromUsername: string,
	fromPfp: string,
) {
	chatHub.sendToUser(toUserId, { type: "friend_accepted", fromUserId, fromUsername, fromPfp });
}

export function sendGameInvite(
	toUserId: string,
	fromUserId: string,
	fromUsername: string,
	fromPfp: string,
	gameName: string,
	gameUrl: string,
) {
	chatHub.sendToUser(toUserId, { type: "game_invite", fromUserId, fromUsername, fromPfp, gameName, gameUrl });
}

export async function loadMessageById(id: number) {
	const rows = await db
		.select({ message: messages, sender: users })
		.from(messages)
		.innerJoin(users, eq(users.id, messages.fromUserId))
		.where(eq(messages.id, id))
		.limit(1);

	return rows[0]
		? toMessageResponseWithUser(rows[0].message, rows[0].sender)
		: null;
}
