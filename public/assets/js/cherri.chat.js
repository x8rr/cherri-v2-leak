import {
	apiRequest,
	escapeChars,
	getData,
	getMetaData,
	EMOJI_MAP,
} from "./cherri.exports.js";

const CHAT_FALLBACK_POLL_INTERVAL_MS = 15000;
const DM_INBOX_POLL_INTERVAL_MS = 15000;
const SOCKET_RECONNECT_DELAY_MS = 3000;
const SOCKET_RECONNECT_MAX_DELAY_MS = 30000;


const SOCKET_RATE_LIMIT_BACKOFF_MS = 60000;
const DM_INBOX_POLL_DEBOUNCE_MS = 1000;
const TYPING_IDLE_MS = 2200;
const PAGE_SIZE = 50;
const MAX_MESSAGE_LENGTH = 1500;
let _badgeConfigCache = null;

async function fetchBadgeConfig() {
	if (_badgeConfigCache) return _badgeConfigCache;
	try {
		const data = await apiRequest("/api/badges");
		_badgeConfigCache = data;
		return data;
	} catch {
		return { badges: {}, shieldUsers: [], prideUsers: [] };
	}
}

function escapeHtml(text) {
	return String(text)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function showToast(message, type = "info") {
	const container = document.getElementById("toast-container");
	if (!container) return;
	const icons = { success: "check-circle", error: "times-circle", info: "info-circle", warning: "exclamation-triangle" };
	const toast = document.createElement("div");
	toast.className = `chat-toast chat-toast-${type}`;
	toast.innerHTML = `<i class="fas fa-${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span>`;
	container.appendChild(toast);
	requestAnimationFrame(() => toast.classList.add("chat-toast-visible"));
	setTimeout(() => {
		toast.classList.remove("chat-toast-visible");
		setTimeout(() => toast.remove(), 300);
	}, 3500);
}

function formatRelativeTime(dateStr) {
	const date = new Date(dateStr);
	const diff = Date.now() - date.getTime();
	if (diff < 60000) return "just now";
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
	if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}


let _audioCtx = null;
function getAudioCtx() {
	if (!_audioCtx) {
		try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
	}
	return _audioCtx;
}
function isSoundEnabled() { return localStorage.getItem("cherri_sounds") !== "0"; }
function setSoundEnabled(on) {
	localStorage.setItem("cherri_sounds", on ? "1" : "0");
	const btn = document.getElementById("sound-toggle-btn");
	if (btn) btn.innerHTML = on ? '<i class="fas fa-volume-high"></i>' : '<i class="fas fa-volume-xmark"></i>';
}

function playMentionSound() {
	if (!isSoundEnabled()) return;
	const ctx = getAudioCtx();
	if (!ctx) return;
	
	[784, 988].forEach((freq, i) => {
		const t = ctx.currentTime + i * 0.11;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "sine";
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.frequency.setValueAtTime(freq, t);
		gain.gain.setValueAtTime(0, t);
		gain.gain.linearRampToValueAtTime(0.38, t + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
		osc.start(t);
		osc.stop(t + 0.55);
	});
}

function playMessageSound() {
	if (!isSoundEnabled()) return;
	const ctx = getAudioCtx();
	if (!ctx) return;
	
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = "sine";
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.frequency.setValueAtTime(660, ctx.currentTime);
	osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
	gain.gain.setValueAtTime(0, ctx.currentTime);
	gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
	osc.start(ctx.currentTime);
	osc.stop(ctx.currentTime + 0.18);
}

function playDmSound() {
	if (!isSoundEnabled()) return;
	const ctx = getAudioCtx();
	if (!ctx) return;
	
	[523, 659].forEach((freq, i) => {
		const t = ctx.currentTime + i * 0.13;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "triangle";
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.frequency.setValueAtTime(freq, t);
		gain.gain.setValueAtTime(0, t);
		gain.gain.linearRampToValueAtTime(0.28, t + 0.015);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
		osc.start(t);
		osc.stop(t + 0.45);
	});
}


function requestNotificationPermission() {
	if (typeof Notification !== "undefined" && Notification.permission === "default") {
		Notification.requestPermission();
	}
}

function sendBrowserNotification(title, body) {
	if (typeof Notification === "undefined") return;
	if (Notification.permission !== "granted") return;
	if (document.visibilityState === "visible") return;
	try {
		const n = new Notification(title, {
			body: body?.slice(0, 100) || "",
			icon: "/assets/img/fav.png",
			tag: "cherri-chat",
		});
		setTimeout(() => n.close(), 6000);
	} catch {}
}


function parseMentions(text) {
	const myUsername = (window._currentUsername || "").toLowerCase();
	// Process in one pass: pass HTML tags through unchanged, process @mentions only in text nodes
	return text.replace(/(<[^>]*>)|@everyone\b|@([a-zA-Z0-9_]+)/gi, (match, tag, username) => {
		if (tag) return tag;
		if (!username) return '<span class="mention mention-everyone">@everyone</span>';
		const isMe = myUsername && username.toLowerCase() === myUsername;
		return `<span class="mention${isMe ? " mention-me" : ""}" data-mention="${escapeHtmlAttribute(username)}">@${username}</span>`;
	});
}

// ── Mention autocomplete state ─────────────────────────────────────────────
let mentionPickerIndex = 0;
let mentionPickerMatches = [];

function showMentionPicker(matches) {
	mentionPickerMatches = matches;
	mentionPickerIndex = 0;
	const picker = document.getElementById("mention-picker");
	if (!picker) return;
	picker.innerHTML = "";
	matches.forEach((user, i) => {
		const row = document.createElement("div");
		row.className = "emoji-picker-row" + (i === 0 ? " active" : "");
		const safePfp = escapeHtmlAttribute(user.pfp || "/assets/img/fav.png");
		row.innerHTML = `<img src="${safePfp}" onerror="this.src='/assets/img/fav.png'" style="width:18px;height:18px;border-radius:50%;object-fit:cover;flex-shrink:0"><span style="color:var(--bright-text);font-weight:600">@${escapeHtml(user.username)}</span><span style="opacity:0.45;font-size:11px;margin-left:2px">${escapeHtml(user.display || "")}</span>`;
		row.addEventListener("mousedown", (e) => { e.preventDefault(); insertMention(user.username); });
		row.addEventListener("mouseenter", () => { mentionPickerIndex = i; highlightMentionPicker(); });
		picker.appendChild(row);
	});
	picker.style.display = "block";
}

function highlightMentionPicker() {
	const picker = document.getElementById("mention-picker");
	if (!picker) return;
	[...picker.children].forEach((el, i) => el.classList.toggle("active", i === mentionPickerIndex));
	picker.children[mentionPickerIndex]?.scrollIntoView({ block: "nearest" });
}

function hideMentionPicker() {
	const picker = document.getElementById("mention-picker");
	if (picker) picker.style.display = "none";
	mentionPickerMatches = [];
}


const SLASH_COMMANDS = [
	{
		name: "me",
		args: "<action>",
		desc: "Send an action/emote",
		mod: false,
	},
	{
		name: "shrug",
		args: "",
		desc: "¯\\_(ツ)_/¯",
		mod: false,
	},
	{
		name: "tableflip",
		args: "",
		desc: "(╯°□°）╯︵ ┻━┻",
		mod: false,
	},
	{
		name: "unflip",
		args: "",
		desc: "┬─┬ノ( º _ ºノ)",
		mod: false,
	},
	{
		name: "roll",
		args: "[sides]",
		desc: "Roll a dice (default d6)",
		mod: false,
	},
	{
		name: "coinflip",
		args: "",
		desc: "Heads or tails",
		mod: false,
	},
	{
		name: "help",
		args: "",
		desc: "Show available commands",
		mod: false,
	},
	{
		name: "mute",
		args: "<username> [mins]",
		desc: "Mute a user from chat",
		mod: true,
	},
	{
		name: "unmute",
		args: "<username>",
		desc: "Remove a chat mute",
		mod: true,
	},
	{
		name: "ban",
		args: "<username> [reason]",
		desc: "Ban a user",
		mod: true,
	},
	{
		name: "lock",
		args: "",
		desc: "Lock the current channel",
		mod: true,
	},
	{
		name: "unlock",
		args: "",
		desc: "Unlock the current channel",
		mod: true,
	},
];

let slashPickerIndex = 0;
let slashPickerMatches = [];

function showSlashPicker(matches) {
	slashPickerMatches = matches;
	slashPickerIndex = 0;
	const picker = document.getElementById("slash-picker");
	if (!picker) return;
	picker.innerHTML = "";
	matches.forEach((cmd, i) => {
		const row = document.createElement("div");
		row.className = "emoji-picker-row" + (i === 0 ? " active" : "");
		row.innerHTML = `<span style="color:var(--accent);font-weight:700;font-size:13px;min-width:90px">/${escapeHtml(cmd.name)}</span><span style="opacity:0.5;font-size:11px">${escapeHtml(cmd.args)}</span><span style="opacity:0.7;font-size:12px;margin-left:auto">${escapeHtml(cmd.desc)}</span>`;
		row.addEventListener("mousedown", (e) => { e.preventDefault(); insertSlashCommand(cmd); });
		row.addEventListener("mouseenter", () => { slashPickerIndex = i; highlightSlashPicker(); });
		picker.appendChild(row);
	});
	picker.style.display = "block";
}

function highlightSlashPicker() {
	const picker = document.getElementById("slash-picker");
	if (!picker) return;
	[...picker.children].forEach((el, i) => el.classList.toggle("active", i === slashPickerIndex));
	picker.children[slashPickerIndex]?.scrollIntoView({ block: "nearest" });
}

function hideSlashPicker() {
	const picker = document.getElementById("slash-picker");
	if (picker) picker.style.display = "none";
	slashPickerMatches = [];
}

function insertSlashCommand(cmd) {
	msgInput.innerText = `/${cmd.name}${cmd.args ? " " : ""}`;
	const range = document.createRange();
	range.selectNodeContents(msgInput);
	range.collapse(false);
	const sel = window.getSelection();
	sel?.removeAllRanges();
	sel?.addRange(range);
	hideSlashPicker();
	msgInput.focus();
}

function showEphemeralMessage(html) {
	const container = document.getElementById("msg-container");
	if (!container) return;
	const div = document.createElement("div");
	div.className = "message-group ephemeral-message";
	div.innerHTML = `<div class="message-details"><div class="message-text">${html}</div></div>`;
	container.appendChild(div);
	container.scrollTop = container.scrollHeight;
	setTimeout(() => div.remove(), 12000);
}

function showModerationWarning(reason, issuedBy) {
	const existing = document.getElementById("mod-warning-modal");
	if (existing) existing.remove();
	const modal = document.createElement("div");
	modal.id = "mod-warning-modal";
	modal.innerHTML = `
		<div class="mod-warning-backdrop">
			<div class="mod-warning-box">
				<div class="mod-warning-icon"><i class="fas fa-triangle-exclamation"></i></div>
				<div class="mod-warning-title">Warning from Staff</div>
				<div class="mod-warning-body">${escapeHtml(reason)}</div>
				<div class="mod-warning-by">Issued by <strong>${escapeHtml(issuedBy)}</strong></div>
				<button class="mod-warning-close" onclick="document.getElementById('mod-warning-modal')?.remove()">Acknowledge</button>
			</div>
		</div>`;
	document.body.appendChild(modal);
}

function showFriendNotification(userId, username, pfp, kind) {
	const id = `friend-notif-${Date.now()}`;
	const box = document.createElement("div");
	box.id = id;
	box.style.cssText = "position:fixed;bottom:80px;right:20px;z-index:9999;max-width:320px;";
	const isRequest = kind === "request";
	box.innerHTML = `
		<div class="friend-notif-card" style="background:var(--bg-2);border:1px solid var(--accent);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 4px 24px rgba(0,0,0,.5);">
			<div style="display:flex;align-items:center;gap:10px;">
				<img src="${escapeHtml(pfp||'/assets/img/fav.png')}" onerror="this.src='/assets/img/fav.png'" style="width:38px;height:38px;border-radius:50%;object-fit:cover;">
				<div>
					<div style="font-weight:700;font-size:14px;">${escapeHtml(username)}</div>
					<div style="font-size:12px;opacity:.7;">${isRequest ? "sent you a friend request" : "accepted your friend request!"}</div>
				</div>
			</div>
			${isRequest ? `<div style="display:flex;gap:8px;">
				<button onclick="respondFriendRequest('${escapeHtml(userId)}','accept','${id}')" style="flex:1;padding:6px;border-radius:8px;background:var(--accent,#e7549b);color:#fff;border:none;cursor:pointer;font-weight:600;font-size:12px;">Accept</button>
				<button onclick="respondFriendRequest('${escapeHtml(userId)}','decline','${id}')" style="flex:1;padding:6px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:none;cursor:pointer;font-size:12px;">Decline</button>
			</div>` : `<button onclick="document.getElementById('${id}')?.remove()" style="padding:6px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;border:none;cursor:pointer;font-size:12px;width:100%;">Dismiss</button>`}
		</div>`;
	document.body.appendChild(box);
	if (!isRequest) setTimeout(() => box.remove(), 6000);
}

async function respondFriendRequest(userId, action, notifId) {
	document.getElementById(notifId)?.remove();
	try {
		if (action === "accept") {
			await fetch(`/api/friends/${userId}/accept`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" } });
			showToast("Friend added!", "success");
		} else {
			await fetch(`/api/friends/request/${userId}`, { method: "DELETE", credentials: "same-origin" });
		}
	} catch {}
}
window.respondFriendRequest = respondFriendRequest;

function showGameInviteNotification(userId, username, pfp, gameName, gameUrl) {
	const id = `game-invite-${Date.now()}`;
	const box = document.createElement("div");
	box.id = id;
	box.style.cssText = "position:fixed;bottom:80px;right:20px;z-index:9999;max-width:340px;";
	box.innerHTML = `
		<div class="friend-notif-card" style="background:var(--bg-2);border:1px solid var(--accent);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 4px 24px rgba(0,0,0,.5);">
			<div style="display:flex;align-items:center;gap:10px;">
				<img src="${escapeHtml(pfp||'/assets/img/fav.png')}" onerror="this.src='/assets/img/fav.png'" style="width:38px;height:38px;border-radius:50%;object-fit:cover;">
				<div>
					<div style="font-weight:700;font-size:14px;">${escapeHtml(username)} is playing ${escapeHtml(gameName)}!</div>
					<div style="font-size:12px;opacity:.7;">Wanna join them?</div>
				</div>
			</div>
			<div style="display:flex;gap:8px;">
				<a href="${encodeURI(gameUrl)}" target="_blank" rel="noopener" onclick="document.getElementById('${id}')?.remove()" style="flex:1;padding:6px;border-radius:8px;background:var(--accent);color:#fff;border:none;cursor:pointer;font-weight:600;font-size:12px;text-align:center;text-decoration:none;">Join Game</a>
				<button onclick="document.getElementById('${id}')?.remove()" style="flex:1;padding:6px;border-radius:8px;background:var(--bg-3);color:var(--text);border:1px solid var(--border-4);cursor:pointer;font-size:12px;font-family:inherit;">Decline</button>
			</div>
		</div>`;
	document.body.appendChild(box);
	setTimeout(() => box.remove(), 30000);
}

function copyUsername(username) {
	navigator.clipboard.writeText(username).catch(() => {});
	showToast(`@${username} copied`, "success");
}
window.copyUsername = copyUsername;

async function showUserProfile(username) {
	const existing = document.getElementById("user-profile-modal");
	if (existing) existing.remove();

	const modal = document.createElement("div");
	modal.id = "user-profile-modal";
	modal.innerHTML = `
		<div class="upm-backdrop" onclick="closeUserProfile(event)">
			<div class="upm-card">
				<div class="upm-banner" id="upm-banner"></div>
				<div class="upm-below-banner">
					<img class="upm-avatar" id="upm-avatar" src="/assets/img/fav.png" alt="">
					<div class="upm-header-actions">
						<button class="upm-close" onclick="document.getElementById('user-profile-modal')?.remove()"><i class="fas fa-xmark"></i></button>
					</div>
				</div>
				<div class="upm-info">
					<div class="upm-loading"><i class="fas fa-spinner fa-spin"></i></div>
					<div class="upm-body" style="display:none">
						<div class="upm-nameline">
							<span class="upm-display" id="upm-display"></span>
							<i class="fas fa-circle-check upm-verified" id="upm-verified" style="display:none"></i>
						</div>
						<div class="upm-username" id="upm-username"></div>
						<div class="upm-badges" id="upm-badges"></div>
						<p class="upm-bio" id="upm-bio" style="display:none"></p>
						<div class="upm-stats" id="upm-stats"></div>
						<div class="upm-actions" id="upm-actions"></div>
					</div>
				</div>
			</div>
		</div>`;
	document.body.appendChild(modal);

	try {
		const [profileRes, meRes] = await Promise.all([
			fetch(`/api/profile/${encodeURIComponent(username)}`),
			fetch("/api/auth/me", { credentials: "same-origin" }),
		]);
		const profileData = await profileRes.json();
		const me = (await meRes.json().catch(() => ({}))).user || null;

		if (!profileRes.ok || !profileData.profile) {
			document.getElementById("upm-display")?.closest(".upm-info").querySelector(".upm-loading")?.remove();
			const body = modal.querySelector(".upm-body");
			if (body) { body.style.display = ""; document.getElementById("upm-display").textContent = "User not found"; }
			return;
		}

		const p = profileData.profile;

		if (p.bannerUrl) document.getElementById("upm-banner").style.backgroundImage = `url(${JSON.stringify(p.bannerUrl)})`;

		const av = document.getElementById("upm-avatar");
		av.src = p.pfp || "/assets/img/fav.png";
		av.onerror = () => { av.src = "/assets/img/fav.png"; };

		document.getElementById("upm-display").textContent = p.display || p.username;
		if (p.trusted) document.getElementById("upm-verified").style.display = "";
		document.getElementById("upm-username").textContent = `@${p.username}`;

		const badgeCls = b => b === "admin" ? "upm-badge-admin" : b === "mod" ? "upm-badge-mod" : b === "dev" ? "upm-badge-dev" : b === "trusted" ? "upm-badge-trusted" : "upm-badge-user";
		const bads = (p.badges || []).filter(b => b !== "user");
		if (p.trusted && !bads.includes("trusted")) bads.unshift("trusted");
		document.getElementById("upm-badges").innerHTML = bads.map(b => `<span class="upm-badge ${badgeCls(b)}">${b}</span>`).join("");

		if (p.bio) { const el = document.getElementById("upm-bio"); el.textContent = p.bio; el.style.display = ""; }

		const joined = p.createdAt ? new Date(p.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : null;
		document.getElementById("upm-stats").innerHTML =
			`<span class="upm-stat"><strong>${p.friendCount ?? 0}</strong> friends</span>`
			+ (joined ? `<span class="upm-stat">Joined <strong>${joined}</strong></span>` : "");

		// Actions
		const actEl = document.getElementById("upm-actions");
		const isSelf = me && me.id === p.id;
		if (!isSelf && me) {
			const status = p.friendshipStatus;
			const addFriendBtn = document.createElement("button");
			addFriendBtn.className = "upm-btn upm-btn-primary";
			if (status === "none") {
				addFriendBtn.innerHTML = `<i class="fas fa-user-plus"></i> Add Friend`;
				addFriendBtn.onclick = async () => {
					addFriendBtn.disabled = true;
					await fetch(`/api/friends/request/${p.id}`, { method: "POST", credentials: "same-origin" }).catch(() => {});
					addFriendBtn.innerHTML = `<i class="fas fa-check"></i> Sent`;
				};
				actEl.appendChild(addFriendBtn);
			} else if (status === "pending_received") {
				addFriendBtn.innerHTML = `<i class="fas fa-check"></i> Accept Request`;
				addFriendBtn.className = "upm-btn upm-btn-green";
				addFriendBtn.onclick = async () => {
					addFriendBtn.disabled = true;
					await fetch(`/api/friends/${p.id}/accept`, { method: "POST", credentials: "same-origin" }).catch(() => {});
					addFriendBtn.innerHTML = `<i class="fas fa-user-check"></i> Friends`;
				};
				actEl.appendChild(addFriendBtn);
			} else if (status === "friends") {
				addFriendBtn.innerHTML = `<i class="fas fa-user-check"></i> Friends`;
				addFriendBtn.className = "upm-btn upm-btn-secondary";
				actEl.appendChild(addFriendBtn);
			}
		}
		const msgBtn = document.createElement("a");
		msgBtn.href = `/pages/chatrooms.html?dm=${encodeURIComponent(p.username)}`;
		msgBtn.className = "upm-btn upm-btn-secondary";
		msgBtn.innerHTML = `<i class="fas fa-comment"></i> Message`;
		if (isSelf) {
			msgBtn.href = "/pages/profile.html";
			msgBtn.innerHTML = `<i class="fas fa-pen"></i> Edit Profile`;
		}
		actEl.appendChild(msgBtn);

		modal.querySelector(".upm-loading").style.display = "none";
		modal.querySelector(".upm-body").style.display = "";
	} catch {
		const loading = modal.querySelector(".upm-loading");
		if (loading) loading.innerHTML = `<span style="opacity:.5">Failed to load profile.</span>`;
	}
}

function closeUserProfile(e) {
	if (e.target === e.currentTarget) document.getElementById("user-profile-modal")?.remove();
}
window.showUserProfile = showUserProfile;
window.closeUserProfile = closeUserProfile;

async function resolveUsernameToId(username) {
	
	username = username.replace(/^@/, "");
	try {
		const res = await fetch(`/api/admin/users?q=${encodeURIComponent(username)}&page=0`, { credentials: "same-origin" });
		if (!res.ok) return null;
		const data = await res.json();
		const match = (data.users || []).find(u => u.username.toLowerCase() === username.toLowerCase());
		return match ? { id: match.id, username: match.username } : null;
	} catch { return null; }
}

async function handleSlashCommand(rawText) {
	const text = rawText.trim();
	if (!text.startsWith("/")) return false;

	const spaceIdx = text.indexOf(" ");
	const cmd = (spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx)).toLowerCase();
	const args = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1).trim();
	const isAdmin = ["x8r","sprintingsnail","technonyte","dinguschan","syntaxerror52","yash","josh22_28","yzycoin","beetlejuice","snake","blairebear",].includes(window._currentUsername || "");
	const isOwner = window._currentUsername === "x8r";

	switch (cmd) {
		case "me": {
			if (!args) { showEphemeralMessage('<span style="opacity:0.5">Usage: /me &lt;action&gt;</span>'); return true; }
			await window.chat.sendMessage(`*${args}*`);
			return true;
		}
		case "shrug":
			await window.chat.sendMessage(`¯\\_(ツ)_/¯${args ? " " + args : ""}`);
			return true;
		case "tableflip":
			await window.chat.sendMessage(`(╯°□°）╯︵ ┻━┻${args ? " " + args : ""}`);
			return true;
		case "unflip":
			await window.chat.sendMessage(`┬─┬ノ( º _ ºノ)${args ? " " + args : ""}`);
			return true;
		case "roll": {
			const sides = parseInt(args) || 6;
			const result = Math.floor(Math.random() * sides) + 1;
			await window.chat.sendMessage(`🎲 rolled a d${sides} and got **${result}**`);
			return true;
		}
		case "coinflip": {
			const side = Math.random() < 0.5 ? "Heads 🪙" : "Tails 🪙";
			await window.chat.sendMessage(`🪙 flipped a coin: **${side}**`);
			return true;
		}
		case "help": {
			const isAdminLocal = ["x8r","sprintingsnail","technonyte","dinguschan","syntaxerror52","yash","josh22_28","yzycoin","beetlejuice","snake","blairebear",].includes(window._currentUsername || "");
			const visible = SLASH_COMMANDS.filter(c => !c.mod || isAdminLocal);
			const rows = visible.map(c =>
				`<div style="display:flex;gap:10px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="color:var(--accent);font-weight:700;min-width:100px">/${escapeHtml(c.name)} <span style="opacity:0.5;font-weight:400">${escapeHtml(c.args)}</span></span><span style="opacity:0.65">${escapeHtml(c.desc)}</span></div>`
			).join("");
			showEphemeralMessage(`<div style="font-size:0.85rem"><strong style="font-size:0.9rem">Available commands</strong><div style="margin-top:6px">${rows}</div><div style="margin-top:6px;opacity:0.4;font-size:0.75rem">Only visible to you</div></div>`);
			return true;
		}
		case "mute": {
			if (!isAdmin) { showEphemeralMessage('<span style="color:#f04747">You don\'t have permission to use this command.</span>'); return true; }
			const parts = args.split(/\s+/);
			const targetName = parts[0];
			const minutes = parseInt(parts[1]) || 60;
			if (!targetName) { showEphemeralMessage('<span style="opacity:0.5">Usage: /mute &lt;username&gt; [minutes]</span>'); return true; }
			const user = await resolveUsernameToId(targetName);
			if (!user) { showEphemeralMessage(`<span style="color:#f04747">User "${escapeHtml(targetName)}" not found.</span>`); return true; }
			const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/mute-chat`, {
				method: "POST", credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ minutes }),
			});
			if (res.ok) showEphemeralMessage(`<span style="color:#3dd56d">Muted @${escapeHtml(user.username)} for ${minutes} minute${minutes !== 1 ? "s" : ""}.</span>`);
			else showEphemeralMessage(`<span style="color:#f04747">Failed to mute user.</span>`);
			return true;
		}
		case "unmute": {
			if (!isAdmin) { showEphemeralMessage('<span style="color:#f04747">You don\'t have permission to use this command.</span>'); return true; }
			const targetName = args.replace(/^@/, "");
			if (!targetName) { showEphemeralMessage('<span style="opacity:0.5">Usage: /unmute &lt;username&gt;</span>'); return true; }
			const user = await resolveUsernameToId(targetName);
			if (!user) { showEphemeralMessage(`<span style="color:#f04747">User "${escapeHtml(targetName)}" not found.</span>`); return true; }
			const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/mute-chat`, {
				method: "DELETE", credentials: "same-origin",
			});
			if (res.ok) showEphemeralMessage(`<span style="color:#3dd56d">Unmuted @${escapeHtml(user.username)}.</span>`);
			else showEphemeralMessage(`<span style="color:#f04747">Failed to unmute user.</span>`);
			return true;
		}
		case "ban": {
			if (!isAdmin) { showEphemeralMessage('<span style="color:#f04747">You don\'t have permission to use this command.</span>'); return true; }
			const spIdx = args.indexOf(" ");
			const targetName = spIdx === -1 ? args : args.slice(0, spIdx);
			const reason = spIdx === -1 ? "Banned via chat command" : args.slice(spIdx + 1).trim();
			if (!targetName) { showEphemeralMessage('<span style="opacity:0.5">Usage: /ban &lt;username&gt; [reason]</span>'); return true; }
			const user = await resolveUsernameToId(targetName);
			if (!user) { showEphemeralMessage(`<span style="color:#f04747">User "${escapeHtml(targetName)}" not found.</span>`); return true; }
			const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/ban`, {
				method: "POST", credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reason, permanent: true }),
			});
			if (res.ok) showEphemeralMessage(`<span style="color:#3dd56d">Banned @${escapeHtml(user.username)}. Reason: ${escapeHtml(reason)}</span>`);
			else showEphemeralMessage(`<span style="color:#f04747">Failed to ban user.</span>`);
			return true;
		}
		case "lock":
		case "unlock": {
			if (!isOwner) { showEphemeralMessage('<span style="color:#f04747">Only the owner can lock channels.</span>'); return true; }
			const room = window.chat?.currentRoom;
			if (!room) { showEphemeralMessage('<span style="opacity:0.5">You must be in a channel to use this command.</span>'); return true; }
			const locked = cmd === "lock";
			const res = await fetch(`/api/channels/${encodeURIComponent(room)}/lock`, {
				method: "PATCH", credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ locked }),
			});
			if (res.ok) {
				showEphemeralMessage(`<span style="color:#3dd56d">#${escapeHtml(room)} is now ${locked ? "locked 🔒" : "unlocked 🔓"}.</span>`);
				window.chatUI?.renderSidebar();
			} else {
				showEphemeralMessage(`<span style="color:#f04747">Failed to ${cmd} channel.</span>`);
			}
			return true;
		}
		default:
			showEphemeralMessage(`<span style="color:#f04747">Unknown command: /${escapeHtml(cmd)}. Type /help to see available commands.</span>`);
			return true;
	}
}

