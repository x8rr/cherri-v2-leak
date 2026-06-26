const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
const defaultWispUrl =
	(window.location.protocol === "https:" ? "wss://" : "ws://") +
	window.location.host +
	"/socket/";
const wispUrl = defaultWispUrl;
console.log("WISP URL IS CURRENTLY", wispUrl);
const selectedTransport = localStorage.getItem("cherri_transport") || "libcurl";

switch (selectedTransport) {
	case "libcurl":
		connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
		break;
	case "epoxy":
		connection.setTransport("/epoxy/index.mjs", [{ wisp: wispUrl }]);
		break;
	default:
		connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
		break;
}

const bar = document.getElementById("bar");
const toggleBookmarksButton = document.getElementById("toggle-bookmarks");

const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
	files: {
		all: "/scram/scramjet.all.js",
		wasm: "/scram/scramjet.wasm.wasm",
		sync: "/scram/scramjet.sync.js",
	},
});
scramjet.init();

let activeTab = 0;
let tabs = [];
let tabCounter = 1;

function setBookmarksCollapsed(collapsed) {
	document.body.classList.toggle("bookmarks-collapsed", collapsed);
	if (toggleBookmarksButton) {
		toggleBookmarksButton.classList.toggle("collapsed", collapsed);
		toggleBookmarksButton.title = collapsed
			? "Show bookmarks bar"
			: "Hide bookmarks bar";
	}
	localStorage.setItem("cherri_bookmarks_collapsed", collapsed ? "1" : "0");
}

function toggleBookmarksBar() {
	setBookmarksCollapsed(
		!document.body.classList.contains("bookmarks-collapsed"),
	);
}

function applyObfuscation(el) {
	if (window.obfuscateElement && el) {
		el.removeAttribute("data-ob-done");
		window.obfuscateElement(el);
	}
}

function newTab() {
	const tabContainer = document.querySelector(".tabs");
	const newTabData = {
		id: tabCounter++,
		title: "New Tab",
		url: "",
		history: [],
		historyIndex: -1,
	};
	tabs.push(newTabData);
	if (!tabContainer) return;

	const newTabButton = document.getElementById("newtab");
	const tab = document.createElement("div");
	tab.classList.add("tab", "obfuscate");
	tab.dataset.tabId = newTabData.id;
	tab.innerHTML = `
        <img src="/assets/img/fav.png" alt="" data-fav-id="${newTabData.id}">
        <span>New Tab</span>
        <i class="far fa-close closetab" onclick="closeTab(${newTabData.id})"></i>
    `;

	tab.addEventListener("click", (e) => {
		if (!e.target.closest(".closetab")) {
			switchTab(newTabData.id);
		}
	});

	tabContainer.insertBefore(tab, newTabButton);

	const tabFrame = document.createElement("iframe");
	tabFrame.classList.add("viewframe", "browser-frame");
	tabFrame.dataset.frameId = newTabData.id;
	tabFrame.setAttribute("allowfullscreen", "true");
	tabFrame.src = "/pages/newtab.html";
	document.getElementById("browserframecontainer").appendChild(tabFrame);

	switchTab(newTabData.id);
	applyObfuscation(tab);
}

function switchTab(id) {
	activeTab = id;
	document.querySelectorAll(".tab").forEach((t) => {
		t.classList.toggle("active", parseInt(t.dataset.tabId) === id);
	});
	document.querySelectorAll(".viewframe").forEach((f) => {
		f.classList.toggle("active", parseInt(f.dataset.frameId) === id);
	});

	const currentTab = tabs.find((t) => t.id === id);
	if (currentTab && bar) {
		bar.value = currentTab.url;
		applyObfuscation(bar);
	}
}

function closeTab(id) {
	if (tabs.length <= 1) return;
	const tabIndex = tabs.findIndex((t) => t.id === id);
	if (tabIndex === -1) return;

	tabs.splice(tabIndex, 1);
	const tab = document.querySelector(`.tab[data-tab-id="${id}"]`);
	const frame = document.querySelector(`.viewframe[data-frame-id="${id}"]`);
	if (tab) tab.remove();
	if (frame) frame.remove();

	if (activeTab === id) {
		const newActiveTab = tabs[Math.max(0, tabIndex - 1)];
		if (newActiveTab) switchTab(newActiveTab.id);
	}
}

function nav(i) {
	if (!i.trim()) return;
	let url = i.trim();
	if (!url.includes(".")) {
		url = "https://duckduckgo.com/?q=" + encodeURIComponent(url);
	} else if (!url.startsWith("http://") && !url.startsWith("https://")) {
		url = "https://" + url;
	}
	const currentTab = tabs.find((t) => t.id === activeTab);
	if (!currentTab) return;
	currentTab.history.push(url);
	currentTab.historyIndex++;
	currentTab.url = url;
	go(scramjet.encodeUrl(url));
}

function updateElements(frameEl) {
	try {
		const currentTab = tabs.find((t) => t.id === activeTab);
		if (!currentTab) return;
		const currentSrc = frameEl.contentWindow.location.href;
		let decodedUrl = scramjet.decodeUrl(currentSrc);

		if (decodedUrl && decodedUrl !== currentTab.url) {
			currentTab.url = decodedUrl;
			if (bar) {
				bar.value = decodedUrl;
				applyObfuscation(bar);
			}
			const favicon = document.querySelector(
				`.tab img[data-fav-id="${activeTab}"]`,
			);
			if (favicon) {
				favicon.src = `https://www.google.com/s2/favicons?domain=${decodedUrl}&sz=128`;
			}
		}
	} catch (e) {}
}

