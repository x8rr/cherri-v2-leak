const FAVS_KEY = "cherri_favorites";
const RECENT_KEY = "cherri_recent";
const MAX_RECENT = 12;
let gameCount = 0;

let data = [];
let luminReady;

function getLaunchValue(game) {
	return game.launch ?? game.url;
}

function getFavs() {
	try {
		return JSON.parse(localStorage.getItem(FAVS_KEY)) || [];
	} catch {
		return [];
	}
}

function saveFavs(favs) {
	localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
}

function getRecent() {
	try {
		return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
	} catch {
		return [];
	}
}

function saveRecent(url) {
	let recent = getRecent().filter((u) => u !== url);
	recent.unshift(url);
	if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
	localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

function isFav(url) {
	return getFavs().includes(url);
}

function makeCard(g) {
	const card = document.createElement("a");
	const launchValue = getLaunchValue(g);
	card.href = "/pages/play.html?launch=" + encodeURIComponent(launchValue);
	card.className = "obfuscate";

	const favActive = isFav(launchValue) ? "active" : "";

	card.innerHTML = `
        <div class="home-game-card">
            <div class="card-img-wrap">
                <img src="${g.img}" loading="lazy" alt="${g.name}">
            </div>
            <div class="card-info">
                <h3 style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${g.name}</h3>
                <button class="fav-btn ${favActive}" title="Favorite" aria-label="Favorite" style="flex-shrink:0;">
                    <i class="fa${favActive ? "s" : "r"} fa-star"></i>
                </button>
            </div>
        </div>
    `;

	const btn = card.querySelector(".fav-btn");
	btn.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		const isNowFav = isFav(launchValue);
		btn.classList.toggle("active", !isNowFav);
		btn.innerHTML = `<i class="${!isNowFav ? "fas" : "far"} fa-star"></i>`;
		let favs = getFavs();
		if (isNowFav) {
			favs = favs.filter((u) => u !== launchValue);
		} else {
			favs.push(launchValue);
		}
		saveFavs(favs);
		renderAll();
	});

	card.addEventListener("click", (e) => {
		if (e.target.closest(".fav-btn")) return;
		saveRecent(launchValue);
	});

	if (window.obfuscateElement) window.obfuscateElement(card);
	gameCount++;
	return card;
}

function renderSection(container, iconClass, label, games) {
	if (games.length === 0) return;

	const labelEl = document.createElement("div");
	labelEl.className = "section-label";
	labelEl.innerHTML = `<i class="${iconClass}"></i> ${label}`;
	container.appendChild(labelEl);

	const row = document.createElement("div");
	row.className = "section-divider";
	games.forEach((g) => row.appendChild(makeCard(g)));
	container.appendChild(row);
}

function renderAll() {
	gameCount = 0;
	const container = document.getElementById("game-container");
	container.innerHTML = "";

	const searchVal =
		document.querySelector("input[type=text]")?.value.trim().toLowerCase() ||
		"";
	const favUrls = getFavs();
	const recentUrls = getRecent();
	const byUrl = {};
	data.forEach((g) => (byUrl[getLaunchValue(g)] = g));

	if (!searchVal) {
		const favGames = favUrls.map((url) => byUrl[url]).filter(Boolean);
		const recentGames = recentUrls.map((url) => byUrl[url]).filter(Boolean);
		const featuredGames = data.filter((g) => g.featured);

		renderSection(container, "fas fa-fire", "Featured", featuredGames);
		renderSection(container, "fas fa-star", "Favorites", favGames);
		renderSection(container, "fas fa-clock", "Recently Played", recentGames);

		const allRow = document.createElement("div");
		allRow.className = "section-divider";
		data.forEach((g) => allRow.appendChild(makeCard(g)));

		const allLabel = document.createElement("div");
		allLabel.className = "section-label";
		allLabel.innerHTML = `<i class="fas fa-gamepad"></i> All Games (${data.length})`;
		container.appendChild(allLabel);
		container.appendChild(allRow);
	} else {
		const filtered = data.filter((g) =>
			g.name.toLowerCase().includes(searchVal),
		);
		const row = document.createElement("div");
		row.className = "section-divider";
		filtered.forEach((g) => row.appendChild(makeCard(g)));
		container.appendChild(row);
	}
}

async function ensureLumin() {
	if (!window.Lumin) {
		throw new Error("Lumin SDK is unavailable");
	}

	if (!luminReady) {
		luminReady = window.Lumin.init({
			headless: true,
			onReady: () => console.log("Lumin connected"),
			onError: (err) => console.error("Lumin error:", err),
		});
	}

	return luminReady;
}

async function loadLuminGames() {
	await ensureLumin();

	const result = await window.Lumin.getGames({ page: 1, limit: 9999 });
	const imgUrls = await Promise.all(
		result.games.map((g) => window.Lumin.getImageUrl(g.image_token)),
	);

	return result.games.map((g, i) => ({
		id: g.id,
		name: g.name,
		img: imgUrls[i],
		launch: `lumin:${g.id}`,
		store: "lumin",
	}));
}

async function load(list) {
	try {
		if (list === "lumin") {
			data = await loadLuminGames();
			renderAll();
			return;
		}

		const res = await fetch(`/assets/json/${list}.json?v=${Date.now()}`);
		const json = await res.json();
		data = json.map((game) => ({
			...game,
			launch: game.url,
			store: list,
		}));
		renderAll();
	} catch (error) {
		console.error(`Failed to load ${list} games`, error);
		data = [];
		renderAll();
	}
}

document
	.querySelector("input[type=text]")
	?.addEventListener("input", function () {
		renderAll();
	});

load("lumin");
