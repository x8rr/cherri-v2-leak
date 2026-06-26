document.getElementById("csslink") &&
	(document.getElementById("csslink").href =
		`/assets/css/colors/${localStorage.getItem("cherri_theme") || "default"}.css`);
const BASE = "/api/ai/chat";
const MAX_CONTEXT = 15;
const STORAGE_KEY = "cherri_chats";
const md = window.markdownit({
	html: false,
	linkify: true,
	typographer: true,
	highlight(str, lang) {
		if (lang && hljs.getLanguage(lang)) {
			try {
				return (
					'<pre class="hljs"><code class="language-' +
					lang +
					'">' +
					hljs.highlight(str, { language: lang, ignoreIllegals: true })
						.value +
					"</code></pre>"
				);
			} catch {}
		}
		return (
			'<pre class="hljs"><code' +
			(lang ? ' class="language-' + lang + '"' : "") +
			">" +
			str
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;") +
			"</code></pre>"
		);
	},
});
let chats = [];
let activeChatId = null;
let isGenerating = false;
let currentModel = "gpt-5.4-mini";
let pendingImages = [];
let renamingChatId = null;
let abortController = null;
function saveToStorage() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
	} catch {}
}
function loadFromStorage() {
	try {
		chats = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
	} catch {
		chats = [];
	}
}
function generateId() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function createChat(title = "New Chat") {
	const chat = {
		id: generateId(),
		title,
		messages: [],
		model: currentModel,
		createdAt: Date.now(),
	};
	chats.unshift(chat);
	saveToStorage();
	return chat;
}
function getActiveChat() {
	return chats.find((c) => c.id === activeChatId) || null;
}
function renderSidebar(filter = "") {
	const list = document.getElementById("chats-list");
	const noMsg = document.getElementById("no-chats-msg");
	const filtered = filter
		? chats.filter((c) =>
				c.title.toLowerCase().includes(filter.toLowerCase()),
			)
		: chats;

	const existing = list.querySelectorAll(".chat-item, .chats-section-label");
	existing.forEach((el) => el.remove());
	if (filtered.length === 0) {
		noMsg.style.display = "block";
		return;
	}
	noMsg.style.display = "none";
	const now = Date.now();
	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const yesterdayStart = new Date(todayStart);
	yesterdayStart.setDate(yesterdayStart.getDate() - 1);
	const weekStart = new Date(todayStart);
	weekStart.setDate(weekStart.getDate() - 7);
	const sections = [
		{ label: "Today", items: [] },
		{ label: "Yesterday", items: [] },
		{ label: "Last 7 days", items: [] },
		{ label: "Older", items: [] },
	];
	filtered.forEach((chat) => {
		const d = chat.createdAt;
		if (d >= todayStart.getTime()) sections[0].items.push(chat);
		else if (d >= yesterdayStart.getTime()) sections[1].items.push(chat);
		else if (d >= weekStart.getTime()) sections[2].items.push(chat);
		else sections[3].items.push(chat);
	});
	sections.forEach(({ label, items }) => {
		if (items.length === 0) return;
		const labelEl = document.createElement("div");
		labelEl.className = "chats-section-label";
		labelEl.textContent = label;
		list.appendChild(labelEl);
		items.forEach((chat) => list.appendChild(buildChatItem(chat)));
	});
}
function buildChatItem(chat) {
	const item = document.createElement("div");
	item.className = "chat-item" + (chat.id === activeChatId ? " active" : "");
	item.dataset.id = chat.id;
	item.innerHTML = `
        <i class="far fa-comment chat-item-icon"></i>
        <span class="chat-item-title">${escHtml(chat.title)}</span>
        <div class="chat-item-actions">
            <button class="chat-action-btn rename-btn" title="Rename"><i class="far fa-pen"></i></button>
            <button class="chat-action-btn delete delete-btn" title="Delete"><i class="far fa-trash"></i></button>
        </div>`;
	item
		.querySelector(".chat-item-title")
		.addEventListener("click", () => switchChat(chat.id));
	item
		.querySelector(".chat-item-icon")
		.addEventListener("click", () => switchChat(chat.id));
	item.querySelector(".rename-btn").addEventListener("click", (e) => {
		e.stopPropagation();
		openRenameModal(chat.id);
	});
	item.querySelector(".delete-btn").addEventListener("click", (e) => {
		e.stopPropagation();
		deleteChat(chat.id);
	});
	return item;
}
function escHtml(str) {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
function switchChat(id) {
	activeChatId = id;
	renderSidebar(document.getElementById("search-input").value);
	renderMessages();
	closeMobileSidebar();
}
function deleteChat(id) {
	chats = chats.filter((c) => c.id !== id);
	saveToStorage();
	if (activeChatId === id) {
		activeChatId = chats.length ? chats[0].id : null;
		renderMessages();
	}
	renderSidebar(document.getElementById("search-input").value);
}
function openRenameModal(id) {
	renamingChatId = id;
	const chat = chats.find((c) => c.id === id);
	document.getElementById("rename-input").value = chat ? chat.title : "";
	document.getElementById("rename-modal").classList.add("show");
	setTimeout(() => document.getElementById("rename-input").select(), 50);
}
function closeRenameModal() {
	document.getElementById("rename-modal").classList.remove("show");
	renamingChatId = null;
}
document
	.getElementById("rename-cancel")
	.addEventListener("click", closeRenameModal);
document.getElementById("rename-confirm").addEventListener("click", () => {
	if (!renamingChatId) return;
	const val = document.getElementById("rename-input").value.trim();
	if (!val) return;
	const chat = chats.find((c) => c.id === renamingChatId);
	if (chat) {
		chat.title = val;
		saveToStorage();
	}
	renderSidebar(document.getElementById("search-input").value);
	if (renamingChatId === activeChatId) updateHeaderTitle(val);
	closeRenameModal();
});
document.getElementById("rename-modal").addEventListener("click", (e) => {
	if (e.target === document.getElementById("rename-modal")) closeRenameModal();
});
document.getElementById("rename-input").addEventListener("keydown", (e) => {
	if (e.key === "Enter") document.getElementById("rename-confirm").click();
	if (e.key === "Escape") closeRenameModal();
});
function updateHeaderTitle(title) {
	document.getElementById("chat-header-title").textContent = title;
}
function renderMessages() {
	const chat = getActiveChat();
	const inner = document.getElementById("messages-inner");
	const startScreen = document.getElementById("start-screen");
	inner
		.querySelectorAll(".message, .message-actions-row, .typing-indicator")
		.forEach((el) => el.remove());
	if (!chat || chat.messages.length === 0) {
		startScreen.classList.remove("gone");
		updateHeaderTitle(chat ? chat.title : "New Chat");
		return;
	}
	startScreen.classList.add("gone");
	updateHeaderTitle(chat.title);
	chat.messages.forEach((msg, i) => {
		if (msg.role === "user") {
			const el = buildUserMessage(msg.content, msg.images);
			el.querySelector(".message-content").classList.add("show");
			inner.appendChild(el);
		} else {
			const el = buildAiMessage(msg.content);
			inner.appendChild(el);
			const actions = buildMessageActions(
				el,
				i === chat.messages.length - 1
					? chat.messages[i - 1]?.content
					: null,
				i,
			);
			actions.classList.add("show");
			inner.appendChild(actions);
		}
	});
	const container = document.getElementById("messages-container");
	container.scrollTop = container.scrollHeight;
}
function buildUserMessage(text, images) {
	const wrap = document.createElement("div");
	wrap.className = "message user-message";
	const content = document.createElement("div");
	content.className = "message-content";
	if (images && images.length) {
		images.forEach((src) => {
			const img = document.createElement("img");
			img.src = src;
			img.className = "user-image-preview";
			content.appendChild(img);
		});
	}
	if (text) {
		const t = document.createElement("div");
		t.textContent = text;
		content.appendChild(t);
	}
	wrap.appendChild(content);
	return wrap;
}
function buildAiMessage(content) {
	const wrap = document.createElement("div");
	wrap.className = "message ai-message";
	const contentDiv = document.createElement("div");
	contentDiv.className = "message-content";
	renderMarkdown(content, contentDiv);
	wrap.appendChild(contentDiv);
	return wrap;
}
function renderMarkdown(text, target) {
	target.innerHTML = md.render(text);
	renderMathInElement(target, {
		delimiters: [
			{ left: "$$", right: "$$", display: true },
			{ left: "$", right: "$", display: false },
		],
		throwOnError: false,
	});
	target.querySelectorAll("pre.hljs").forEach((pre) => {
		if (pre.parentElement.classList.contains("code-block-container")) return;
		const wrapper = document.createElement("div");
		wrapper.className = "code-block-container";
		const codeEl = pre.querySelector("code");
		let lang = "text";
		if (codeEl) {
			const lc = Array.from(codeEl.classList).find((c) =>
				c.startsWith("language-"),
			);
			if (lc) lang = lc.replace("language-", "");
		}
		const topBar = document.createElement("div");
		topBar.className = "code-block-top-bar";
		const langSpan = document.createElement("span");
		langSpan.className = "code-block-language";
		langSpan.textContent = lang;
		const copyBtn = document.createElement("button");
		copyBtn.className = "code-block-copy-button";
		copyBtn.innerHTML = `<i class="far fa-copy"></i><span class="copy-text">Copy</span>`;
		wrapper.dataset.code = codeEl ? codeEl.innerText : "";
		topBar.appendChild(langSpan);
		topBar.appendChild(copyBtn);
		pre.parentNode.insertBefore(wrapper, pre);
		wrapper.appendChild(topBar);
		wrapper.appendChild(pre);
		pre.className = "code-block-pre";
	});
}
function buildMessageActions(aiEl, userPrompt, msgIndex) {
	const row = document.createElement("div");
	row.className = "message-actions-row";
	const copyBtn = document.createElement("button");
	copyBtn.className = "act-btn";
	copyBtn.innerHTML = '<i class="far fa-copy"></i>';
	copyBtn.title = "Copy";
	copyBtn.addEventListener("click", () => {
		navigator.clipboard.writeText(
			aiEl.querySelector(".message-content").innerText,
		);
		copyBtn.innerHTML = '<i class="far fa-check" style="color:lime"></i>';
		setTimeout(
			() => (copyBtn.innerHTML = '<i class="far fa-copy"></i>'),
			1500,
		);
	});
	const retryBtn = document.createElement("button");
	retryBtn.className = "act-btn";
	retryBtn.innerHTML = '<i class="far fa-rotate-right"></i>';
	retryBtn.title = "Retry";
	const chat = getActiveChat();
	const isLast = chat && msgIndex === chat.messages.length - 1;
	if (!isLast) retryBtn.classList.add("retry-disabled");
	retryBtn.addEventListener("click", () => {
		if (isGenerating || retryBtn.classList.contains("retry-disabled")) return;
		const c = getActiveChat();
		if (!c) return;
		if (c.messages[c.messages.length - 1]?.role === "assistant")
			c.messages.pop();
		const lastUser = c.messages[c.messages.length - 1];
		if (lastUser?.role === "user") c.messages.pop();
		saveToStorage();
		renderMessages();
		startAiResponse(lastUser?.content || "", lastUser?.images || []);
	});
	row.appendChild(copyBtn);
	row.appendChild(retryBtn);
	return row;
}
async function startAiResponse(userText, images = []) {
	if (isGenerating) return;
	isGenerating = true;
	abortController = new AbortController();
	updateSendBtn();

	const inner = document.getElementById("messages-inner");
	document.getElementById("start-screen").classList.add("gone");

	const typing = document.createElement("div");
	typing.className = "typing-indicator";
	typing.innerHTML = `<div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div><span class="typing-label">Thinking...</span>`;
	inner.appendChild(typing);
	requestAnimationFrame(() => typing.classList.add("show"));

	const aiWrap = document.createElement("div");
	aiWrap.className = "message ai-message";
	const aiContent = document.createElement("div");
	aiContent.className = "message-content";
	aiWrap.appendChild(aiContent);
	inner.appendChild(aiWrap);
	scrollToBottom();

	let fullResponse = "";
	try {
		const chat = getActiveChat();

		const historySlice = (chat?.messages || [])
			.slice(-MAX_CONTEXT)
			.map((m) => {
				if (m.images && m.images.length > 0) {
					return {
						role: m.role,
						content: [
							...m.images.map((url) => ({
								type: "image_url",
								image_url: { url },
							})),
							...(m.content ? [{ type: "text", text: m.content }] : []),
						],
					};
				}
				return { role: m.role, content: m.content };
			});

		const currentUserMessage =
			images.length > 0
				? {
						role: "user",
						content: [
							...images.map((url) => ({
								type: "image_url",
								image_url: { url },
							})),
							...(userText ? [{ type: "text", text: userText }] : []),
						],
					}
				: { role: "user", content: userText };

		const finalMessages = [...historySlice, currentUserMessage];

		const response = await fetch(BASE, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			signal: abortController.signal,
			body: JSON.stringify({
				model: currentModel,
				messages: finalMessages,
			}),
		});

		if (!response.ok) throw new Error((await response.text()) || "API Error");

		typing.remove();
		const data = await response.json();

		if (typeof data.content === "string" && data.content.trim()) {
			fullResponse = data.content;
		} else {
			throw new Error("Empty response");
		}

		renderMarkdown(fullResponse, aiContent);
		scrollToBottom();

		const c = getActiveChat();
		if (c) {
			c.messages.push({ role: "user", content: userText, images });
			c.messages.push({ role: "assistant", content: fullResponse });

			if (c.messages.length === 2 && userText) {
				c.title =
					userText.length > 40 ? userText.slice(0, 40) + "…" : userText;
				updateHeaderTitle(c.title);
			}
			saveToStorage();
			renderSidebar(document.getElementById("search-input").value);
		}
	} catch (err) {
		if (typing.parentNode) typing.remove();
		if (err.name === "AbortError") {
			if (fullResponse) renderMarkdown(fullResponse, aiContent);
			else
				aiContent.innerHTML =
					'<span style="color:var(--text-2);font-size:13px">Generation stopped.</span>';
		} else {
			aiContent.innerHTML = `<span style="color:#ff4444">Error: ${escHtml(err.message)}</span>`;
		}
	} finally {
		isGenerating = false;
		abortController = null;
		updateSendBtn();
		const chat = getActiveChat();
		const msgIndex = chat ? chat.messages.length - 1 : -1;
		const actions = buildMessageActions(aiWrap, userText, msgIndex);
		setTimeout(() => actions.classList.add("show"), 100);
		inner.appendChild(actions);
		checkScrollBtn();
	}
}
function scrollToBottom() {
	const c = document.getElementById("messages-container");
	c.scrollTo({ top: c.scrollHeight, behavior: "smooth" });
}
function checkScrollBtn() {
	const c = document.getElementById("messages-container");
	const btn = document.getElementById("scroll-to-bottom-btn");
	const away = c.scrollTop + c.clientHeight < c.scrollHeight - 120;
	btn.classList.toggle("show", away && c.scrollHeight > c.clientHeight);
}
document
	.getElementById("scroll-to-bottom-btn")
	.addEventListener("click", scrollToBottom);
