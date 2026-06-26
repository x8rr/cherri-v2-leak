const CLOUD_SAVE_API_BASE = "/api/cloud-saves";
const GUEST_ID_KEY = "guest_id";
const AUTH_USER_ID_KEY = "cherri_auth_uid";
const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const SAVE_FORMAT_ID = "cherri-save-v2";
const SAVE_FORMAT_VERSION = 2;

const SENSITIVE_KEY_PATTERNS = [
	/^sb-.*-auth-token$/i,
	/(^|[_-])(access|refresh|id)_?token($|[_-])/i,
	/(^|[_-])session_?token($|[_-])/i,
];

const SENSITIVE_OBJECT_KEYS = new Set([
	"access_token",
	"refresh_token",
	"token_type",
	"expires_at",
	"expires_in",
	"provider_token",
	"provider_refresh_token",
]);

const debounce = (func, delay) => {
	let timeout;
	return (...args) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => func(...args), delay);
	};
};

function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseStoredValue(value) {
	try {
		return JSON.parse(value);
	} catch (error) {
		return value;
	}
}

function serializeStoredValue(value) {
	if (value !== null && typeof value === "object") {
		return JSON.stringify(value);
	}
	return String(value);
}

function ensureGuestId() {
	const existing = localStorage.getItem(GUEST_ID_KEY);
	if (existing) {
		return existing;
	}

	const generated =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(16).slice(2)}`;

	localStorage.setItem(GUEST_ID_KEY, generated);
	return generated;
}

function getCloudSaveUserId() {
	return localStorage.getItem(AUTH_USER_ID_KEY) || null;
}

function isSensitiveKey(key) {
	if (typeof key !== "string") return true;
	return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function hasSensitiveValueShape(value) {
	if (!isPlainObject(value)) return false;
	for (const key of Object.keys(value)) {
		if (SENSITIVE_OBJECT_KEYS.has(key)) {
			return true;
		}
	}
	return false;
}

function collectStorageSnapshot() {
	const snapshot = {};
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (!key) continue;
		snapshot[key] = parseStoredValue(localStorage.getItem(key));
	}
	return snapshot;
}

function sanitizeSaveData(rawData) {
	const safeData = {};
	const skipped = [];

	if (!isPlainObject(rawData)) {
		return { safeData, skipped };
	}

	for (const [key, value] of Object.entries(rawData)) {
		if (isSensitiveKey(key)) {
			skipped.push({ key, reason: "sensitive key" });
			continue;
		}

		if (hasSensitiveValueShape(value)) {
			skipped.push({ key, reason: "sensitive value" });
			continue;
		}

		safeData[key] = value;
	}

	return { safeData, skipped };
}

function normalizeImportedPayload(payload) {
	if (!isPlainObject(payload)) {
		throw new Error("The JSON file must contain an object at the root.");
	}

	const hasVersionedShape =
		isPlainObject(payload.meta) && isPlainObject(payload.data);

	if (hasVersionedShape) {
		return { data: payload.data, format: payload.meta.format || "versioned" };
	}

	return { data: payload, format: "legacy" };
}

function createSaveDocument(data, source) {
	return {
		meta: {
			format: SAVE_FORMAT_ID,
			version: SAVE_FORMAT_VERSION,
			exported_at: new Date().toISOString(),
			app_version: localStorage.getItem("cherri_version") || null,
			source,
			key_count: Object.keys(data).length,
		},
		data,
	};
}

function downloadPayload(payload, fileName) {
	const json = JSON.stringify(payload, null, 2);
	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

function previewSkippedKeys(skipped, limit = 4) {
	if (skipped.length === 0) return "none";
	return skipped
		.slice(0, limit)
		.map((item) => `${item.key} (${item.reason})`)
		.join(", ");
}

async function fetchCloudSave(userId) {
	const response = await fetch(
		`${CLOUD_SAVE_API_BASE}/${encodeURIComponent(userId)}`,
	);

	if (!response.ok) {
		throw new Error(`Fetch failed with status ${response.status}`);
	}

	const payload = await response.json();
	return payload.data || null;
}

async function pushCloudSave(userId, ls) {
	const response = await fetch(
		`${CLOUD_SAVE_API_BASE}/${encodeURIComponent(userId)}`,
		{
			method: "PUT",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({ ls }),
		},
	);

	if (!response.ok) {
		let reason = `Save failed with status ${response.status}`;
		try {
			const payload = await response.json();
			if (payload && payload.error) {
				reason = payload.error;
			}
		} catch (error) {
			
		}
		throw new Error(reason);
	}
}

const CloudSaves = {
	async uploadSave(uid, localstorage) {
		const payload = isPlainObject(localstorage) ? localstorage : {};
		await pushCloudSave(uid, payload);
		return true;
	},

	autoSave: debounce(async (uid, newData) => {
		try {
			await CloudSaves.uploadSave(uid, newData);
		} catch {
			
		}
	}, 500),

	async getSave(uid) {
		return fetchCloudSave(uid);
	},

	applySaveData(data) {
		const { safeData, skipped } = sanitizeSaveData(data);
		for (const [key, value] of Object.entries(safeData)) {
			localStorage.setItem(key, serializeStoredValue(value));
		}
		return {
			importedKeyCount: Object.keys(safeData).length,
			skipped,
		};
	},

	async replaceStorage() {
		try {
			const userId = getCloudSaveUserId();
			if (!userId) {
				if (typeof toast === "function") {
					toast(
						"fa-exclamation-circle",
						"Please sign in to use cloud saves.",
					);
				}
				return;
			}

			const saveData = await CloudSaves.getSave(userId);

			if (!saveData || !isPlainObject(saveData.ls)) {
				if (typeof toast === "function") {
					toast("fa-exclamation-circle", "No data found for this user.");
				}
				return;
			}

			CloudSaves.applySaveData(saveData.ls);
		} catch {
			if (typeof toast === "function") {
				toast("fa-times-circle", "Failed to fetch cloud save");
			}
		}
	},
};

async function saveNewData(toasts = "yes") {
	try {
		if (toasts !== "no" && typeof toast === "function") {
			toast("fa-info-circle", "Saving...");
		}

		const userId = getCloudSaveUserId();
		if (!userId) {
			if (toasts !== "no" && typeof toast === "function") {
				toast("fa-exclamation-circle", "Sign in to sync cloud save");
			}
			return;
		}

		const snapshot = collectStorageSnapshot();
		const { safeData } = sanitizeSaveData(snapshot);
		await CloudSaves.uploadSave(userId, safeData);

		if (toasts !== "no" && typeof toast === "function") {
			toast("fa-check-circle", "Save uploaded!");
		}
	} catch {
		if (toasts !== "no" && typeof toast === "function") {
			toast("fa-times-circle", "Failed to save");
		}
	}
}

async function getNewData() {
	const userId = getCloudSaveUserId();
	if (!userId) {
		if (typeof toast === "function") {
			toast("fa-exclamation-circle", "Please sign in to use cloud saves.");
		}
		return;
	}

	if (typeof toast === "function") {
		toast("fa-info-circle", "Fetching...");
	}

	await CloudSaves.replaceStorage();

	if (typeof toast === "function") {
		toast("fa-check-circle", "Save downloaded!");
	}
}

async function downloadJson() {
	try {
		if (typeof toast === "function") {
			toast("fa-info-circle", "Downloading...");
		}

		const userId = getCloudSaveUserId();
		let source = "local";
		let rawData = collectStorageSnapshot();

		if (userId) {
			try {
				const saveRes = await CloudSaves.getSave(userId);
				if (saveRes && isPlainObject(saveRes.ls)) {
					rawData = saveRes.ls;
					source = "cloud";
				}
			} catch {
				
			}
		}

		const { safeData } = sanitizeSaveData(rawData);
		const saveDocument = createSaveDocument(safeData, source);
		downloadPayload(saveDocument, `Cherri_Save_${Date.now()}.json`);

		if (typeof toast === "function") {
			toast("fa-check-circle", "Downloaded!");
		}
	} catch {
		if (typeof toast === "function") {
			toast("fa-times-circle", "Failed to download");
		}
	}
}

async function uploadFromJson() {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = ".json,application/json";
	input.onchange = async (event) => {
		const file = event.target.files[0];
		if (!file) return;

		if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
			if (typeof toast === "function") {
				toast("fa-times-circle", "File is too large (max 5MB)");
			}
			return;
		}

		try {
			const fileContent = await file.text();
			const payload = JSON.parse(fileContent);
			const normalized = normalizeImportedPayload(payload);
			const { safeData, skipped } = sanitizeSaveData(normalized.data);
			const importableKeyCount = Object.keys(safeData).length;

			if (importableKeyCount === 0) {
				if (typeof toast === "function") {
					toast("fa-times-circle", "No importable data found in file");
				}
				return;
			}

			const previewMessage = [
				`Import ${importableKeyCount} keys from ${file.name}?`,
				`Detected format: ${normalized.format}`,
				skipped.length > 0
					? `Sensitive keys skipped: ${skipped.length} (${previewSkippedKeys(skipped)})`
					: "Sensitive keys skipped: 0",
				"A backup of your current local data will be downloaded first.",
			].join("\n");

			if (!confirm(previewMessage)) {
				return;
			}

			const currentSnapshot = collectStorageSnapshot();
			const { safeData: backupData } = sanitizeSaveData(currentSnapshot);
			const backupDoc = createSaveDocument(
				backupData,
				"local-backup-before-import",
			);
			downloadPayload(
				backupDoc,
				`Cherri_Backup_Before_Import_${Date.now()}.json`,
			);

			const { importedKeyCount: appliedCount } =
				CloudSaves.applySaveData(safeData);

			const userId = getCloudSaveUserId();
			if (userId) {
				await CloudSaves.uploadSave(userId, safeData);
			}

			if (typeof toast === "function") {
				const message = userId
					? `Imported ${appliedCount} keys and synced save`
					: `Imported ${appliedCount} keys locally`;
				toast("fa-check-circle", message);
			}
		} catch {
			if (typeof toast === "function") {
				toast("fa-times-circle", "Failed to import file");
			}
		}
	};
	input.click();
}

ensureGuestId();

window.CloudSaves = CloudSaves;
window.saveNewData = saveNewData;
window.getNewData = getNewData;
window.downloadJson = downloadJson;
window.uploadFromJson = uploadFromJson;