async function go(i) {
	if (!(await connection.getTransport())) {
		connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
	}
	const frame = document.querySelector(
		`.viewframe[data-frame-id="${activeTab}"]`,
	);
	if (!frame) return;

	const currentTab = tabs.find((t) => t.id === activeTab);
	const tab = document.querySelector(`.tab[data-tab-id="${activeTab}"]`);

	if (tab) {
		const title = tab.querySelector("span");
		if (title) title.textContent = "Loading...";
		applyObfuscation(tab);
	}

	if (bar) {
		bar.value = currentTab.url;
		applyObfuscation(bar);
	}

	frame.src = i;
	frame.onload = () => {
		try {
			const frameDoc = frame.contentDocument || frame.contentWindow.document;
			const frameTitle = frameDoc.title || new URL(currentTab.url).hostname;
			const tabEl = document.querySelector(
				`.tab[data-tab-id="${activeTab}"]`,
			);
			if (tabEl) {
				const titleSpan = tabEl.querySelector("span");
				if (titleSpan) titleSpan.textContent = frameTitle;
				applyObfuscation(tabEl);
			}
			updateElements(frame);
		} catch (e) {
			updateElements(frame);
		}
	};
}

function back() {
	const currentTab = tabs.find((t) => t.id === activeTab);
	if (!currentTab || currentTab.historyIndex <= 0) return;
	currentTab.historyIndex--;
	const url = currentTab.history[currentTab.historyIndex];
	currentTab.url = url;
	go(scramjet.encodeUrl(url));
}

function forward() {
	const currentTab = tabs.find((t) => t.id === activeTab);
	if (!currentTab || currentTab.historyIndex >= currentTab.history.length - 1)
		return;
	currentTab.historyIndex++;
	const url = currentTab.history[currentTab.historyIndex];
	currentTab.url = url;
	go(scramjet.encodeUrl(url));
}

function refresh() {
	const frame = document.querySelector(
		`.viewframe[data-frame-id="${activeTab}"]`,
	);
	if (frame?.contentWindow) {
		frame.contentWindow.location.reload();
	}
}

function fullscreen() {
	const frame = document.querySelector(
		`.viewframe[data-frame-id="${activeTab}"]`,
	);
	if (frame) frame.requestFullscreen();
}

function popout() {
	const frame = document.querySelector(
		`.viewframe[data-frame-id="${activeTab}"]`,
	);
	if (frame) window.open(frame.src, "_blank");
}

bar.addEventListener("keydown", (e) => {
	if (e.key === "Enter") nav(bar.value.trim());
});

bar.addEventListener("input", () => {
	applyObfuscation(bar);
});

const BookmarkManager = {
	bmContainer: document.querySelector(".bookmarks"),
	bookmarks: JSON.parse(localStorage.getItem("cherri_bookmarks")) || [],
	normalizeBookmark(bookmark) {
		if (!bookmark) {
			return null;
		}

		if (typeof bookmark === "string") {
			return { url: bookmark, name: "" };
		}

		if (typeof bookmark.url !== "string" || !bookmark.url.trim()) {
			return null;
		}

		return {
			url: bookmark.url.trim(),
			name:
				typeof bookmark.name === "string" ? bookmark.name.trim() : "",
		};
	},
	getBookmarkLabel(bookmark) {
		if (bookmark.name) {
			return bookmark.name;
		}

		try {
			return new URL(
				bookmark.url.startsWith("http") ? bookmark.url : `https://${bookmark.url}`,
			).hostname.replace(/^www\./, "");
		} catch {
			return bookmark.url;
		}
	},
	saveBookmarks() {
		localStorage.setItem("cherri_bookmarks", JSON.stringify(this.bookmarks));
	},
	async loadBookmarks() {
		const bookmarks =
			JSON.parse(localStorage.getItem("cherri_bookmarks")) || [];
		this.bookmarks = bookmarks
			.map((bookmark) => this.normalizeBookmark(bookmark))
			.filter(Boolean);
		this.saveBookmarks();
		this.bmContainer.innerHTML = "";

		this.bookmarks.forEach((bm, index) => {
			const newElement = document.createElement("div");
			newElement.classList.add("bookmark", "obfuscate");
			newElement.innerHTML = `<img src="https://s2.googleusercontent.com/s2/favicons?domain=${bm.url}&sz=128" alt=""><span>${this.getBookmarkLabel(bm)}</span>`;
			newElement.title = `${this.getBookmarkLabel(bm)}\n${bm.url}`;
			this.bmContainer.appendChild(newElement);
			newElement.onclick = () => nav(bm.url);
			newElement.oncontextmenu = (e) => {
				e.preventDefault();
				if (confirm(`Delete bookmark: ${this.getBookmarkLabel(bm)}?\n${bm.url}`))
					this.deleteBookmark(index);
			};
			applyObfuscation(newElement);
		});

		const newButton = document.createElement("div");
		newButton.classList.add("bookmark", "obfuscate");
		newButton.innerHTML = `<i class="fas fa-plus" style="color: white;"></i><span>New Bookmark</span>`;
		this.bmContainer.appendChild(newButton);
		newButton.onclick = () => this.addBookmark();
		applyObfuscation(newButton);
	},
	async addBookmark() {
		const url = prompt("Enter the URL of the bookmark");
		if (!url) return;
		const name =
			prompt("Enter a name for this bookmark (optional)")?.trim() || "";
		this.bookmarks.push({ url: url.trim(), name });
		this.saveBookmarks();
		this.loadBookmarks();
	},
	deleteBookmark(index) {
		this.bookmarks.splice(index, 1);
		this.saveBookmarks();
		this.loadBookmarks();
	},
};

if (toggleBookmarksButton) {
	toggleBookmarksButton.addEventListener("click", toggleBookmarksBar);
}

setBookmarksCollapsed(
	localStorage.getItem("cherri_bookmarks_collapsed") === "1",
);

newTab();
BookmarkManager.loadBookmarks();
