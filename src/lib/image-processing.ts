import sharp from "sharp";



sharp.concurrency(1);

sharp.cache(false);




const MAX_TOTAL_PIXELS = 50 * 1024 * 1024;



const MAX_CONCURRENT_PIPELINES = 2;

let activePipelines = 0;
const waiters: Array<() => void> = [];

function releaseSlot(): void {
	const next = waiters.shift();
	if (next) {
		
		next();
	} else {
		activePipelines--;
	}
}

async function acquireSlot(): Promise<void> {
	if (activePipelines < MAX_CONCURRENT_PIPELINES) {
		activePipelines++;
		return;
	}
	await new Promise<void>((resolve) => waiters.push(resolve));
}

export async function withSharpSlot<T>(fn: () => Promise<T>): Promise<T> {
	await acquireSlot();
	try {
		return await fn();
	} finally {
		releaseSlot();
	}
}

export async function isWithinPixelBudget(
	buffer: Buffer,
	animated: boolean,
): Promise<boolean> {
	try {
		const meta = await sharp(buffer, { animated }).metadata();
		const width = meta.width ?? 0;
		
		
		const frameHeight = meta.pageHeight ?? meta.height ?? 0;
		const frames = meta.pages ?? 1;
		const totalPixels = width * frameHeight * frames;
		return totalPixels > 0 && totalPixels <= MAX_TOTAL_PIXELS;
	} catch {
		return false;
	}
}
