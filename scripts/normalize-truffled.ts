import { existsSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

interface TruffledEntry {
	name?: string;
	img?: string;
	url?: string;
	[key: string]: unknown;
}

interface CliOptions {
	root: string;
	json: string;
	dryRun: boolean;
}

const DEFAULT_ROOT = path.resolve("public/stores/truffled");
const DEFAULT_JSON = path.resolve("public/assets/json/truffled.json");

function parseArgs(argv: string[]): CliOptions {
	let root = DEFAULT_ROOT;
	let json = DEFAULT_JSON;
	let dryRun = false;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (arg === "--root") {
			root = path.resolve(argv[index + 1] ?? "");
			index += 1;
			continue;
		}

		if (arg === "--json") {
			json = path.resolve(argv[index + 1] ?? "");
			index += 1;
			continue;
		}

		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}

		if (arg === "--help" || arg === "-h") {
			printHelp();
			process.exit(0);
		}
	}

	return { root, json, dryRun };
}

function printHelp() {
	console.log(`Normalize Truffled game paths and rewrite truffled.json.

Usage:
  bun scripts/normalize-truffled.ts [--root <dir>] [--json <file>] [--dry-run]

Defaults:
  --root public/stores/truffled
  --json public/assets/json/truffled.json

Notes:
  - Only paths referenced by the JSON are normalized.
  - Spaces and underscores in referenced path segments are replaced with dashes.
  - This script does not recursively rename every asset inside each game folder.
`);
}

function decodeSegment(segment: string) {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

function normalizeSegment(segment: string) {
	const decoded = decodeSegment(segment).trim();
	return decoded
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function normalizeStorePath(storePath: string) {
	const prefix = "/stores/truffled/";
	if (!storePath.startsWith(prefix)) {
		return storePath;
	}

	const suffix = storePath.slice(prefix.length);
	const parts = suffix.split("/").map((part) => normalizeSegment(part));
	return `${prefix}${parts.join("/")}`;
}

async function safeStat(target: string) {
	try {
		return await stat(target);
	} catch {
		return null;
	}
}

async function ensureParentDir(target: string, dryRun: boolean) {
	const parent = path.dirname(target);
	if (dryRun || existsSync(parent)) {
		return;
	}

	await mkdir(parent, { recursive: true });
}

async function renameIfNeeded(fromPath: string, toPath: string, dryRun: boolean) {
	if (fromPath === toPath) {
		return false;
	}

	const fromInfo = await safeStat(fromPath);
	if (!fromInfo) {
		return false;
	}

	const toInfo = await safeStat(toPath);
	if (toInfo) {
		throw new Error(`Cannot rename because target already exists: ${toPath}`);
	}

	console.log(`${dryRun ? "[dry-run] " : ""}${fromPath} -> ${toPath}`);

	if (!dryRun) {
		await ensureParentDir(toPath, dryRun);
		await rename(fromPath, toPath);
	}

	return true;
}

function toDiskPath(root: string, storePath: string) {
	const prefix = "/stores/truffled/";
	const suffix = storePath.startsWith(prefix)
		? storePath.slice(prefix.length)
		: storePath.replace(/^\/+/, "");
	const decodedSuffix = suffix
		.split("/")
		.map((part) => decodeSegment(part))
		.join(path.sep);
	return path.join(root, decodedSuffix);
}

async function renameReferencedStorePath(
	root: string,
	storePath: string,
	normalizedPath: string,
	dryRun: boolean,
) {
	if (storePath === normalizedPath) {
		return false;
	}

	const currentDiskPath = toDiskPath(root, storePath);
	const normalizedDiskPath = toDiskPath(root, normalizedPath);
	return renameIfNeeded(currentDiskPath, normalizedDiskPath, dryRun);
}

function normalizeEntry(entry: TruffledEntry) {
	let changed = false;
	const nextEntry: TruffledEntry = { ...entry };

	if (typeof entry.url === "string") {
		const normalizedUrl = normalizeStorePath(entry.url);
		if (normalizedUrl !== entry.url) {
			nextEntry.url = normalizedUrl;
			changed = true;
		}
	}

	if (typeof entry.img === "string" && entry.img.startsWith("/stores/truffled/")) {
		const normalizedImg = normalizeStorePath(entry.img);
		if (normalizedImg !== entry.img) {
			nextEntry.img = normalizedImg;
			changed = true;
		}
	}

	return { changed, nextEntry };
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const jsonExists = existsSync(options.json);

	if (!jsonExists) {
		throw new Error(`JSON file not found: ${options.json}`);
	}

	const jsonRaw = await readFile(options.json, "utf8");
	const entries = JSON.parse(jsonRaw) as TruffledEntry[];

	if (!Array.isArray(entries)) {
		throw new Error("Expected truffled JSON to be an array");
	}

	let updatedEntries = 0;
	let renamedPaths = 0;
	const processedPaths = new Set<string>();

	for (const entry of entries) {
		const originalUrl = typeof entry.url === "string" ? entry.url : null;
		const normalizedUrl = originalUrl ? normalizeStorePath(originalUrl) : null;

		if (
			originalUrl &&
			normalizedUrl &&
			originalUrl !== normalizedUrl &&
			!processedPaths.has(originalUrl)
		) {
			const didRename = await renameReferencedStorePath(
				options.root,
				originalUrl,
				normalizedUrl,
				options.dryRun,
			);
			if (didRename) {
				renamedPaths += 1;
			}
			processedPaths.add(originalUrl);
		}

		const { changed, nextEntry } = normalizeEntry(entry);
		if (changed) {
			updatedEntries += 1;
			Object.assign(entry, nextEntry);
		}
	}

	const nextJson = `${JSON.stringify(entries, null, 2)}\n`;
	if (!options.dryRun) {
		await writeFile(options.json, nextJson, "utf8");
	}

	console.log(
		`${options.dryRun ? "Dry run complete" : "Normalization complete"}: ` +
			`${updatedEntries} JSON entr${updatedEntries === 1 ? "y" : "ies"} updated, ` +
			`${renamedPaths} filesystem path${renamedPaths === 1 ? "" : "s"} renamed.`,
	);
}

await main();
