import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

/**
 * A still PNG to stand in for the post's media on the card. Images and gifs
 * go through sharp; anything sharp can't read is assumed to be video and
 * handed to ffmpeg, which picks a representative frame rather than the
 * (often black) first one.
 */
export async function extractPreviewFrame(
	bytes: Buffer,
	sourceLabel: string,
): Promise<Buffer | null> {
	try {
		return await sharp(bytes, { animated: false }).png().toBuffer();
	} catch {
		// not an image, fall through to ffmpeg
	}

	const workspace = await mkdtemp(path.join(tmpdir(), "incinerate-"));
	try {
		const extension =
			path.extname(sourceLabel.split("?")[0] ?? "") || ".bin";
		const sourcePath = path.join(workspace, `source${extension}`);
		await writeFile(sourcePath, bytes);
		return await runFfmpegToBuffer([
			"-v",
			"error",
			"-i",
			sourcePath,
			"-vf",
			"thumbnail=24",
			"-frames:v",
			"1",
			"-f",
			"image2pipe",
			"-vcodec",
			"png",
			"pipe:1",
		]);
	} catch (error) {
		console.error("[bot] failed extracting preview frame", error);
		return null;
	} finally {
		await rm(workspace, { recursive: true, force: true });
	}
}

function runFfmpegToBuffer(args: string[]): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const ffmpeg = spawn("ffmpeg", args);
		const chunks: Buffer[] = [];
		let stderr = "";
		ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
		ffmpeg.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		ffmpeg.on("error", reject);
		ffmpeg.on("close", (code) => {
			const output = Buffer.concat(chunks);
			if (code === 0 && output.length > 0) {
				resolve(output);
				return;
			}
			reject(new Error(`ffmpeg failed (${code}): ${stderr.trim()}`));
		});
	});
}
