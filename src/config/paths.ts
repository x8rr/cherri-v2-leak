import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const publicPath = fileURLToPath(
	new URL("../../public/", import.meta.url),
);
export const avatarDirectory = resolve(publicPath, "uploads/avatars");
export const bannerDirectory = resolve(publicPath, "uploads/banners");



export const quarantineDirectory = resolve(process.cwd(), "data/quarantine");
