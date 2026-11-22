const MEDIA_HOSTS = new Set([
	"cdn.discordapp.com",
	"media.discordapp.net",
	"images-ext-1.discordapp.net",
	"images-ext-2.discordapp.net",
	"media.tenor.com",
	"media1.tenor.com",
	"c.tenor.com",
	"media.giphy.com",
	"media0.giphy.com",
	"media1.giphy.com",
	"media2.giphy.com",
	"media3.giphy.com",
	"media4.giphy.com",
	"i.giphy.com",
]);
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;

export function isTrustedMediaUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			!url.username &&
			!url.password &&
			!url.port &&
			MEDIA_HOSTS.has(url.hostname)
		);
	} catch {
		return false;
	}
}

export async function downloadMedia(url: string): Promise<Buffer> {
	if (!isTrustedMediaUrl(url)) {
		throw new Error("media URL is outside the approved hosts");
	}

	const response = await fetch(url, {
		redirect: "error",
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
	});
	if (!response.ok || !response.body) {
		await response.body?.cancel();
		throw new Error(`failed downloading media: ${response.status}`);
	}

	const reader = response.body.getReader();
	try {
		if (Number(response.headers.get("content-length")) > MAX_MEDIA_BYTES) {
			throw new Error("media exceeds the 50 MiB download limit");
		}

		const chunks: Buffer[] = [];
		let total = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				return Buffer.concat(chunks, total);
			}
			total += value.byteLength;
			if (total > MAX_MEDIA_BYTES) {
				throw new Error("media exceeds the 50 MiB download limit");
			}
			chunks.push(
				Buffer.from(value.buffer, value.byteOffset, value.byteLength),
			);
		}
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}