function insertMention(username) {
	const text = msgInput.innerText;
	const atIdx = text.lastIndexOf("@");
	if (atIdx === -1) return;
	msgInput.innerText = text.slice(0, atIdx) + "@" + username + " ";
	const range = document.createRange();
	range.selectNodeContents(msgInput);
	range.collapse(false);
	const sel = window.getSelection();
	sel?.removeAllRanges();
	sel?.addRange(range);
	hideMentionPicker();
	msgInput.dispatchEvent(new Event("input"));
}

function emojiCodepoint(emoji) {
	const points = [];
	let i = 0;
	while (i < emoji.length) {
		const code = emoji.codePointAt(i);
		if (code !== 0xfe0f) points.push(code.toString(16));
		i += code > 0xffff ? 2 : 1;
	}
	return points.join("-");
}

function parseEmoji(text) {
	text = escapeHtml(text);
	text = text.replace(/:([a-zA-Z0-9_+\-]+):/g, (match, name, offset) => {
		const before = text.slice(0, offset);
		const openBrackets = (before.match(/</g) || []).length;
		const closeBrackets = (before.match(/>/g) || []).length;
		if (openBrackets > closeBrackets) return match;
		const emoji = EMOJI_MAP[name];
		if (!emoji) return match;
		const cp = emojiCodepoint(emoji);
		return `<img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${cp}.svg" alt="${emoji}" title=":${name}:" style="width:1.2em;height:1.2em;vertical-align:-0.2em;display:inline-block;margin:0 1px">`;
	});
	text = text.replace(
		/(\p{Emoji_Presentation}(\u200D\p{Emoji_Presentation})*\uFE0F?|\p{Extended_Pictographic}(\u200D\p{Extended_Pictographic})*\uFE0F?)/gu,
		(emoji) => {
			const cp = emojiCodepoint(emoji);
			return `<img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${cp}.svg" alt="${emoji}" style="width:1.2em;height:1.2em;vertical-align:-0.2em;display:inline-block;margin:0 1px">`;
		},
	);
	return text;
}