document
	.getElementById("messages-container")
	.addEventListener("scroll", checkScrollBtn);
function updateSendBtn() {
	const btn = document.getElementById("send-btn");
	if (isGenerating) {
		btn.classList.remove("disabled");
		btn.classList.add("stop-mode");
		btn.innerHTML = '<i class="far fa-stop"></i>';
	} else {
		btn.classList.remove("stop-mode");
		const hasContent =
			document.getElementById("message-input").value.trim() ||
			pendingImages.length;
		btn.classList.toggle("disabled", !hasContent);
		btn.innerHTML = '<i class="far fa-arrow-up"></i>';
	}
}
function sendMessage() {
	if (isGenerating) {
		abortController?.abort();
		return;
	}
	const input = document.getElementById("message-input");
	const text = input.value.trim();
	const images = [...pendingImages];
	if (!text && images.length === 0) return;
	if (!activeChatId) {
		const chat = createChat("New Chat");
		activeChatId = chat.id;
		renderSidebar();
	}
	const inner = document.getElementById("messages-inner");
	const userEl = buildUserMessage(text, images);
	inner.appendChild(userEl);
	requestAnimationFrame(() =>
		userEl.querySelector(".message-content").classList.add("show"),
	);
	scrollToBottom();
	input.value = "";
	input.style.height = "auto";
	pendingImages = [];
	document.getElementById("image-preview-strip").innerHTML = "";
	updateSendBtn();
	startAiResponse(text, images);
}
document.getElementById("send-btn").addEventListener("click", sendMessage);
document.getElementById("message-input").addEventListener("keydown", (e) => {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});
document.getElementById("message-input").addEventListener("input", function () {
	this.style.height = "auto";
	this.style.height = Math.min(this.scrollHeight, 160) + "px";
	updateSendBtn();
});
document.getElementById("new-chat-btn").addEventListener("click", () => {
	const chat = createChat("New Chat");
	activeChatId = chat.id;
	renderSidebar();
	renderMessages();
	document.getElementById("message-input").focus();
	closeMobileSidebar();
});
document.getElementById("clear-chat-btn").addEventListener("click", () => {
	const chat = getActiveChat();
	if (!chat) return;
	chat.messages = [];
	chat.title = "New Chat";
	saveToStorage();
	renderSidebar();
	renderMessages();
});
document.getElementById("search-input").addEventListener("input", function () {
	renderSidebar(this.value);
});
document.getElementById("suggestions").addEventListener("click", (e) => {
	const chip = e.target.closest(".suggestion-chip");
	if (!chip) return;
	const prompt = chip.dataset.prompt;
	document.getElementById("message-input").value = prompt;
	updateSendBtn();
	sendMessage();
});
document.getElementById("model-selector-bar").addEventListener("click", (e) => {
	e.stopPropagation();
	document.getElementById("model-popover").classList.toggle("open");
});
document.querySelectorAll(".model-option").forEach((opt) => {
	opt.addEventListener("click", (e) => {
		e.stopPropagation();
		currentModel = opt.dataset.model;
		document.getElementById("model-display-value").textContent =
			opt.dataset.label;
		document
			.querySelectorAll(".model-option")
			.forEach((o) => o.classList.remove("selected"));
		opt.classList.add("selected");
		document.getElementById("model-popover").classList.remove("open");
	});
});
document.addEventListener("click", () => {
	document.getElementById("model-popover").classList.remove("open");
});
document.getElementById("attach-btn").addEventListener("click", () => {
	document.getElementById("image-upload-input").click();
});
document
	.getElementById("image-upload-input")
	.addEventListener("change", function () {
		const files = Array.from(this.files);
		files.forEach((file) => {
			if (!file.type.startsWith("image/")) return;
			const reader = new FileReader();
			reader.onload = (ev) => {
				pendingImages.push(ev.target.result);
				renderImagePreviews();
				updateSendBtn();
			};
			reader.readAsDataURL(file);
		});
		this.value = "";
	});
