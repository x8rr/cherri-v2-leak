let _hwid = null;

async function getHWID() {
	if (_hwid) return _hwid;

	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	ctx.fillText("cherri.hwid", 2, 15);

	const gl = document.createElement("canvas").getContext("webgl");
	const dbg = gl?.getExtension("WEBGL_debug_renderer_info");

	const raw = [
		navigator.hardwareConcurrency,
		navigator.deviceMemory ?? "",
		screen.width,
		screen.height,
		screen.colorDepth,
		navigator.platform,
		Intl.DateTimeFormat().resolvedOptions().timeZone,
		navigator.languages.join(","),
		dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "",
		canvas.toDataURL(),
	].join("|");

	const buf = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(raw),
	);
	_hwid = Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	console.log("GOT HWID!");
	return _hwid;
}