const ALLOWED_GIF_HOSTS = new Set([
	"giphy.com",
	"media.giphy.com",
	"i.giphy.com",
	"media0.giphy.com",
	"media1.giphy.com",
	"media2.giphy.com",
	"media3.giphy.com",
	"media4.giphy.com",
]);

function isAllowedGifUrl(url) {
	if (typeof url !== "string") return false;
	const trimmed = url.trim();
	if (!trimmed) return false;

	try {
		if (trimmed.startsWith("/")) {
			const path = trimmed.split(/[?#]/, 1)[0] || "";
			return path.toLowerCase().endsWith(".gif");
		}

		const parsed = new URL(trimmed);
		if (parsed.protocol !== "https:") return false;
		if (!ALLOWED_GIF_HOSTS.has(parsed.hostname.toLowerCase())) return false;
		return parsed.pathname.toLowerCase().endsWith(".gif");
	} catch {
		return false;
	}
}

function escapeHtmlAttribute(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function parseQuoteTag(b64, srcMsgId = null) {
	try {
		const q = JSON.parse(decodeURIComponent(escape(atob(b64))));
		if (q.t == null) return null;
		const safeDisplay = escapeHtml(q.d || q.u);
		const safeUsername = escapeHtml(q.u);
		const safeAvatar = escapeHtmlAttribute(q.a || "/assets/img/fav.png");
		const safeBgStyle = escapeHtmlAttribute(`background-image:url(${JSON.stringify(q.a || "/assets/img/fav.png")})`);
		const safeText = escapeHtml(q.t);
		const safeSrcId = srcMsgId != null ? ` data-src-msg-id="${Number(srcMsgId)}"` : "";
		return `<div class="quote-card"${safeSrcId}><div class="quote-card-bg" style="${safeBgStyle}"></div><div class="quote-card-content"><div class="quote-card-body">${safeText}</div><div class="quote-card-author">— ${safeDisplay}</div><div class="quote-card-username">@${safeUsername}</div></div><div class="quote-card-watermark">Make it a Quote</div><button class="quote-card-save" onclick="window.chat.saveQuoteFromCard(this)" title="Save quote"><i class="fas fa-bookmark"></i></button></div>`;
	} catch {
		return null;
	}
}

function parseMarkdown(text, msgId = null) {
	text = text.replace(/\[quote:([A-Za-z0-9+/=]+)\]/g, (match, b64) => {
		return parseQuoteTag(b64, msgId) || match;
	});
	text = text.replace(/\[gif:([^\]]+)\]/g, (match, url) => {
		if (!isAllowedGifUrl(url)) return match;
		const safeUrl = escapeHtmlAttribute(url);
		return `<img src="${safeUrl}" class="chat-gif" alt="GIF" onclick="window.open(this.src,'_blank','noopener,noreferrer')" />`;
	});
	text = text.replace(
		/```([\s\S]*?)```/g,
		'<code style="display:block;white-space:pre-wrap;background:var(--bg-3);border:1px solid var(--border-4);border-radius:6px;padding:8px 12px;margin:4px 0;font-size:0.88em;font-family:monospace">$1</code>',
	);
	text = text.replace(
		/`([^`]+)`/g,
		'<code style="background:var(--bg-3);border:1px solid var(--border-4);border-radius:4px;padding:1px 5px;font-size:0.88em;font-family:monospace">$1</code>',
	);
	text = text.replace(
		/^### (.+)$/gm,
		'<div style="font-size:1em;font-weight:700;line-height:1.3">$1</div>',
	);
	text = text.replace(
		/^## (.+)$/gm,
		'<div style="font-size:1.2em;font-weight:700;line-height:1.3">$1</div>',
	);
	text = text.replace(
		/^# (.+)$/gm,
		'<div style="font-size:1.5em;font-weight:700;line-height:1.3">$1</div>',
	);
	text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
	text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
	text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");
	text = text.replace(/__(.*?)__/g, "<u>$1</u>");
	text = text.replace(/\n/g, "<br>");
	return text;
}

function parseLinks(text) {
	return text.replace(/(?<![='"(])https?:\/\/[^\s<>"'()]+/g, (url) => {
		const safeUrl = escapeHtmlAttribute(url);
		const safeText = escapeHtml(url);
		return `<a href="${safeUrl}" data-external="true" style="color:var(--accent);text-decoration:underline;text-decoration-color:rgba(255,255,255,0.2);cursor:pointer">${safeText}</a>`;
	});
}

function extractFirstEmbedUrl(content) {
	if (!content || typeof content !== "string") return null;
	if (/^\[gif:/.test(content.trim())) return null;
	const m = content.match(/(?<![='"(])https?:\/\/[^\s<>"'()]+/);
	if (!m) return null;
	const url = m[0];
	if (/giphy\.com|tenor\.com/i.test(url)) return null;
	return url;
}

const _embedCache = new Map();

async function loadLinkEmbed(container) {
	const url = container.dataset.url;
	if (!url) return;
	if (_embedCache.has(url)) {
		const data = _embedCache.get(url);
		if (data) _renderEmbed(container, data);
		return;
	}
	try {
		const res = await fetch(`/api/embed?url=${encodeURIComponent(url)}`, { credentials: "same-origin" });
		const data = await res.json().catch(() => null);
		if (!data || data.error || !data.title) { _embedCache.set(url, false); return; }
		_embedCache.set(url, data);
		if (document.contains(container)) _renderEmbed(container, data);
	} catch {
		_embedCache.set(url, false);
	}
}

function _renderEmbed(container, data) {
	const safeTitle = escapeHtml(data.title || "");
	const safeDesc = data.description ? escapeHtml(data.description) : "";
	const accentStyle = data.color ? ` style="background:${escapeHtmlAttribute(data.color)}"` : "";
	container.innerHTML = `<div class="link-embed">
		<div class="link-embed-accent"${accentStyle}></div>
		<div class="link-embed-body">
			<span class="link-embed-title">${safeTitle}</span>
			${safeDesc ? `<div class="link-embed-desc">${safeDesc}</div>` : ""}
		</div>
	</div>`;
}

function buildVoiceWaveform(seed) {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
	const bars = [];
	const BAR_COUNT = 18;
	for (let i = 0; i < BAR_COUNT; i++) {
		h = (Math.imul(1664525, h) + 1013904223) | 0;
		const pct = 18 + (Math.abs(h) % 74);
		bars.push(`<span class="vbar" data-i="${i}" style="height:${pct}%"></span>`);
	}
	return bars.join("");
}

// Global voice player — only one playing at a time
window.voicePlayerToggle = (function () {
	let _audio = null;
	let _src = null;
	let _rafId = null;
	let _playPending = false; // true while play() promise is unresolved

	function fmt(s) {
		if (!isFinite(s) || s < 0) return "0:00";
		const m = Math.floor(s / 60);
		const sec = Math.floor(s % 60);
		return `${m}:${sec.toString().padStart(2, "0")}`;
	}

	function getContainer() {
		if (!_src) return null;
		return document.querySelector(`.voice-msg[data-src="${CSS.escape(_src)}"]`);
	}

	function setIcon(icon) {
		const c = getContainer();
		if (!c) return;
		const i = c.querySelector(".voice-play-btn i");
		if (i) i.className = `fas fa-${icon}`;
	}

	function tick() {
		const c = getContainer();
		if (!c || !_audio) return;
		const dur = _audio.duration;
		const ct = _audio.currentTime;
		if (isFinite(dur) && dur > 0) {
			const pct = ct / dur;
			const bars = c.querySelectorAll(".vbar");
			const played = Math.round(pct * bars.length);
			bars.forEach((b, i) => b.classList.toggle("played", i < played));
			c.querySelector(".voice-time").textContent = fmt(ct);
		}
		_rafId = requestAnimationFrame(tick);
	}

	function stopTick() {
		if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
	}

	function resetContainer(container) {
		if (!container) return;
		const i = container.querySelector(".voice-play-btn i");
		if (i) i.className = "fas fa-play";
		container.querySelectorAll(".vbar").forEach(b => b.classList.remove("played"));
		const timeEl = container.querySelector(".voice-time");
		if (timeEl) timeEl.textContent = "0:00";
	}

	// Pause safely — defer if play() hasn't resolved yet to avoid AbortError
	function safePause(audio) {
		if (_playPending) {
			// wait for play to resolve, then pause
			const handle = setInterval(() => {
				if (!_playPending) { clearInterval(handle); audio.pause(); }
			}, 10);
		} else {
			audio.pause();
		}
	}

	function stop() {
		stopTick();
		const c = getContainer();
		const a = _audio;
		_audio = null;
		_src = null;
		_playPending = false;
		if (a) safePause(a);
		if (c) resetContainer(c);
	}

	window.voiceSeek = function (waveform, event) {
		if (!_audio || _playPending) return;
		const c = waveform.closest(".voice-msg");
		if (!c || c !== getContainer()) return;
		if (!isFinite(_audio.duration)) return;
		const rect = waveform.getBoundingClientRect();
		const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
		_audio.currentTime = pct * _audio.duration;
	};

	return function toggle(btn) {
		const container = btn.closest(".voice-msg");
		if (!container) return;
		const src = container.dataset.src;
		if (!src) return;

		// same track — pause/resume
		if (_audio && _src === src) {
			if (_playPending) return; // ignore click while still loading
			if (_audio.paused) {
				_playPending = true;
				_audio.play().then(() => { _playPending = false; }).catch(e => {
					_playPending = false;
					if (e.name !== "AbortError") stop();
				});
			} else {
				_audio.pause();
			}
			return;
		}

		// different track — stop old, start new
		if (_audio) {
			stopTick();
			const old = getContainer();
			safePause(_audio);
			_audio = null;
			_src = null;
			_playPending = false;
			if (old) resetContainer(old);
		}

		const audio = new Audio(src);
		_audio = audio;
		_src = src;
		_playPending = true;

		audio.addEventListener("play", () => { setIcon("pause"); if (!_rafId) tick(); });
		audio.addEventListener("pause", () => { setIcon("play"); stopTick(); });
		audio.addEventListener("ended", () => { stopTick(); setIcon("play"); });
		audio.addEventListener("loadedmetadata", () => {
			const c = getContainer();
			if (c) c.querySelector(".voice-time").textContent = fmt(audio.duration);
		});

		audio.play().then(() => {
			_playPending = false;
		}).catch(e => {
			_playPending = false;
			// AbortError = we paused before play resolved (e.g. user switched tracks) — not an error
			if (e.name !== "AbortError") {
				console.error("[voice] play failed:", e);
				stop();
			}
		});
	};
})();

function normalizeMessage(raw) {
	if (!raw || typeof raw !== "object") return null;
	return {
		id: Number(raw.id),
		from: String(raw.from || ""),
		username: String(raw.username || "unknown"),
		display: String(raw.display || raw.username || "unknown"),
		avatar_url: String(raw.avatar_url || "/assets/img/fav.png"),
		content: String(raw.content || ""),
		badges: Array.isArray(raw.badges) ? raw.badges : [],
		sent_at: String(raw.sent_at || new Date().toISOString()),
		room: raw.room ?? null,
		to: raw.to ?? null,
		reply_to_id: raw.reply_to_id ? Number(raw.reply_to_id) : null,
		group_id: raw.group_id ?? null,
		blocked: raw.blocked === true,
		trusted: raw.trusted === true,
		message_type: String(raw.message_type || "text"),
		attachment_url: raw.attachment_url ? String(raw.attachment_url) : null,
	};
}

async function getChatSocketUrl() {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const hwid = await getHWID();
	return `${protocol}
}

function isMessageForCurrentView(message, chat) {
	if (chat.currentGroupId) {
		return message.group_id === chat.currentGroupId;
	}
	if (chat.currentDmUserId) {
		return (
			!message.room &&
			!message.group_id &&
			((message.from === chat._myUserId &&
				message.to === chat.currentDmUserId) ||
				(message.from === chat.currentDmUserId &&
					message.to === chat._myUserId))
		);
	}
	return message.room === (chat.currentRoom || "general");
}

let emojiPickerIndex = 0;
let emojiPickerMatches = [];

function showEmojiPicker(matches) {
	emojiPickerMatches = matches;
	emojiPickerIndex = 0;
	const picker = document.getElementById("emoji-picker");
	picker.innerHTML = "";
	matches.forEach((name, i) => {
		const row = document.createElement("div");
		row.className = "emoji-picker-row" + (i === 0 ? " active" : "");
		row.innerHTML = `<span class="emoji-glyph">${EMOJI_MAP[name]}</span><span>:${name}:</span>`;
		row.addEventListener("mousedown", (e) => {
			e.preventDefault();
			insertPickerEmoji(name);
		});
		row.addEventListener("mouseenter", () => {
			emojiPickerIndex = i;
			highlightEmojiPicker();
		});
		picker.appendChild(row);
	});
	picker.style.display = "block";
}

function highlightEmojiPicker() {
	const picker = document.getElementById("emoji-picker");
	[...picker.children].forEach((el, i) => {
		el.classList.toggle("active", i === emojiPickerIndex);
	});
	picker.children[emojiPickerIndex]?.scrollIntoView({ block: "nearest" });
}

function hideEmojiPicker() {
	const picker = document.getElementById("emoji-picker");
	if (picker) picker.style.display = "none";
	emojiPickerMatches = [];
}

function insertPickerEmoji(name) {
	const text = msgInput.innerText;
	const colonIdx = text.lastIndexOf(":");
	if (colonIdx === -1) return;
	msgInput.innerText = text.slice(0, colonIdx) + EMOJI_MAP[name] + " ";
	const range = document.createRange();
	range.selectNodeContents(msgInput);
	range.collapse(false);
	const sel = window.getSelection();
	sel.removeAllRanges();
	sel.addRange(range);
	hideEmojiPicker();
	msgInput.dispatchEvent(new Event("input"));
}

function makeBadge(label, bg, color, marginLeft = "-5px") {
	const b = document.createElement("span");
	b.className = "chat-badge";
	b.innerText = label;
	Object.assign(b.style, {
		background: bg,
		color,
		fontWeight: "bold",
		padding: "2px 5px",
		borderRadius: "4px",
		fontSize: "10px",
		marginLeft,
		width: "fit-content",
		display: "inline-block",
	});
	return b;
}

const VoiceChat = {
	room: null,
	roomHandle: null,
	muted: false,

	getParticipants() {
		if (!this.roomHandle) return [];
		const remote = Array.from(this.roomHandle.remoteParticipants.values());
		return [this.roomHandle.localParticipant, ...remote];
	},

	_attachDrag(panel) {
		panel.addEventListener("mousedown", (e) => {
			if (e.target.closest("button")) return;
			e.preventDefault();
			const rect = panel.getBoundingClientRect();
			this._dragState = {
				startX: e.clientX,
				startY: e.clientY,
				startLeft: rect.left,
				startTop: rect.top,
			};
			panel.style.right = "auto";
			panel.style.bottom = "auto";
			panel.style.left = rect.left + "px";
			panel.style.top = rect.top + "px";
			panel.style.cursor = "grabbing";
		});

		document.addEventListener("mousemove", (e) => {
			if (!this._dragState) return;
			const dx = e.clientX - this._dragState.startX;
			const dy = e.clientY - this._dragState.startY;
			panel.style.left = this._dragState.startLeft + dx + "px";
			panel.style.top = this._dragState.startTop + dy + "px";
		});

		document.addEventListener("mouseup", () => {
			if (!this._dragState) return;
			this._dragState = null;
			panel.style.cursor = "grab";
		});
	},

	setParticipantVolume(identity, value) {
		const vol = Number(value) / 100;
		localStorage.setItem(`vc_vol_${identity}`, value);
		if (!this.roomHandle) return;
		for (const [, participant] of this.roomHandle.remoteParticipants) {
			if (participant.identity === identity) {
				for (const pub of participant.audioTrackPublications.values()) {
					if (pub.track) pub.track.setVolume(vol);
				}
				break;
			}
		}
	},

	renderUI() {
		const existing = document.getElementById("vc-panel");
		if (!this.room) {
			if (existing) existing.remove();
			return;
		}

		const panel = existing || document.createElement("div");
		panel.id = "vc-panel";

		if (!existing) {
			const initialRight = document.body.classList.contains(
				"online-board-collapsed",
			)
				? 16
				: 296;
			panel.style.cssText = `
            position:fixed;bottom:90px;right:${initialRight}px;
            background:var(--bg-2);border:1px solid var(--border-4);border-radius:14px;
            padding:10px 12px;min-width:180px;max-width:240px;z-index:20;
            display:flex;flex-direction:column;gap:6px;cursor:grab;
            user-select:none;
        `;
			this._attachDrag(panel);
		}

		const participants = this.getParticipants();
		const participantList = participants
			.map((p) => {
				const isLocal = p === this.roomHandle.localParticipant;
				const isMuted = isLocal ? this.muted : !p.isMicrophoneEnabled;
				const isSpeaking = p.isSpeaking;

				let pfpToDisplay = "/assets/img/fav.png";
				if (isLocal && window.chat._myUser?.pfp) {
					pfpToDisplay = window.chat._myUser.pfp;
				} else {
					if (p.metadata) {
						try {
							const meta = JSON.parse(p.metadata);
							if (meta.avatar_url || meta.pfp)
								pfpToDisplay = meta.avatar_url || meta.pfp;
						} catch {}
					}
					if (
						pfpToDisplay === "/assets/img/fav.png" &&
						Array.isArray(window.chat.messages)
					) {
						const match = window.chat.messages.find(
							(m) => String(m.from) === String(p.identity),
						);
						if (match && match.avatar_url)
							pfpToDisplay = match.avatar_url;
					}
				}
				if (pfpToDisplay.length > 1000)
					pfpToDisplay = "/assets/img/fav.png";

				const safePfp = escapeHtmlAttribute(pfpToDisplay);
				const ringStyle = isSpeaking
					? "box-shadow: 0 0 0 2px var(--accent); border-color: transparent;"
					: "border-color: var(--border-4);";

				const storedVol = !isLocal
					? Number(localStorage.getItem(`vc_vol_${p.identity}`)) || 100
					: null;
				const volSlider = !isLocal
					? `<input type="range" min="0" max="150" value="${storedVol}"
                style="width:56px;height:3px;accent-color:var(--accent);cursor:pointer;flex-shrink:0;"
                title="Volume"
                oninput="window.VoiceChat.setParticipantVolume('${p.identity}', this.value)" />`
					: "";

				return `<div style="display:flex;align-items:center;gap:8px;font-size:0.82rem;">
            <img src="${safePfp}" alt="pfp" style="width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid;transition:box-shadow 0.1s ease,border-color 0.1s ease;${ringStyle}" />
            <span style="color:var(--bright-text);font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${escapeHtml(p.name || p.identity)}${isLocal ? " (you)" : ""}
            </span>
            ${isMuted ? '<i class="fas fa-microphone-slash" style="opacity:0.5;font-size:11px;color:#f04747;"></i>' : ""}
            ${volSlider}
        </div>`;
			})
			.join("");
		panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-2);opacity:0.7;">
                Voice · #${escapeHtml(this.room)}
            </span>
            <div style="display:flex;gap:4px;">
                <button onclick="window.VoiceChat.toggleMute()" title="${this.muted ? "Unmute" : "Mute"}"
                    style="background:none;border:none;color:${this.muted ? "#f04747" : "var(--text-2)"};cursor:pointer;padding:3px 5px;border-radius:6px;font-size:12px;">
                    <i class="fas fa-microphone${this.muted ? "-slash" : ""}"></i>
                </button>
                <button onclick="window.VoiceChat.leave()" title="Leave voice"
                    style="background:none;border:none;color:#f04747;cursor:pointer;padding:3px 5px;border-radius:6px;font-size:12px;">
                    <i class="fas fa-phone-slash"></i>
                </button>
            </div>
        </div>
        ${participantList || '<span style="font-size:0.8rem;opacity:0.4;">Connecting...</span>'}
    `;

		if (!existing) document.body.appendChild(panel);
	},

	async join(room) {
		if (this.roomHandle) await this.leave();
		this.renderUI(true);

		let token;
		try {
			const res = await fetch("/api/voice/token", {
				method: "POST",
				headers: { "content-type": "application/json" },
				credentials: "same-origin",
				body: JSON.stringify({ room }),
			});
			if (!res.ok) {
				return;
			}
			const data = await res.json();
			token = data.token;
		} catch (e) {
			return;
		}

		const roomHandle = new LivekitClient.Room({
			adaptiveStream: true,
			dynacast: true,
		});

		roomHandle.on(LivekitClient.RoomEvent.Connected, () => {
			this.renderUI();
		});
		roomHandle.on(LivekitClient.RoomEvent.Disconnected, (reason) => {
			this.room = null;
			this.roomHandle = null;
			this.muted = false;
			this.renderUI();
		});
		roomHandle.on(LivekitClient.RoomEvent.ParticipantConnected, (p) => {
			this.renderUI();
		});
		roomHandle.on(LivekitClient.RoomEvent.ParticipantDisconnected, (p) => {
			this.renderUI();
		});
		roomHandle.on(
			LivekitClient.RoomEvent.TrackSubscribed,
			(track, pub, participant) => {
				if (track.kind === LivekitClient.Track.Kind.Audio) {
					track.attach();
					const stored = Number(
						localStorage.getItem(`vc_vol_${participant.identity}`),
					);
					if (stored >= 0) track.setVolume(stored / 100);
				}
				this.renderUI();
			},
		);
		roomHandle.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
			track.detach();
			this.renderUI();
		});
		roomHandle.on(LivekitClient.RoomEvent.ActiveSpeakersChanged, () => {
			this.renderUI();
		});

		try {
			let livekitUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/livekit`;
			if (window.location.host === "localhost:2000")
				livekitUrl = "wss://cherrion.top/livekit";
			await roomHandle.connect(livekitUrl, token);
			await roomHandle.localParticipant.setMicrophoneEnabled(true);
			this.room = room;
			this.roomHandle = roomHandle;
			this.renderUI();
		} catch (e) {
			//
		}
	},

	async leave() {
		if (this.roomHandle) {
			await this.roomHandle.disconnect();
		}
		this.room = null;
		this.roomHandle = null;
		this.muted = false;
		this.renderUI();
	},

	async toggleMute() {
		if (!this.roomHandle) return;
		this.muted = !this.muted;
		await this.roomHandle.localParticipant.setMicrophoneEnabled(!this.muted);
		this.renderUI();
	},
};