function renderImagePreviews() {
	const strip = document.getElementById("image-preview-strip");
	strip.innerHTML = "";
	pendingImages.forEach((src, i) => {
		const wrap = document.createElement("div");
		wrap.className = "img-thumb-wrap";
		const img = document.createElement("img");
		img.src = src;
		img.className = "img-thumb";
		const removeBtn = document.createElement("button");
		removeBtn.className = "img-thumb-remove";
		removeBtn.innerHTML = '<i class="far fa-times"></i>';
		removeBtn.addEventListener("click", () => {
			pendingImages.splice(i, 1);
			renderImagePreviews();
			updateSendBtn();
		});
		wrap.appendChild(img);
		wrap.appendChild(removeBtn);
		strip.appendChild(wrap);
	});
}
document.getElementById("message-input").addEventListener("paste", (e) => {
	const items = e.clipboardData?.items;
	if (!items) return;
	for (const item of items) {
		if (item.type.startsWith("image/")) {
			const file = item.getAsFile();
			const reader = new FileReader();
			reader.onload = (ev) => {
				pendingImages.push(ev.target.result);
				renderImagePreviews();
				updateSendBtn();
			};
			reader.readAsDataURL(file);
		}
	}
});
document.getElementById("messages-inner").addEventListener("click", (e) => {
	const btn = e.target.closest(".code-block-copy-button");
	if (!btn) return;
	const container = btn.closest(".code-block-container");
	navigator.clipboard.writeText(container.dataset.code || "").then(() => {
		const icon = btn.querySelector("i");
		const text = btn.querySelector(".copy-text");
		icon.className = "far fa-check";
		if (text) text.textContent = "Copied!";
		btn.style.color = "lime";
		setTimeout(() => {
			icon.className = "far fa-copy";
			if (text) text.textContent = "Copy";
			btn.style.color = "";
		}, 2000);
	});
});
function closeMobileSidebar() {
	if (window.innerWidth <= 768) {
		document.getElementById("sidebar").classList.remove("open");
		document.getElementById("sidebar-overlay").classList.remove("show");
	}
}
document.getElementById("sidebar-toggle").addEventListener("click", () => {
	document.getElementById("sidebar").classList.toggle("open");
	document.getElementById("sidebar-overlay").classList.toggle("show");
});
document
	.getElementById("sidebar-overlay")
	.addEventListener("click", closeMobileSidebar);
