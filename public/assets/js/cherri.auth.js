const AUTH_UID_STORAGE_KEY = "cherri_auth_uid";

function escapeChars(value) {
	return String(value || "").replace(/<\/?[^>]+(>|$)/g, "");
}

function showAuthError(message) {
	const label = document.getElementById("errormessage");
	if (!label) return;
	label.style.display = "block";
	label.textContent = message;
}

function clearAuthError() {
	const label = document.getElementById("errormessage");
	if (!label) return;
	label.style.display = "none";
	label.textContent = "";
}

async function apiRequest(path, options = {}) {
	const requestOptions = {
		method: options.method || "GET",
		headers: {
			...(options.body !== undefined
				? { "content-type": "application/json" }
				: {}),
			...(options.headers || {}),
		},
		credentials: "same-origin",
	};

	if (options.body !== undefined) {
		requestOptions.body = JSON.stringify(options.body);
	}

	let response;
	try {
		response = await fetch(path, requestOptions);
	} catch (error) {
		const message =
			error && error.message
				? error.message
				: "Network error while contacting the server";
		throw new Error(message, { cause: error });
	}

	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		const message =
			payload && payload.error ? payload.error : "Request failed";
		throw new Error(message);
	}

	return payload;
}

function normalizeUser(user) {
	if (!user || typeof user !== "object") return null;
	return {
		id: String(user.id || ""),
		username: String(user.username || ""),
		display: String(user.display || user.username || ""),
		badges: Array.isArray(user.badges) ? user.badges : ["user"],
		pfp: String(user.pfp || "/assets/img/fav.png"),
	};
}

function setSignedInUserId(user) {
	if (user && user.id) {
		localStorage.setItem(AUTH_UID_STORAGE_KEY, user.id);
		return;
	}
	localStorage.removeItem(AUTH_UID_STORAGE_KEY);
}

async function isSignedIn() {
	try {
		const payload = await apiRequest("/api/auth/me");
		return Boolean(payload && payload.user);
	} catch {
		return false;
	}
}

async function getMetaData() {
	try {
		const payload = await apiRequest("/api/auth/me");
		const user = normalizeUser(payload.user);
		if (!user) return null;
		return {
			display: user.display,
			badges: user.badges,
			pfp: user.pfp,
		};
	} catch {
		return null;
	}
}

async function getData() {
	try {
		const payload = await apiRequest("/api/auth/me");
		return normalizeUser(payload.user);
	} catch {
		return null;
	}
}

async function ui(user) {
	const loggedIn = document.getElementById("logged-in");
	const form = document.getElementById("sign-in");
	const displayLabel = document.getElementById("display-label");
	const userLabel = document.getElementById("username-label");
	const pfp = document.getElementById("pfp");

	if (!user) {
		form.style.display = "block";
		loggedIn.style.display = "none";
		setSignedInUserId(null);
		return;
	}

	setSignedInUserId(user);
	displayLabel.textContent = user.display || user.username;
	userLabel.textContent = `@${user.username}`;
	pfp.src = user.pfp || "/assets/img/fav.png";

	form.style.display = "none";
	loggedIn.style.display = "block";
}

async function signUp(username, pass) {
	clearAuthError();
	const safeUsername = escapeChars(username).trim().toLowerCase();
	const safePassword = String(pass || "").trim();

	if (!safeUsername || !safePassword) {
		showAuthError("Username and password are required.");
		return;
	}

	try {
		const payload = await apiRequest("/api/auth/signup", {
			method: "POST",
			body: {
				username: safeUsername,
				password: safePassword,
			},
		});

		const user = normalizeUser(payload.user);
		await ui(user);
		await getNewData();
		await saveNewData("no");
	} catch (error) {
		showAuthError(error.message);
	}
}