window.VoiceChat = VoiceChat;

window.chat = {
	renderFingerprint: "",
	messages: [],
	displayLimit: PAGE_SIZE,
	isLoadingMore: false,
	hasMoreHistory: true,
	currentRoom: null,
	currentDmUserId: null,
	currentDmRecipient: null,
	replyingTo: null,
	socket: null,
	socketConnected: false,
	socketReconnectTimer: null,
	presence: {
		room: [],
		dm: [],
		group: [],
	},
	typing: {
		room: [],
		dm: [],
		group: [],
	},
	typingStopTimer: null,
	isTyping: false,
	GIPHY_KEY: "aYV5qboS0OXbctuYc5Ww5sszFPBK5ROY",
	gifPickerOpen: false,
	gifSearchTimeout: null,
	blockedIds: new Set(),
	revealedBlockedIds: new Set(),
	currentGroupId: null,

	blockUser(userId) {
		this.sendSocketEvent({ type: "block_user", userId });
	},

	unblockUser(userId) {
		this.sendSocketEvent({ type: "unblock_user", userId });
	},

	toggleGifPicker() {
		const picker = document.getElementById("gif-picker");
		this.gifPickerOpen = !this.gifPickerOpen;
		picker.classList.toggle("open", this.gifPickerOpen);
		if (this.gifPickerOpen) {
			this.switchPickerTab("gifs");
		}
	},

	hideGifPicker() {
		this.gifPickerOpen = false;
		document.getElementById("gif-picker").classList.remove("open");
	},

	switchPickerTab(tab) {
		document.querySelectorAll(".picker-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
		const gifContent = document.getElementById("gif-tab-content");
		const quotesContent = document.getElementById("quotes-tab-content");
		if (gifContent) gifContent.style.display = tab === "gifs" ? "flex" : "none";
		if (quotesContent) quotesContent.style.display = tab === "quotes" ? "flex" : "none";
		if (tab === "quotes") this.loadSavedQuotes();
		else {
			document.getElementById("gif-search")?.focus();
			if (!this._gifTrendingCached) { this.fetchGifs(""); this._gifTrendingCached = true; }
		}
	},

	makeItAQuote(messageId, btn) {
		const msg = this.messages.find((m) => m.id === messageId);
		if (!msg || msg.message_type !== "text") return;

		document.getElementById("quote-action-menu")?.remove();

		const u = msg.username;
		const d = msg.display || msg.username;
		const a = msg.avatar_url || "/assets/img/fav.png";
		const t = msg.content.replace(/\[gif:[^\]]+\]/g, "[gif]").slice(0, 300);
		const previewText = t.length > 80 ? t.slice(0, 80) + "…" : t;

		const menu = document.createElement("div");
		menu.id = "quote-action-menu";
		menu.className = "quote-action-menu";
		menu.innerHTML = `
			<div class="qam-preview">
				<img src="${escapeHtmlAttribute(a)}" class="qam-avatar" onerror="this.src='/assets/img/fav.png'" />
				<div class="qam-info">
					<span class="qam-display">${escapeHtml(d)}</span>
					<span class="qam-text">“${escapeHtml(previewText)}”</span>
				</div>
			</div>
			<div class="qam-actions">
				<button class="qam-btn" onclick="window.chat.saveQuote(${messageId})"><i class="fas fa-bookmark"></i> Save Quote</button>
				<button class="qam-btn qam-btn-share" onclick="window.chat.shareQuoteToChat(${messageId})"><i class="fas fa-share"></i> Share in Chat</button>
			</div>`;
		document.body.appendChild(menu);

		const rect = btn.getBoundingClientRect();
		const mRect = menu.getBoundingClientRect();
		let top = rect.top - mRect.height - 8;
		if (top < 8) top = rect.bottom + 8;
		menu.style.top = `${top}px`;
		menu.style.left = `${Math.min(rect.right - mRect.width, window.innerWidth - mRect.width - 8)}px`;

		setTimeout(() => {
			const close = (e) => {
				if (!e.target.closest("#quote-action-menu")) { menu.remove(); document.removeEventListener("click", close); }
			};
			document.addEventListener("click", close);
		}, 0);
	},

	async saveQuote(messageId) {
		document.getElementById("quote-action-menu")?.remove();
		try {
			await apiRequest("/api/quotes", {
				method: "POST",
				body: { message_id: messageId },
			});
			showToast("Quote saved!", "success");
			this._savedQuotesCached = false;
		} catch (err) {
			showToast(err?.message || "Failed to save quote.", "error");
		}
	},

	async saveQuoteFromCard(btn) {
		const card = btn.closest(".quote-card");
		const srcMsgId = card?.dataset?.srcMsgId ? Number(card.dataset.srcMsgId) : null;
		if (!srcMsgId) {
			showToast("Cannot save this quote — no message reference found.", "error");
			return;
		}
		btn.disabled = true;
		try {
			await apiRequest("/api/quotes", {
				method: "POST",
				body: { source_message_id: srcMsgId },
			});
			btn.innerHTML = `<i class="fas fa-check"></i>`;
			btn.classList.add("saved");
			this._savedQuotesCached = false;
		} catch (err) {
			btn.disabled = false;
			showToast(err?.message || "Failed to save quote.", "error");
		}
	},

	async shareQuoteToChat(messageId) {
		const msg = this.messages.find((m) => m.id === messageId);
		if (!msg) return;
		document.getElementById("quote-action-menu")?.remove();
		const u = msg.username;
		const d = msg.display || msg.username;
		const a = msg.avatar_url || "";
		const t = msg.content.replace(/\[gif:[^\]]+\]/g, "[gif]").slice(0, 300);
		try {
			const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ u, d, a, t }))));
			await this.sendMessage(`[quote:${payload}]`);
		} catch (err) {
			showToast(err?.message || "Failed to share quote.", "error");
		}
	},

	async loadSavedQuotes() {
		const container = document.getElementById("quotes-results");
		if (!container) return;
		container.innerHTML = `<span class="quotes-empty">Loading…</span>`;
		try {
			const data = await apiRequest("/api/quotes");
			const quotes = Array.isArray(data.quotes) ? data.quotes : [];
			if (!quotes.length) {
				container.innerHTML = `<span class="quotes-empty">No saved quotes yet.<br>Click <i class="fas fa-quote-right" style="font-size:11px"></i> on any message to save one!</span>`;
				return;
			}
			container.innerHTML = "";
			for (const q of quotes) {
				// Drizzle returns camelCase keys
				const qUser = q.authorUsername || q.author_username || "";
				const qDisplay = q.authorDisplay || q.author_display || qUser;
				const qAvatar = q.authorAvatar || q.author_avatar || "/assets/img/fav.png";
				const qContent = q.content || "";

				const item = document.createElement("div");
				item.className = "saved-quote-item";
				const safeBg = escapeHtmlAttribute(`background-image:url(${JSON.stringify(qAvatar)})`);
				item.innerHTML = `
					<div class="sqi-bg" style="${safeBg}"></div>
					<div class="sqi-body">
						<div class="sqi-text">${escapeHtml(qContent)}</div>
						<div class="sqi-author">— ${escapeHtml(qDisplay || qUser)}</div>
					</div>
					<button class="sqi-delete" onclick="event.stopPropagation();window.chat.deleteSavedQuote(${q.id},this.closest('.saved-quote-item'))" title="Remove"><i class="fas fa-times"></i></button>`;
				item.addEventListener("click", () => {
					const payload = btoa(unescape(encodeURIComponent(JSON.stringify({
						u: qUser,
						d: qDisplay,
						a: qAvatar,
						t: qContent,
					}))));
					this.sendMessage(`[quote:${payload}]`);
					this.hideGifPicker();
				});
				container.appendChild(item);
			}
		} catch {
			container.innerHTML = `<span class="quotes-empty">Failed to load quotes.</span>`;
		}
	},

	async deleteSavedQuote(id, el) {
		try {
			await apiRequest(`/api/quotes/${id}`, { method: "DELETE" });
			el?.remove();
			const container = document.getElementById("quotes-results");
			if (container && !container.querySelector(".saved-quote-item")) {
				container.innerHTML = `<span class="quotes-empty">No saved quotes yet.<br>Click <i class="fas fa-quote-right" style="font-size:11px"></i> on any message to save one!</span>`;
			}
		} catch {
			showToast("Failed to remove quote.", "error");
		}
	},

	async fetchGifs(query) {
		const results = document.getElementById("gif-results");
		results.innerHTML = `<span style="grid-column:1/-1;font-size:12px;opacity:0.4;padding:8px 4px">Loading...</span>`;
		try {
			const endpoint = query
				? `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(query)}&api_key=${this.GIPHY_KEY}&limit=18&rating=pg`
				: `https://api.giphy.com/v1/gifs/trending?api_key=${this.GIPHY_KEY}&limit=18&rating=pg`;
			const res = await fetch(endpoint);
			const data = await res.json();
			results.innerHTML = "";
			for (const gif of data.data ?? []) {
				const preview =
					gif.images?.fixed_width_small?.url ||
					gif.images?.fixed_width?.url;
				const full =
					gif.images?.fixed_width?.url || gif.images?.original?.url;
				if (!preview || !full) continue;
				const img = document.createElement("img");
				img.src = preview;
				img.loading = "lazy";
				img.addEventListener("click", () => {
					this.sendGif(full);
					this.hideGifPicker();
				});
				results.appendChild(img);
			}
			if (!results.children.length) {
				results.innerHTML = `<span style="grid-column:1/-1;font-size:12px;opacity:0.4;padding:8px 4px">No results.</span>`;
			}
		} catch {
			results.innerHTML = `<span style="grid-column:1/-1;font-size:12px;opacity:0.4;padding:8px 4px">Failed to load.</span>`;
		}
	},

	async sendGif(url) {
		if (!isAllowedGifUrl(url)) return;
		const content = `[gif:${url}]`;
		await this.sendMessage(content);
	},

	async reportMessage(messageId) {
		const message = this.messages.find((msg) => msg.id === messageId);
		if (!message) return;
		window.chatUI.openReportModal(message);
	},

	async getDb(limit = PAGE_SIZE, beforeId = null) {
		try {
			let url = "";
			if (this.currentDmUserId) {
				url = `/api/dm/${this.currentDmUserId}?limit=${limit}`;
			} else if (this.currentGroupId) {
				url = `/api/groups/${this.currentGroupId}/messages?limit=${limit}`;
			} else {
				url = `/api/messages/${this.currentRoom || "general"}?limit=${limit}`;
			}

			if (beforeId) url += `&before=${beforeId}`;

			const payload = await apiRequest(url);
			if (this.currentDmUserId)
				this.currentDmRecipient = payload.recipient ?? null;
			const rows = Array.isArray(payload.messages) ? payload.messages : [];
			return rows.map(normalizeMessage).filter(Boolean);
		} catch {
			return [];
		}
	},

	async getBadges() {
		const metadata = await getMetaData();
		return Array.isArray(metadata?.badges) ? metadata.badges : ["user"];
	},

	async ensureCurrentUser() {
		const user = await getData();
		this._myUserId = user?.id || null;
		this._myUser = user || null;
		window._currentUsername = user?.username || "";
		return user;
	},

	isSocketReady() {
		return (
			this.socket &&
			this.socket.readyState === WebSocket.OPEN &&
			this.socketConnected
		);
	},

	sendSocketEvent(payload) {
		if (!this.isSocketReady()) return false;
		try {
			this.socket.send(JSON.stringify(payload));
			return true;
		} catch {
			return false;
		}
	},

	async connectSocket() {
		const user = await this.ensureCurrentUser();
		if (
			!user ||
			this.socketConnected ||
			this.socket?.readyState === WebSocket.CONNECTING
		)
			return;

		if (this.socketReconnectTimer) {
			clearTimeout(this.socketReconnectTimer);
			this.socketReconnectTimer = null;
		}

		const socket = new WebSocket(await getChatSocketUrl());
		this.socket = socket;

		socket.addEventListener("open", () => {
			this.socketConnected = true;
			this.socketReconnectAttempts = 0;
			this.syncSocketSubscription();
			pollDmInbox();
		});

		socket.addEventListener("message", (event) => {
			let payload = null;
			try {
				payload = JSON.parse(event.data);
			} catch {
				return;
			}

			this.handleSocketEvent(payload);
		});

		socket.addEventListener("close", (event) => {
			if (this.socket === socket) {
				this.socketConnected = false;
				this.socket = null;
				this.isTyping = false;
				this.typing.room = [];
				this.typing.dm = [];
				this.renderTypingIndicator();
				// 1008 = policy violation, used by the server for rate limiting.
				this.scheduleSocketReconnect(event && event.code === 1008);
			}
		});

		socket.addEventListener("error", () => {
			try {
				socket.close();
			} catch {}
		});
	},

	scheduleSocketReconnect(rateLimited = false) {
		if (this.socketReconnectTimer) return;

		const attempt = this.socketReconnectAttempts ?? 0;
		this.socketReconnectAttempts = attempt + 1;

		let delay;
		if (rateLimited) {
			// Server rejected us for exceeding its rate limit. Back off hard
			// instead of reconnecting in 3s and immediately re-tripping it.
			delay = SOCKET_RATE_LIMIT_BACKOFF_MS;
		} else {
			// Exponential backoff with a cap, plus jitter to avoid all clients
			// retrying in lockstep.
			const base = Math.min(
				SOCKET_RECONNECT_DELAY_MS * 2 ** attempt,
				SOCKET_RECONNECT_MAX_DELAY_MS,
			);
			delay = base / 2 + Math.random() * (base / 2);
		}

		this.socketReconnectTimer = setTimeout(() => {
			this.socketReconnectTimer = null;
			this.connectSocket();
		}, delay);
	},

	syncSocketSubscription() {
		if (!this.isSocketReady()) return;
		this.sendSocketEvent({ type: "typing_stop" });
		this.isTyping = false;

		if (this.currentDmUserId) {
			this.sendSocketEvent({
				type: "subscribe_dm",
				userId: this.currentDmUserId,
			});
			return;
		}

		if (this.currentGroupId) {
			this.sendSocketEvent({
				type: "subscribe_group",
				groupId: this.currentGroupId,
			});
			return;
		}

		this.sendSocketEvent({
			type: "subscribe_room",
			room: this.currentRoom || "general",
		});
	},

	handleSocketEvent(payload) {
		if (!payload || typeof payload !== "object") return;

		switch (payload.type) {
			case "ready":
				this._myUserId = payload.user?.id || this._myUserId || null;
				window._currentUsername =
					payload.user?.username || window._currentUsername || "";
				break;
			case "subscribed":
				break;
			case "presence_snapshot":
			case "presence_update":
				if (payload.scope === "room") {
					this.presence.room = Array.isArray(payload.users)
						? payload.users
						: [];
				} else if (payload.scope === "dm") {
					this.presence.dm = Array.isArray(payload.users)
						? payload.users
						: [];
				} else if (payload.scope === "group") {
					this.presence.group = Array.isArray(payload.users)
						? payload.users
						: [];
				}
				document.dispatchEvent(
					new CustomEvent("chat:presence", {
						detail: {
							scope: payload.scope,
							room: payload.room || null,
							userId: payload.userId || null,
							groupId: payload.groupId || null,
							users: Array.isArray(payload.users) ? payload.users : [],
						},
					}),
				);
				break;
			case "typing_update": {
				const users = Array.isArray(payload.users)
					? payload.users.filter((user) => user?.id !== this._myUserId)
					: [];
				if (payload.scope === "room") {
					this.typing.room = users;
				} else if (payload.scope === "dm") {
					this.typing.dm = users;
				} else if (payload.scope === "group") {
					this.typing.group = users;
				}
				this.renderTypingIndicator();
				break;
			}
			case "message_created": {
				const message = normalizeMessage(payload.message);
				if (!message) return;
				const isCurrentView = isMessageForCurrentView(message, this);
				if (isCurrentView) {
					const shouldScrollToBottom =
						this.isNearBottom() || message.from === this._myUserId;
					this.addOrUpdateMessage(message);
					this.upsertMessageInDom(message, { shouldScrollToBottom });
				}
				if (message.from !== this._myUserId) {
					const myName = (window._currentUsername || "").toLowerCase();
					const everyonePing = message.content && /@everyone\b/i.test(message.content);
					const mentionsMe = myName && message.content &&
						new RegExp(`@${myName}\\b`, "i").test(message.content);

					
					if (message.room && !isCurrentView) {
						if (everyonePing || mentionsMe) {
							window.chatUI?.pingChannels?.add(message.room);
						} else {
							window.chatUI?.unreadChannels?.add(message.room);
						}
						window.chatUI?.renderSidebar();
					}

					if (everyonePing || mentionsMe) {
						playMentionSound();
						sendBrowserNotification(
							everyonePing
								? `${message.from_username || "Someone"} pinged @everyone`
								: `${message.from_username || "Someone"} mentioned you`,
							message.content,
						);
					} else if (message.group_id) {
						playMessageSound();
					} else if (!message.room) {
						playDmSound();
						sendBrowserNotification(
							`DM from ${message.from_username || "Someone"}`,
							message.content,
						);
					} else {
						playMessageSound();
					}
				}
				if (!message.room && !message.group_id) {
					pollDmInbox();
				}
				break;
			}
			case "message_updated": {
				const message = normalizeMessage(payload.message);
				if (!message) return;
				if (isMessageForCurrentView(message, this)) {
					this.addOrUpdateMessage(message);
					this.renderFingerprint = "";
					this.renderMessages(false);
				}
				if (!message.room) {
					pollDmInbox();
				}
				break;
			}
			case "message_deleted":
				this.removeMessage(payload.id);
				this.renderMessages(false);
				if (!payload.room) {
					pollDmInbox();
				}
				break;
			case "dm_inbox_refresh":
				pollDmInbox();
				break;
			case "block_list":
				this.blockedIds = new Set(
					Array.isArray(payload.blockedIds) ? payload.blockedIds : [],
				);
				this.renderFingerprint = "";
				this.renderMessages(false);
				break;

			case "user_blocked":
				if (payload.blockedId) {
					this.blockedIds.add(payload.blockedId);
					this.renderFingerprint = "";
					this.renderMessages(false);
				}
				break;

			case "user_unblocked":
				if (payload.blockedId) {
					this.blockedIds.delete(payload.blockedId);
					this.revealedBlockedIds.delete(payload.blockedId);
					this.renderFingerprint = "";
					this.renderMessages(false);
				}
				break;
			case "reactions_update":
				if (typeof payload.messageId === "number") {
					this.renderReactions(payload.messageId, payload.reactions || []);
				}
				break;
			case "channel_activity": {
				const { room, from_username, content } = payload;
				if (!room) break;
				const myName = (window._currentUsername || "").toLowerCase();
				const everyonePing = content && /@everyone\b/i.test(content);
				const mentionsMe = myName && content && new RegExp(`@${myName}\\b`, "i").test(content);
				if (everyonePing || mentionsMe) {
					window.chatUI?.pingChannels?.add(room);
					playMentionSound();
					sendBrowserNotification(
						everyonePing
							? `${from_username || "Someone"} pinged @everyone in #${room}`
							: `${from_username || "Someone"} mentioned you in #${room}`,
						content,
					);
				} else {
					window.chatUI?.unreadChannels?.add(room);
					playMessageSound();
				}
				window.chatUI?.renderSidebar();
				break;
			}
			case "moderation_warning": {
				const { reason, issued_by } = payload;
				showModerationWarning(reason || "No reason provided", issued_by || "Staff");
				playMentionSound();
				break;
			}
			case "friend_request": {
				const { fromUserId, fromUsername, fromPfp } = payload;
				showFriendNotification(fromUserId, fromUsername, fromPfp, "request");
				playMentionSound();
				break;
			}
			case "friend_accepted": {
				const { fromUserId, fromUsername, fromPfp } = payload;
				showFriendNotification(fromUserId, fromUsername, fromPfp, "accepted");
				playMentionSound();
				break;
			}
			case "game_invite": {
				const { fromUserId, fromUsername, fromPfp, gameName, gameUrl } = payload;
				showGameInviteNotification(fromUserId, fromUsername, fromPfp, gameName, gameUrl);
				playMentionSound();
				break;
			}
			default:
				break;
		}
	},

	isNearBottom() {
		const container = document.getElementById("msg-container");
		if (!container) return true;
		return (
			container.scrollHeight - container.scrollTop <=
			container.clientHeight + 100
		);
	},

	addOrUpdateMessage(message) {
		const existingIndex = this.messages.findIndex((m) => m.id === message.id);
		if (existingIndex >= 0) {
			this.messages.splice(existingIndex, 1, message);
		} else {
			this.messages.push(message);
			this.messages.sort((a, b) => a.id - b.id);
		}
	},

	removeMessage(id) {
		this.messages = this.messages.filter((message) => message.id !== id);
	},

	startTyping() {
		if (!this.isSocketReady()) {
			return;
		}

		if (!this.isTyping) {
			this.isTyping = this.sendSocketEvent({ type: "typing_start" });
		}

		if (this.typingStopTimer) {
			clearTimeout(this.typingStopTimer);
		}

		this.typingStopTimer = setTimeout(() => {
			this.stopTyping();
		}, TYPING_IDLE_MS);
	},

	stopTyping() {
		if (this.typingStopTimer) {
			clearTimeout(this.typingStopTimer);
			this.typingStopTimer = null;
		}

		if (!this.isTyping) {
			return;
		}

		this.sendSocketEvent({ type: "typing_stop" });
		this.isTyping = false;
	},

	renderTypingIndicator() {
		const indicator = document.getElementById("typing-indicator");
		if (!indicator) return;

		const users = this.currentGroupId ? this.typing.group : this.currentDmUserId ? this.typing.dm : this.typing.room;
		if (!users || users.length === 0) {
			indicator.textContent = "";
			indicator.classList.remove("visible");
			return;
		}

		const names = users.map((user) => user.display || user.username);
		if (names.length === 1) {
			indicator.textContent = `${names[0]} is typing...`;
		} else if (names.length === 2) {
			indicator.textContent = `${names[0]} and ${names[1]} are typing...`;
		} else {
			indicator.textContent = `${names[0]} and ${names.length - 1} others are typing...`;
		}
		indicator.classList.add("visible");
	},

	setRoom(roomName) {
		this.stopTyping();
		this.currentRoom = roomName;
		this.currentDmUserId = null;
		this.currentDmRecipient = null;
		this.presence.dm = [];
		this.typing.dm = [];
		this.renderTypingIndicator();
		this.renderFingerprint = "";
		this.messages = [];
		this.displayLimit = PAGE_SIZE;
		this.hasMoreHistory = true;
		this.syncSocketSubscription();
		this.displayMessages(true).then(() => window.chatUI?.renderSidebar());
	},

	setDm(userId) {
		this.stopTyping();
		this.currentDmUserId = userId;
		this.currentRoom = null;
		this.currentDmRecipient = null;
		this.presence.room = [];
		this.typing.room = [];
		this.renderTypingIndicator();
		this.renderFingerprint = "";
		this.messages = [];
		this.displayLimit = PAGE_SIZE;
		this.hasMoreHistory = true;
		this.syncSocketSubscription();
		this.displayMessages(true).then(() => window.chatUI?.renderSidebar());
	},

	closeDm() {
		this.stopTyping();
		this.currentDmUserId = null;
		this.currentDmRecipient = null;
		this.renderFingerprint = "";
		this.messages = [];
		this.displayLimit = PAGE_SIZE;
		this.hasMoreHistory = true;
		this.setRoom("general");
	},

	setReply(id) {
		const msg = this.messages.find((m) => m.id === id);
		if (!msg) return;
		this.replyingTo = msg;
		const bar = document.getElementById("reply-bar");
		const name = document.getElementById("reply-bar-name");
		const preview = document.getElementById("reply-bar-preview");
		if (bar && name && preview) {
			name.textContent = msg.username;
			preview.textContent =
				msg.content.length > 80
					? `${msg.content.slice(0, 80)}...`
					: msg.content;
			bar.style.display = "flex";
		}
		document.getElementById("msg-input")?.focus();
	},

	cancelReply() {
		this.replyingTo = null;
		const bar = document.getElementById("reply-bar");
		if (bar) bar.style.display = "none";
	},

	async renderBadges(array, containerId, username = "") {
		const target = document.getElementById(containerId);
		if (!target) return;

		const { badges, shieldUsers } = await fetchBadgeConfig();
		const lowerName = username.toLowerCase();
		const config = badges[lowerName];

		if (Array.isArray(config)) {
			for (const entry of config) {
				if (entry.type === "icon" && entry.icon) {
					const el = document.createElement("i");
					el.className = `fas ${entry.icon} chat-badge`;
					el.style.background = entry.bg;
					el.style.color = entry.color;
					target.appendChild(el);
				} else if (entry.type === "text" && entry.label) {
					target.appendChild(
						makeBadge(
							entry.label,
							entry.bg,
							entry.color,
							entry.marginLeft,
						),
					);
				}
			}
		}

		if (shieldUsers.includes(lowerName)) {
			const el = document.createElement("i");
			el.className = "fas fa-shield chat-badge";
			el.style.background = "var(--accent)";
			el.style.color = "white";
			target.appendChild(el);
		}
	},

	initScrollObserver() {
		const container = document.getElementById("msg-container");
		if (!container) return;
		container.addEventListener("scroll", () => {
			if (container.scrollTop <= 80 && !this.isLoadingMore && this.hasMoreHistory) {
				this.loadMore();
			}
			const jumpBtn = document.getElementById("jump-to-bottom");
			if (jumpBtn) {
				const isNear = container.scrollHeight - container.scrollTop <= container.clientHeight + 120;
				jumpBtn.classList.toggle("visible", !isNear);
			}
		});
	},

	async loadMore() {
		if (this.isLoadingMore || !this.hasMoreHistory || this.messages.length === 0) return;
		this.isLoadingMore = true;
		const container = document.getElementById("msg-container");
		const previousHeight = container.scrollHeight;
		const oldestId = this.messages[0].id;

		const olderMsgs = await this.getDb(PAGE_SIZE, oldestId);

		if (olderMsgs.length < PAGE_SIZE) {
			this.hasMoreHistory = false;
		}
		if (olderMsgs.length > 0) {
			for (const msg of olderMsgs) {
				this.addOrUpdateMessage(msg);
			}
			this.displayLimit += olderMsgs.length;
			this.renderFingerprint = "";
			this.renderMessages(false);
			container.scrollTop = container.scrollHeight - previousHeight;
		}
		this.isLoadingMore = false;
	},

	async displayMessages(shouldScrollToBottom = false) {
		const [msgs, user] = await Promise.all([
			this.getDb(PAGE_SIZE),
			getData(),
		]);
		const container = document.getElementById("msg-container");
		const input = document.getElementById("msg-input");
		if (!container || !input) return;

		this.messages = msgs.sort((a, b) => a.id - b.id);
		this._myUserId = user?.id || null;
		this._myUser = user || null;
		window._currentUsername = user?.username || "";
		input.contentEditable = user ? "true" : "false";
		input.dataset.placeholder = user
			? "Send a message here..."
			: "You must be authenticated to chat.";

		this.renderFingerprint = "";
		this.renderMessages(shouldScrollToBottom, user);
	},

	getVisibleMessages() {
		return this.messages.slice(-this.displayLimit);
	},

	buildMessageElement(msg, user, previousMessage = null) {
		const isMe = msg.from === user?.id;
		let pfpToDisplay =
			msg.avatar_url ||
			(isMe ? user?.pfp || "/assets/img/fav.png" : "/assets/img/fav.png");
		if (pfpToDisplay.length > 1000) pfpToDisplay = "/assets/img/fav.png";

		const currentMessageTime = new Date(msg.sent_at).getTime();
		const previousMessageTime = previousMessage
			? new Date(previousMessage.sent_at).getTime()
			: null;
		const chainTimeLimit = 5 * 60 * 1000;
		const shouldChain =
			previousMessage &&
			previousMessage.from === msg.from &&
			previousMessageTime &&
			currentMessageTime - previousMessageTime < chainTimeLimit;

		const div = document.createElement("div");
		const badgeContainerId = `badges-${msg.id}-${Math.floor(Math.random() * 1000)}`;
		div.className = "message-group" + (shouldChain ? " chained" : "");
		div.dataset.msgId = String(msg.id);

		const isBlocked =
			(msg.blocked || this.blockedIds.has(msg.from)) &&
			!this.revealedBlockedIds.has(msg.from) &&
			!isMe;
		const isAdmin = Boolean(user?.is_admin);
		const safeUsernameAttr = escapeHtmlAttribute(msg.username);
		const safeUsername = escapeHtml(msg.username);
		const safeDisplay = escapeHtml(msg.display || msg.username);
		const safePfp = escapeHtmlAttribute(pfpToDisplay);

		const isActuallyBlocked = this.blockedIds.has(msg.from);
		const isTrusted = msg.trusted === true;
		const displayStyle = isTrusted ? "cursor:pointer;background:linear-gradient(90deg,var(--accent),var(--accent-2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text" : (isMe ? "" : "cursor:pointer");
		const trustedBadgeHtml = isTrusted ? `<i class="fas fa-circle-check" title="Verified account" style="font-size:11px;color:var(--accent);flex-shrink:0"></i>` : "";
		const atHtml = !isMe
			? `<span class="user-at" onclick="copyUsername('${safeUsernameAttr}')" title="Copy username">@${safeUsername}</span>`
			: "";

		const blockBtn = !isMe
			? isActuallyBlocked
				? `<button onclick="window.chat.unblockUser('${msg.from}')" title="Unblock user"><i class="fas fa-user-check"></i></button>`
				: `<button onclick="window.chat.blockUser('${msg.from}')" title="Block user"><i class="fas fa-ban"></i></button>`
			: "";

		const quoteBtn = msg.message_type === "text" && msg.content && !msg.content.startsWith("[quote:")
			? `<button onclick="window.chat.makeItAQuote(${msg.id}, this)" title="Make it a Quote"><i class="fas fa-quote-right"></i></button>`
			: "";

		const actionHtml = `<div class="message-actions">
        <button onclick="window.chat.setReply(${msg.id})" title="Reply"><i class="fas fa-reply"></i></button>
        <button onclick="window.chat.openReactPicker(${msg.id}, this)" title="React"><i class="fas fa-face-smile"></i></button>
        ${quoteBtn}
        ${!isMe ? `<button onclick="window.chat.reportMessage(${msg.id})" title="Report message"><i class="fas fa-flag"></i></button>` : ""}
        ${blockBtn}
        ${isAdmin && !isMe ? `<button onclick="window.chat.muteUser('${msg.from}', '${safeUsernameAttr}')" title="Mute user"><i class="fas fa-microphone-slash"></i></button>` : ""}
        ${isMe ? `<button onclick="window.chat.editMessage(${msg.id})" title="Edit message"><i class="fas fa-pen"></i></button>` : ""}
        ${isMe || isAdmin ? `<button onclick="window.chat.deleteMessage(${msg.id})" title="Delete"><i class="fas fa-trash"></i></button>` : ""}
    </div>`;

		const replyMsg = msg.reply_to_id
			? this.messages.find((m) => m.id === msg.reply_to_id)
			: null;
		const replyPreviewText = replyMsg
			? escapeHtml(
					replyMsg.content.length > 60
						? `${replyMsg.content.slice(0, 60)}...`
						: replyMsg.content,
				)
			: "";
		const replyPreviewHtml = replyMsg
			? `<div class="reply-preview" onclick="window.chat.scrollToMessage(${replyMsg.id})"><span class="reply-preview-name">${escapeHtml(replyMsg.username)}</span><span class="reply-preview-text">${replyPreviewText}</span></div>`
			: "";

		if (isBlocked) {
			if (shouldChain) {
				div.innerHTML = `<div class="message-details">
                <div class="message-text" style="opacity:0.35;font-size:0.85rem;font-style:italic;cursor:pointer;" onclick="window.chat.revealBlocked('${msg.from}')">
                    — blocked message — <span style="text-decoration:underline;opacity:0.7;">click to reveal</span>
                </div>
            </div>${actionHtml}`;
			} else {
				div.innerHTML = `<img src="${safePfp}" alt="pfp" class="user-pfp" style="opacity:0.3;" />
            <div class="message-details">
                ${replyPreviewHtml}
                <div class="message-info">
                    <span class="user-name" style="opacity:0.35;">${safeUsername}</span>
                </div>
                <div class="message-text" style="opacity:0.35;font-size:0.85rem;font-style:italic;cursor:pointer;" onclick="window.chat.revealBlocked('${msg.from}')">
                    — blocked message — <span style="text-decoration:underline;opacity:0.7;">click to reveal</span>
                </div>
            </div>${actionHtml}`;
			}
			return div;
		}

		const profileClickAttr = !isMe
			? `onclick="showUserProfile('${safeUsernameAttr}')"`
			: "";
		const relTime = formatRelativeTime(msg.sent_at);
		const fullTime = new Date(msg.sent_at).toLocaleString();
		const reactBarId = `reactions-${msg.id}`;

		let msgBodyHtml;
		let _embedUrl = null;
		if (msg.message_type === "image" && msg.attachment_url) {
			const safeAttUrl = escapeHtmlAttribute(msg.attachment_url);
			msgBodyHtml = `<div class="message-text"><img src="${safeAttUrl}" class="chat-image-attachment" alt="image" loading="lazy" onclick="window.open(this.src,'_blank','noopener,noreferrer')" /></div>`;
		} else if (msg.message_type === "voice" && msg.attachment_url) {
			const safeAttUrl = escapeHtmlAttribute(msg.attachment_url);
			const bars = buildVoiceWaveform(msg.attachment_url);
			msgBodyHtml = `<div class="message-text"><div class="voice-msg" data-src="${safeAttUrl}">
				<button class="voice-play-btn" onclick="window.voicePlayerToggle(this)" aria-label="Play"><i class="fas fa-play"></i></button>
				<div class="voice-waveform" onclick="window.voiceSeek(this,event)">${bars}</div>
				<span class="voice-time">0:00</span>
			</div></div>`;
		} else {
			msgBodyHtml = `<div class="message-text">${parseMentions(parseLinks(parseMarkdown(parseEmoji(msg.content), msg.id)))}</div>`;
			_embedUrl = extractFirstEmbedUrl(msg.content);
		}
		const embedContainerHtml = _embedUrl
			? `<div class="link-embed-container" data-url="${escapeHtmlAttribute(_embedUrl)}"></div>`
			: "";

		if (shouldChain) {
			div.innerHTML = `<div class="message-details">${replyPreviewHtml}${msgBodyHtml}${embedContainerHtml}<div class="reaction-bar" id="${reactBarId}"></div></div>${actionHtml}`;
		} else {
			div.innerHTML = `<img src="${safePfp}" alt="pfp" class="user-pfp" /><div class="message-details">${replyPreviewHtml}<div class="message-info"><span class="user-name-wrap"><span class="user-name" ${profileClickAttr} style="${displayStyle}">${safeDisplay}</span>${trustedBadgeHtml}${atHtml}</span><div id="${badgeContainerId}" class="badge-container"></div><span class="message-time" title="${escapeHtmlAttribute(fullTime)}">${relTime}</span></div>${msgBodyHtml}${embedContainerHtml}<div class="reaction-bar" id="${reactBarId}"></div></div>${actionHtml}`;
		}

		if (_embedUrl) {
			const embedContainer = div.querySelector(".link-embed-container");
			if (embedContainer) loadLinkEmbed(embedContainer);
		}

		return div;
	},

	revealBlocked(userId) {
		this.revealedBlockedIds.add(userId);
		this.renderFingerprint = "";
		this.renderMessages(false);
	},

	upsertMessageInDom(
		message,
		{ shouldScrollToBottom = false, userOverride = null } = {},
	) {
		const container = document.getElementById("msg-container");
		if (!container) return;

		const user = userOverride ?? this._myUser ?? null;
		const visibleMessages = this.getVisibleMessages();
		const visibleIndex = visibleMessages.findIndex(
			(msg) => msg.id === message.id,
		);
		if (visibleIndex === -1) {
			this.renderFingerprint = "";
			this.renderMessages(shouldScrollToBottom, user);
			return;
		}

		const existingEl = container.querySelector(
			`.message-group[data-msg-id="${message.id}"]`,
		);
		if (existingEl) {
			const previousMessage =
				visibleIndex > 0 ? visibleMessages[visibleIndex - 1] : null;
			const messageEl = this.buildMessageElement(
				message,
				user,
				previousMessage,
			);
			existingEl.replaceWith(messageEl);
			const badgeContainer = messageEl.querySelector(".badge-container");
			if (badgeContainer?.id) {
				this.renderBadges(
					message.badges,
					badgeContainer.id,
					message.username,
				);
			}
		} else if (visibleIndex === visibleMessages.length - 1) {
			const previousMessage =
				visibleIndex > 0 ? visibleMessages[visibleIndex - 1] : null;
			const messageEl = this.buildMessageElement(
				message,
				user,
				previousMessage,
			);
			container.appendChild(messageEl);
			const badgeContainer = messageEl.querySelector(".badge-container");
			if (badgeContainer?.id) {
				this.renderBadges(
					message.badges,
					badgeContainer.id,
					message.username,
				);
			}

			while (container.children.length > visibleMessages.length) {
				container.removeChild(container.firstElementChild);
			}
		} else {
			this.renderFingerprint = "";
			this.renderMessages(shouldScrollToBottom, user);
			return;
		}

		this.renderFingerprint = JSON.stringify(
			visibleMessages.map((msg) => [
				msg.id,
				msg.from,
				msg.content,
				msg.username,
				msg.badges,
			]),
		);

		if (shouldScrollToBottom) {
			container.scrollTop = container.scrollHeight;
		}
	},

	renderMessages(shouldScrollToBottom = false, userOverride = null) {
		const container = document.getElementById("msg-container");
		const input = document.getElementById("msg-input");
		if (!container || !input) return;

		const user = userOverride ?? this._myUser ?? null;

		const visibleMessages = this.getVisibleMessages();
		const signature = JSON.stringify(
			visibleMessages.map((msg) => [
				msg.id,
				msg.from,
				msg.content,
				msg.username,
				msg.badges,
			]),
		);
		if (signature === this.renderFingerprint) return;
		this.renderFingerprint = signature;

		container.innerHTML = "";
		let previousMessage = null;

		for (const msg of visibleMessages) {
			const messageEl = this.buildMessageElement(msg, user, previousMessage);
			container.appendChild(messageEl);
			const badgeContainer = messageEl.querySelector(".badge-container");
			if (badgeContainer?.id) {
				this.renderBadges(msg.badges, badgeContainer.id, msg.username);
			}
			previousMessage = msg;
		}

		if (shouldScrollToBottom) container.scrollTop = container.scrollHeight;
	},

	async sendMessage(msg) {
		if (!msg.trim()) return;
		const user = await getData();
		if (!user) return;

		const badgeData = await this.getBadges();
		const rawPfp = user.pfp || "/assets/img/fav.png";
		const safePfp =
			!rawPfp || rawPfp.length > 1000 || rawPfp.startsWith("data:")
				? "/assets/img/fav.png"
				: rawPfp;

		const msgContent = {
			from: user.id,
			username: user.username,
			avatar_url: safePfp,
			sent_at: new Date().toISOString(),
			content: escapeChars(
				msg
					.trim()
					.replace(/[\u00AD\u200B\u200C\u2800\uFEFF]|\u200D/g, "")
					.replace(/\n{3,}/g, "\n\n"),
			),
			badges: badgeData,
		};

		const container = document.getElementById("msg-container");
		const safeGhostPfp = escapeHtmlAttribute(msgContent.avatar_url);
		const safeGhostUsername = escapeHtml(msgContent.username);
		const ghostMessage = document.createElement("div");
		ghostMessage.className = "message-group ghost";
		const badgeContainerId =
			"ghost-badge-" + Math.floor(Math.random() * 99999);

		ghostMessage.innerHTML = `
        <img src="${safeGhostPfp}" alt="pfp" class="user-pfp" />
        <div class="message-details">
            <div class="message-info">
                <span class="user-name">${safeGhostUsername}</span>
                <div id="${badgeContainerId}" class="badge-container"></div>
                <span class="message-time">Sending...</span>
            </div>
            <div class="message-text">${parseLinks(parseMarkdown(parseEmoji(msg)))}</div>
        </div>
    `;

		container.appendChild(ghostMessage);
		this.renderBadges(badgeData, badgeContainerId, msgContent.username);
		container.scrollTop = container.scrollHeight;

		const replyToId = this.replyingTo?.id ?? null;
		this.cancelReply();
		this.stopTyping();

		try {
			let response = null;
			if (this.currentDmUserId) {
				response = await apiRequest(`/api/dm/${this.currentDmUserId}`, {
					method: "POST",
					body: { content: msgContent.content, reply_to_id: replyToId },
				});
			} else if (this.currentGroupId) {
				response = await apiRequest(
					`/api/groups/${this.currentGroupId}/messages`,
					{
						method: "POST",
						body: { content: msgContent.content, reply_to_id: replyToId },
					},
				);
			} else {
				const room = this.currentRoom || "general";
				response = await apiRequest(`/api/messages/${room}`, {
					method: "POST",
					body: { content: msgContent.content, reply_to_id: replyToId },
				});
			}

			ghostMessage.remove();
			const createdMessage = normalizeMessage(response?.message);
			if (createdMessage) {
				this.addOrUpdateMessage(createdMessage);
				this.upsertMessageInDom(createdMessage, {
					shouldScrollToBottom: true,
					userOverride: user,
				});
			}
		} catch {
			ghostMessage.style.color = "red";
			const timeEl = ghostMessage.querySelector(".message-time");
			if (timeEl) timeEl.innerText = "Failed to send";
		}
	},

	async sendMediaMessage(file, messageType) {
		const user = await getData();
		if (!user) { showToast("You must be logged in to send media.", "error"); return; }

		const endpoint = messageType === "image" ? "/api/upload/image" : "/api/upload/voice";
		const formData = new FormData();
		formData.append("file", file);

		let uploadRes;
		try {
			const res = await fetch(endpoint, {
				method: "POST",
				credentials: "same-origin",
				body: formData,
			});
			uploadRes = await res.json().catch(() => ({}));
			if (!res.ok) {
				showToast(uploadRes.error || "Upload failed", "error");
				return;
			}
		} catch {
			showToast("Upload failed", "error");
			return;
		}

		const attachmentUrl = uploadRes.url;

		try {
			let response;
			if (this.currentDmUserId) {
				response = await apiRequest(`/api/dm/${this.currentDmUserId}`, {
					method: "POST",
					body: { content: "", message_type: messageType, attachment_url: attachmentUrl },
				});
			} else if (this.currentGroupId) {
				response = await apiRequest(`/api/groups/${this.currentGroupId}/messages`, {
					method: "POST",
					body: { content: "", message_type: messageType, attachment_url: attachmentUrl },
				});
			} else {
				const room = this.currentRoom || "general";
				response = await apiRequest(`/api/messages/${room}`, {
					method: "POST",
					body: { content: "", message_type: messageType, attachment_url: attachmentUrl },
				});
			}
			const createdMessage = normalizeMessage(response?.message);
			if (createdMessage) {
				this.addOrUpdateMessage(createdMessage);
				this.upsertMessageInDom(createdMessage, { shouldScrollToBottom: true, userOverride: user });
			}
		} catch {
			showToast("Failed to send message", "error");
		}
	},

	editMessage(id) {
		const container = document.getElementById("msg-container");
		const msgEl = container?.querySelector(`.message-group[data-msg-id="${id}"]`);
		if (!msgEl || msgEl.dataset.editing === "1") return;
		const msg = this.messages.find((m) => m.id === id);
		if (!msg) return;
		msgEl.dataset.editing = "1";
		const textEl = msgEl.querySelector(".message-text");
		if (!textEl) return;
		const editWrap = document.createElement("div");
		editWrap.className = "inline-edit-wrap";
		const input = document.createElement("div");
		input.className = "inline-edit-input";
		input.contentEditable = "true";
		input.textContent = msg.content;
		const actions = document.createElement("div");
		actions.className = "inline-edit-actions";
		actions.innerHTML = `<span class="inline-edit-hint">esc to cancel · enter to save</span>
			<button class="btn btn-ghost" style="padding:3px 10px;font-size:0.8rem;" onclick="window.chat.cancelEdit(${id})">Cancel</button>
			<button class="btn btn-primary" style="padding:3px 10px;font-size:0.8rem;" onclick="window.chat.saveEdit(${id})">Save</button>`;
		editWrap.appendChild(input);
		editWrap.appendChild(actions);
		textEl.replaceWith(editWrap);
		input.focus();
		const range = document.createRange();
		range.selectNodeContents(input);
		range.collapse(false);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.saveEdit(id); }
			if (e.key === "Escape") this.cancelEdit(id);
		});
	},

	cancelEdit(id) {
		const container = document.getElementById("msg-container");
		const msgEl = container?.querySelector(`.message-group[data-msg-id="${id}"]`);
		if (!msgEl) return;
		delete msgEl.dataset.editing;
		this.renderFingerprint = "";
		this.renderMessages(false);
	},

	async saveEdit(id) {
		const container = document.getElementById("msg-container");
		const msgEl = container?.querySelector(`.message-group[data-msg-id="${id}"]`);
		if (!msgEl) return;
		const input = msgEl.querySelector(".inline-edit-input");
		if (!input) return;
		const newContent = escapeChars(
			input.innerText.trim().replace(/[­​‌⠀﻿]|‍/g, "").replace(/\n{3,}/g, "\n\n"),
		);
		if (!newContent) return;
		try {
			await apiRequest(`/api/messages/${id}`, { method: "PUT", body: { content: newContent } });
			const existing = this.messages.find((m) => m.id === id);
			if (existing) existing.content = newContent;
			delete msgEl.dataset.editing;
			this.renderFingerprint = "";
			this.renderMessages(false);
			showToast("Message edited", "success");
		} catch (e) {
			showToast(e?.message || "Failed to edit message", "error");
		}
	},

	async deleteMessage(id) {
		try {
			await apiRequest(`/api/messages/${id}`, { method: "DELETE" });
			this.renderFingerprint = "";
			this.removeMessage(id);
			this.renderMessages(false);
		} catch {}
	},

	muteUser(userId, username) {
		document.dispatchEvent(
			new CustomEvent("chat:open-mute-modal", { detail: { userId, username } }),
		);
	},

	async executeMute(userId, username, minutes) {
		try {
			const response = await apiRequest(
				`/api/admin/users/${userId}/mute-chat`,
				{ method: "POST", body: { minutes } },
			);
			const until = response?.muted_until
				? new Date(response.muted_until).toLocaleString()
				: `${minutes} minute(s) from now`;
			showToast(`${username} muted until ${until}`, "success");
		} catch (error) {
			showToast(error?.message || "Failed to mute user", "error");
		}
	},

	renderReactions(messageId, reactions) {
		const container = document.getElementById("msg-container");
		const bar = container?.querySelector(`#reactions-${messageId}`);
		if (!bar) return;
		if (!reactions || reactions.length === 0) { bar.innerHTML = ""; return; }
		bar.innerHTML = reactions.map((r) => {
			const isMe = r.users.includes(this._myUserId);
			const safeEmoji = escapeHtmlAttribute(r.emoji);
			return `<button class="reaction-pill${isMe ? " me" : ""}" title="${r.users.join(", ")}"
				onclick="window.chat.sendSocketEvent({type:'reaction_toggle',messageId:${messageId},emoji:'${safeEmoji}'})">${r.emoji} <span>${r.count}</span></button>`;
		}).join("");
	},

	openReactPicker(messageId, btn) {
		const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "✅"];
		const existing = document.getElementById("quick-react-picker");
		if (existing) { existing.remove(); if (existing.dataset.msgId === String(messageId)) return; }
		const picker = document.createElement("div");
		picker.id = "quick-react-picker";
		picker.dataset.msgId = String(messageId);
		picker.innerHTML = QUICK_EMOJIS.map((e) =>
			`<button onclick="window.chat.sendSocketEvent({type:'reaction_toggle',messageId:${messageId},emoji:'${e}'});document.getElementById('quick-react-picker')?.remove()">${e}</button>`
		).join("");
		const rect = btn.getBoundingClientRect();
		picker.style.cssText = `position:fixed;top:${rect.top - 46}px;left:${rect.left}px;z-index:200;background:var(--bg-2);border:1px solid var(--border-4);border-radius:12px;padding:4px 6px;display:flex;gap:2px;box-shadow:0 4px 16px rgba(0,0,0,0.4)`;
		document.body.appendChild(picker);
		const close = (e) => { if (!picker.contains(e.target) && e.target !== btn) { picker.remove(); document.removeEventListener("click", close); } };
		setTimeout(() => document.addEventListener("click", close), 10);
	},

	scrollToMessage(id) {
		const container = document.getElementById("msg-container");
		const all = container.querySelectorAll(".message-group");
		for (const el of all) {
			if (el.dataset.msgId === String(id)) {
				el.scrollIntoView({ behavior: "smooth", block: "center" });
				el.classList.add("highlight");
				setTimeout(() => el.classList.remove("highlight"), 1500);
				return;
			}
		}
	},

	setGroup(groupId, groupName) {
		this.stopTyping();
		this.currentGroupId = groupId;
		this.currentRoom = null;
		this.currentDmUserId = null;
		this.currentDmRecipient = null;
		this.presence.room = [];
		this.presence.dm = [];
		this.presence.group = [];
		this.typing.room = [];
		this.typing.dm = [];
		this.typing.group = [];
		this.renderTypingIndicator();
		this.renderFingerprint = "";
		this.messages = [];
		this.displayLimit = PAGE_SIZE;
		this.hasMoreHistory = true;
		this.syncSocketSubscription();
		this.displayMessages(true).then(() => window.chatUI?.renderSidebar());
	},
};