loadFromStorage();
if (chats.length === 0) {
	const chat = createChat("New Chat");
	activeChatId = chat.id;
} else {
	activeChatId = chats[0].id;
}
const placeholders = [
	"How do I make a steak?",
	"Can you help me with my homework?",
	"What does this image say?",
	"Teach me how to code in Javascript",
	"Can you help me with my quadratics?",
	"What can you do?",
	"What's 2 + 2?",
	"How do quantum processors work?",
	"Write me an essay about the ocean",
	"Can you find potential bugs in my code?",
	"What is a language compiler?",
	"Explain the theory of relativity simply",
	"Write a Python script to rename files in bulk",
	"What's the difference between TCP and UDP?",
	"Help me write a cover letter",
	"How does the stock market work?",
	"What are the best practices for REST APIs?",
	"Summarize the French Revolution",
	"How do I center a div in CSS?",
	"What causes a rainbow?",
	"Write a regex to validate an email address",
	"What's the fastest sorting algorithm?",
	"Help me debug this error",
	"How do black holes form?",
	"Write unit tests for my function",
	"What's the difference between RAM and storage?",
	"Explain recursion with an example",
	"How do I negotiate a salary?",
	"What is machine learning?",
	"Translate this to Spanish",
	"What are some good habits to build?",
	"How does GPS work?",
	"Write a SQL query to find duplicates",
	"What is the Pythagorean theorem?",
	"How do I start learning guitar?",
	"What's the best way to learn a new language?",
	"Explain how HTTPS works",
	"Write a bedtime story about a dragon",
	"What is the meaning of life?",
	"How do vaccines work?",
];
document.getElementById("message-input").placeholder =
	placeholders[Math.floor(Math.random() * placeholders.length)];
renderSidebar();
renderMessages();
updateSendBtn();