async function signIn(username, pass) {
	clearAuthError();
	const safeUsername = escapeChars(username).trim().toLowerCase();
	const safePassword = String(pass || "").trim();

	if (!safeUsername || !safePassword) {
		showAuthError("Username and password are required.");
		return;
	}

	try {
		const payload = await apiRequest("/api/auth/login", {
			method: "POST",
			body: {
				username: safeUsername,
				password: safePassword,
			},
		});

		const user = normalizeUser(payload.user);
		await ui(user);
		await getNewData();
	} catch (error) {
		showAuthError(error.message);
	}
}

async function convertToDataURL(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			resolve(reader.result);
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

async function updateBio() {
	const input = document.getElementById("bio-input");
	if (!input) return;
	const bio = input.value.trim().slice(0, 200);
	clearAuthError();
	try {
		const currentDisplay = document.getElementById("display-label")?.textContent?.trim() || "";
		const payload = await apiRequest("/api/auth/profile", {
			method: "PUT",
			body: { display: currentDisplay, bio },
		});
		const user = normalizeUser(payload.user);
		setSignedInUserId(user);
	} catch (error) {
		showAuthError(error.message);
	}
}

async function updateBanner() {
	const upload = document.getElementById("banner-upload");

	upload.onchange = async (event) => {
		const file = event.target.files[0];
		upload.value = "";
		if (!file) return;

		if (file.size > 10 * 1024 * 1024) {
			showAuthError("Banner max size is 10MB.");
			return;
		}

		try {
			const dataUrl = await convertToDataURL(file);
			await apiRequest("/api/auth/banner", {
				method: "POST",
				body: { dataUrl },
			});
		} catch (error) {
			showAuthError(error.message);
		}
	};

	upload.click();
}

async function selectPresetPfp(index) {
	clearAuthError();
	try {
		const payload = await apiRequest("/api/auth/preset-avatar", {
			method: "POST",
			body: { preset: index },
		});
		const user = normalizeUser(payload.user);
		setSignedInUserId(user);
		const pfpEl = document.getElementById("pfp");
		if (pfpEl) pfpEl.src = user.pfp;
		
		document.querySelectorAll(".preset-pfp").forEach((el, i) => {
			el.classList.toggle("selected", i + 1 === index);
		});
	} catch (error) {
		showAuthError(error.message);
	}
}

async function updatePfp() {
	const upload = document.getElementById("pfp-upload");

	upload.onchange = async (event) => {
		const file = event.target.files[0];
		if (!file) return;

		if (file.size > 10 * 1024 * 1024) {
			showAuthError("Avatar max size is 10MB.");
			return;
		}

		try {
			const dataUrl = await convertToDataURL(file);
			const payload = await apiRequest("/api/auth/avatar", {
				method: "POST",
				body: {
					dataUrl,
				},
			});

			const user = normalizeUser(payload.user);
			setSignedInUserId(user);
			document.getElementById("pfp").src = user.pfp;
		} catch (error) {
			showAuthError(error.message);
		}
	};

	upload.click();
}

async function updateName() {
	const newName = escapeChars(
		document.getElementById("display-name-input").value,
	);
	const safeName = newName.trim();
	if (!safeName) return;

	clearAuthError();

	try {
		const payload = await apiRequest("/api/auth/profile", {
			method: "PUT",
			body: {
				display: safeName,
			},
		});

		const user = normalizeUser(payload.user);
		setSignedInUserId(user);
		document.getElementById("display-label").textContent = user.display;
		document.getElementById("display-name-input").value = "";
	} catch (error) {
		showAuthError(error.message);
	}
}

async function checkUser() {
	clearAuthError();
	try {
		const payload = await apiRequest("/api/auth/me");
		const user = normalizeUser(payload.user);
		await ui(user);
	} catch {
		await ui(null);
	}
}

async function handleLogout() {
	clearAuthError();
	try {
		await apiRequest("/api/auth/logout", { method: "POST" });
	} catch {}
	await ui(null);
}

document.addEventListener("DOMContentLoaded", async () => {
	await checkUser();
});