const msgInput = document.getElementById("msg-input");
const msgToolbar = document.getElementById("msg-toolbar");
const msgPreview = document.getElementById("msg-preview");

msgInput.addEventListener("focus", () => {
	msgToolbar.classList.add("visible");
});
msgInput.addEventListener("blur", () => {
	setTimeout(() => {
		if (!msgToolbar.matches(":hover")) msgToolbar.classList.remove("visible");
	}, 150);
	setTimeout(hideEmojiPicker, 100);
	window.chat.stopTyping();
});

msgInput.addEventListener("input", () => {
	const cleaned = msgInput.innerText.replace(
		/[\u00AD\u200B\u200C\u200D\u2800\uFEFF]/g,
		"",
	);
	if (cleaned !== msgInput.innerText) {
		msgInput.innerText = cleaned;
		const range = document.createRange();
		range.selectNodeContents(msgInput);
		range.collapse(false);
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	}
	if (msgInput.innerText.length > MAX_MESSAGE_LENGTH) {
		msgInput.innerText = msgInput.innerText.slice(0, MAX_MESSAGE_LENGTH);
		const range = document.createRange();
		range.selectNodeContents(msgInput);
		range.collapse(false);
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	}

	const text = msgInput.innerText;
	// Slash command autocomplete — only when / is the very first char
	if (text.startsWith("/") && !text.includes(" ")) {
		const query = text.slice(1).toLowerCase();
		const isAdminLocal = ["x8r","sprintingsnail","technonyte","dinguschan","syntaxerror52","yash","josh22_28","yzycoin","beetlejuice","snake","blairebear",].includes(window._currentUsername || "");
		const matches = SLASH_COMMANDS.filter(c => (!c.mod || isAdminLocal) && c.name.startsWith(query));
		if (matches.length) showSlashPicker(matches);
		else hideSlashPicker();
	} else {
		hideSlashPicker();
	}

	const colonIdx = text.lastIndexOf(":");
	if (colonIdx !== -1) {
		const query = text.slice(colonIdx + 1);
		if (query && !query.includes(" ")) {
			const matches = Object.keys(EMOJI_MAP)
				.filter((k) => k.startsWith(query))
				.slice(0, 8);
			if (matches.length) showEmojiPicker(matches);
			else hideEmojiPicker();
		} else {
			hideEmojiPicker();
		}
	} else {
		hideEmojiPicker();
	}

	const atIdx = text.lastIndexOf("@");
	if (atIdx !== -1) {
		const query = text.slice(atIdx + 1);
		if (!query.includes(" ") && !query.includes("\n")) {
			const presentUsers = [
				...(window.chat?.presence?.room || []),
				...(window.chat?.presence?.dm || []),
				...(window.chat?.presence?.group || []),
			].filter((u, i, arr) => u && u.username && arr.findIndex(x => x?.id === u.id) === i);
			const matches = presentUsers
				.filter((u) => u.username.toLowerCase().startsWith(query.toLowerCase()) &&
					u.id !== window.chat?._myUserId)
				.slice(0, 6);
			if (matches.length) showMentionPicker(matches);
			else hideMentionPicker();
		} else {
			hideMentionPicker();
		}
	} else {
		hideMentionPicker();
	}

	const hasMarkdown = /[*_~`#]/.test(text);
	if (hasMarkdown && text.trim()) {
		msgPreview.innerHTML = parseMarkdown(parseEmoji(text));
		msgPreview.classList.add("visible");
	} else {
		msgPreview.classList.remove("visible");
	}

	const counter = document.getElementById("char-counter");
	if (counter) {
		counter.textContent = `${text.length}/${MAX_MESSAGE_LENGTH}`;
		counter.style.color =
			text.length >= MAX_MESSAGE_LENGTH
				? "red"
				: text.length > MAX_MESSAGE_LENGTH * 0.85
					? "orange"
					: "var(--text-3)";
	}

	if (text.trim()) {
		window.chat.startTyping();
	} else {
		window.chat.stopTyping();
	}
});

msgInput.addEventListener("keydown", (event) => {
	const replaced = msgInput.innerText.replace(
		/:([a-zA-Z0-9_+\-]+):/g,
		(match, name) => {
			return EMOJI_MAP[name] ?? match;
		},
	);
	if (replaced !== msgInput.innerText) {
		const sel = window.getSelection();
		const offset = sel.getRangeAt(0).startOffset;
		msgInput.innerText = replaced;
		try {
			const range = document.createRange();
			const node = msgInput.firstChild;
			if (node) {
				range.setStart(node, Math.min(offset, node.length));
				range.collapse(true);
				sel.removeAllRanges();
				sel.addRange(range);
			}
		} catch {}
	}
	if (emojiPickerMatches.length) {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			emojiPickerIndex = (emojiPickerIndex + 1) % emojiPickerMatches.length;
			highlightEmojiPicker();
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			emojiPickerIndex =
				(emojiPickerIndex - 1 + emojiPickerMatches.length) %
				emojiPickerMatches.length;
			highlightEmojiPicker();
			return;
		}
		if (event.key === "Tab") {
			event.preventDefault();
			insertPickerEmoji(emojiPickerMatches[emojiPickerIndex]);
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			insertPickerEmoji(emojiPickerMatches[emojiPickerIndex]);
			return;
		}
		if (event.key === "Escape") {
			hideEmojiPicker();
			return;
		}
	}
	if (slashPickerMatches.length) {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			slashPickerIndex = (slashPickerIndex + 1) % slashPickerMatches.length;
			highlightSlashPicker();
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			slashPickerIndex = (slashPickerIndex - 1 + slashPickerMatches.length) % slashPickerMatches.length;
			highlightSlashPicker();
			return;
		}
		if (event.key === "Tab" || (event.key === "Enter" && slashPickerMatches.length > 0 && !msgInput.innerText.includes(" "))) {
			event.preventDefault();
			insertSlashCommand(slashPickerMatches[slashPickerIndex]);
			return;
		}
		if (event.key === "Escape") {
			hideSlashPicker();
			return;
		}
	}
	if (mentionPickerMatches.length) {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			mentionPickerIndex = (mentionPickerIndex + 1) % mentionPickerMatches.length;
			highlightMentionPicker();
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			mentionPickerIndex =
				(mentionPickerIndex - 1 + mentionPickerMatches.length) %
				mentionPickerMatches.length;
			highlightMentionPicker();
			return;
		}
		if (event.key === "Tab" || event.key === "Enter") {
			event.preventDefault();
			insertMention(mentionPickerMatches[mentionPickerIndex].username);
			return;
		}
		if (event.key === "Escape") {
			hideMentionPicker();
			return;
		}
	}
	if (
		event.key !== "Backspace" &&
		event.key !== "Delete" &&
		!event.ctrlKey &&
		!event.metaKey &&
		msgInput.innerText.length >= MAX_MESSAGE_LENGTH
	) {
		event.preventDefault();
		return;
	}
	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		if (msgInput._slowmode) return;
		const text = msgInput.innerText;
		if (text.trim()) {
			if (text.trim().startsWith("/")) {
				hideSlashPicker();
				hideMentionPicker();
				hideEmojiPicker();
				msgInput.innerText = "";
				msgPreview.classList.remove("visible");
				window.chat.stopTyping();
				handleSlashCommand(text.trim());
			} else {
				window.chat.sendMessage(text);
				msgInput.innerText = "";
				msgPreview.classList.remove("visible");
				window.chat.stopTyping();
				msgInput._slowmode = true;
				setTimeout(() => { msgInput._slowmode = false; }, 500);
			}
		}
	}
});

document.getElementById("gif-search").addEventListener("input", (e) => {
	clearTimeout(window.chat.gifSearchTimeout);
	window.chat.gifSearchTimeout = setTimeout(() => {
		window.chat.fetchGifs(e.target.value.trim());
	}, 800);
});

document.getElementById("gif-search").addEventListener("keydown", (e) => {
	if (e.key === "Escape") window.chat.hideGifPicker();
});

document.addEventListener("click", (e) => {
	if (!e.target.closest("#gif-picker") && !e.target.closest("#msg-toolbar")) {
		window.chat.hideGifPicker();
	}
});

window.chat.formatText = function (type) {
	msgInput.focus();
	const sel = window.getSelection();
	const selected = sel?.toString() ?? "";
	const map = {
		bold: `**${selected || "bold text"}**`,
		italic: `*${selected || "italic text"}*`,
		strike: `~~${selected || "text"}~~`,
		underline: `__${selected || "text"}__`,
		code: `\`${selected || "code"}\``,
		codeblock: `\`\`\`\n${selected || "code"}\n\`\`\``,
		h1: `# ${selected || "Heading"}`,
		h2: `## ${selected || "Heading"}`,
	};
	const snippet = map[type];
	if (!snippet) return;
	document.execCommand("insertText", false, snippet);
	msgInput.dispatchEvent(new Event("input"));
};

window.chat.initScrollObserver();
window.chat.setRoom("general");
window.chat.connectSocket();
fetchBadgeConfig();

setInterval(() => {
	const container = document.getElementById("msg-container");
	if (!container) return;
	container.querySelectorAll(".message-time").forEach((el) => {
		const full = el.title;
		if (full) el.textContent = formatRelativeTime(new Date(full).toISOString());
	});
}, 60000);

setInterval(() => {
	if (window.chat.isSocketReady()) {
		return;
	}
	window.chat.displayMessages(window.chat.isNearBottom());
}, CHAT_FALLBACK_POLL_INTERVAL_MS);

async function pollDmInboxNow() {
	try {
		const payload = await apiRequest("/api/dm/inbox");
		const threads = Array.isArray(payload.threads) ? payload.threads : [];
		window.chatUI?.updateDmInbox(threads);
	} catch {}
}

let _dmInboxPollTimer = null;


function pollDmInbox() {
	if (_dmInboxPollTimer) return;
	_dmInboxPollTimer = setTimeout(() => {
		_dmInboxPollTimer = null;
		pollDmInboxNow();
	}, DM_INBOX_POLL_DEBOUNCE_MS);
}

document.getElementById("msg-container").addEventListener("click", (e) => {
	const a = e.target.closest("a[data-external]");
	if (!a) return;
	e.preventDefault();
	const url = a.getAttribute("href");
	document.getElementById("leaving-url").textContent = url;
	document.getElementById("leaving-continue").onclick = () => {
		window.open(url, "_blank", "noopener,noreferrer");
		window.chatUI.closeModal("modal-leaving");
	};
	document.getElementById("modal-leaving").classList.add("open");
});

setInterval(() => {
	if (window.chat.isSocketReady()) {
		return;
	}
	pollDmInbox();
}, DM_INBOX_POLL_INTERVAL_MS);
pollDmInbox();
