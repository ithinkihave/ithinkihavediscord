import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { config } from "../config.ts";
import { downloadMedia } from "../lib/eyeCheck/download.ts";
import {
	collectMediaTargetsFromMessage,
	detectEyesInLocalMedia,
	EYES_DETECTION_THRESHOLD,
	EyesScanBusyError,
	getEvenlySpacedTimestamps,
	handleEyesMediaCheck,
	isEyesChannelMessage,
	scanMediaUrl,
	textContainsEyes,
} from "../lib/eyeCheck/index.ts";
import { drawMatch } from "../lib/eyeScan.ts";
import { createMockMessage } from "./mocks/message.ts";

describe("eyes media checks", () => {
	it("identifies eyes channel by name when id is not configured", () => {
		const message = createMockMessage({
			channelId: "some-other-id",
			channelName: "eyes",
		});

		assert.equal(isEyesChannelMessage(message), true);
	});

	it("limits moderation to the configured channel ID", (t) => {
		const previous = config.channels.eyesChannelId;
		t.after(() => {
			config.channels.eyesChannelId = previous;
		});
		config.channels.eyesChannelId = "designated";
		assert.equal(
			isEyesChannelMessage(
				createMockMessage({ channelId: "designated" }),
			),
			true,
		);
		assert.equal(
			isEyesChannelMessage(createMockMessage({ channelName: "eyes" })),
			false,
		);
	});

	it("collects media targets from attachments and embeds", () => {
		const message = createMockMessage({
			attachments: [
				{
					url: "https://cdn.discordapp.com/test/image.png",
					contentType: "image/png",
				},
				{
					url: "https://cdn.discordapp.com/test/video.mp4",
					contentType: "video/mp4",
				},
			],
			embeds: [
				{
					image: {
						url: "https://example.com/embedded.gif",
						proxyURL:
							"https://images-ext-1.discordapp.net/external/image",
					},
				},
			],
		});

		const targets = collectMediaTargetsFromMessage(message);
		assert.deepEqual(targets, [
			{ url: "https://cdn.discordapp.com/test/image.png", kind: "image" },
			{
				url: "https://cdn.discordapp.com/test/video.mp4",
				kind: "animated",
			},
			{
				url: "https://images-ext-1.discordapp.net/external/image",
				kind: "animated",
			},
		]);
	});

	it("rejects external media hosts and disables redirects for approved hosts", async (t) => {
		const fetch = t.mock.method(
			globalThis,
			"fetch",
			async () => new Response("media"),
		);
		await assert.rejects(
			downloadMedia("https://example.com/image.png"),
			/approved hosts/,
		);
		assert.equal(fetch.mock.callCount(), 0);
		assert.equal(
			String(await downloadMedia("https://cdn.discordapp.com/image.png")),
			"media",
		);
		assert.equal(fetch.mock.calls[0]?.arguments[1]?.redirect, "error");
	});

	it("cancels downloads that exceed the byte cap without a length header", async (t) => {
		const chunk = new Uint8Array(1024 * 1024);
		let cancelled = false;
		t.mock.method(
			globalThis,
			"fetch",
			async () =>
				new Response(
					new ReadableStream({
						pull(controller) {
							controller.enqueue(chunk);
						},
						cancel() {
							cancelled = true;
						},
					}),
				),
		);
		await assert.rejects(
			downloadMedia("https://cdn.discordapp.com/image.png"),
			/50 MiB/,
		);
		assert.equal(cancelled, true);
	});

	it("rejects work before downloading when all scan slots are occupied", async (t) => {
		let finishDownload!: (response: Response) => void;
		const pendingDownload = new Promise<Response>((resolve) => {
			finishDownload = resolve;
		});
		const fetch = t.mock.method(globalThis, "fetch", () => pendingDownload);
		const concurrency = Math.min(4, availableParallelism());
		const url = "https://cdn.discordapp.com/image.png";
		const active = Promise.allSettled(
			Array.from({ length: concurrency }, () =>
				scanMediaUrl(url, "image/png"),
			),
		);
		try {
			await assert.rejects(
				scanMediaUrl(url, "image/png"),
				EyesScanBusyError,
			);
			assert.equal(fetch.mock.callCount(), concurrency);
		} finally {
			finishDownload(new Response(null, { status: 404 }));
			await active;
		}
	});

	it("scans one target per embed, preferring video over its thumbnail", () => {
		const message = createMockMessage({
			embeds: [
				{
					url: "https://tenor.com/view/eyes-123",
					video: { url: "https://media.tenor.com/abc/eyes.mp4" },
					thumbnail: { url: "https://media.tenor.com/abc/eyes.png" },
				},
			],
			stickers: [
				{
					url: "https://media.discordapp.net/stickers/1.png",
					format: 1,
				},
				{ url: "https://discord.com/stickers/2.json", format: 3 },
			],
		});

		assert.deepEqual(collectMediaTargetsFromMessage(message), [
			{ url: "https://media.tenor.com/abc/eyes.mp4", kind: "animated" },
			{
				url: "https://media.discordapp.net/stickers/1.png",
				kind: "image",
			},
		]);
	});

	it("spots eyes in text, including custom eye emoji", () => {
		assert.equal(textContainsEyes("look 👀"), true);
		assert.equal(textContainsEyes("<:side_eye:123>"), true);
		assert.equal(textContainsEyes("<a:EyesShaking:123>"), true);
		assert.equal(textContainsEyes("no eyes here :)"), false);
	});

	it("burns text-only posts without eyes", async () => {
		const events: string[] = [];
		const message = createMockMessage({
			channelName: "eyes",
			content: "why did my post get deleted",
			author: { username: "someone" },
			onDelete: () => {
				events.push("delete");
			},
			onSend: () => {
				events.push("send");
				return { delete: async () => {} };
			},
		});

		assert.equal(await handleEyesMediaCheck(message), true);
		assert.deepEqual(events, ["send", "delete"]);
	});

	it("waits for a link embed even when the post already has an attachment", async (t) => {
		const hit = await readFile(
			"tests/fixtures/eyes/contains/seal-lets-take-a-look.mp4",
		);
		const blank = await readFile("tests/fixtures/eyes/no-eyes/image.png");
		const link = "https://media1.tenor.com/abc/eyes.mp4";
		t.mock.method(
			globalThis,
			"fetch",
			async (url: string) =>
				new Response(new Uint8Array(url === link ? hit : blank)),
		);
		t.mock.timers.enable({ apis: ["setTimeout"] });
		let reacted = false;
		const message = createMockMessage({
			channelName: "eyes",
			content: "https://tenor.com/view/eyes-123",
			attachments: [{ url: "https://cdn.discordapp.com/test/image.png" }],
			onFetch: (message) =>
				Object.assign(message, { embeds: [{ video: { url: link } }] }),
			onReact: () => {
				reacted = true;
			},
			onDelete: () => assert.fail("the original should survive"),
		});
		const check = handleEyesMediaCheck(message);
		t.mock.timers.tick(1_500);
		await check;
		assert.equal(reacted, true);
	});

	it("spares text with eyes, eye stickers and system messages", async () => {
		const spared = [
			createMockMessage({ channelName: "eyes", content: "look 👀" }),
			createMockMessage({
				channelName: "eyes",
				content: "",
				stickers: [
					{
						url: "https://discord.com/stickers/1.json",
						format: 3,
						name: "Shifty Eyes",
					},
				],
			}),
			// someone pinned a message
			createMockMessage({ channelName: "eyes", content: "", type: 6 }),
		];

		for (const message of spared) {
			let deleted = false;
			const watched = Object.assign(message, {
				delete: async () => {
					deleted = true;
				},
			});
			assert.equal(await handleEyesMediaCheck(watched), false);
			assert.equal(deleted, false);
		}
	});

	it("locates the eyes and draws them on the matching frame", async () => {
		const match = await detectEyesInLocalMedia(
			path.resolve(
				"tests/fixtures/eyes/contains/seal-lets-take-a-look.mp4",
			),
			{ includeFrame: true },
		);

		assert.ok(match?.frame, "frame returned when asked for");
		// the seal's eyes sit in the upper-middle of a 240x424 clip
		assert.ok(match.bbox.x > 40 && match.bbox.x < 160);
		assert.ok(match.bbox.y > 40 && match.bbox.y < 160);

		const drawn = await sharp((await drawMatch(match))!).metadata();
		assert.equal(drawn.width, match.frame.width);
		assert.equal(drawn.height, match.frame.height);
	});

	it("finds eyes on the second frame of WebP and APNG animations", async (t) => {
		const reference = await detectEyesInLocalMedia(
			"tests/fixtures/eyes/contains/seal-lets-take-a-look.mp4",
			{ includeFrame: true },
		);
		assert.ok(reference?.frame);
		const { width, height, rgb } = reference.frame;
		const frames = Buffer.concat([
			Buffer.alloc(width * height * 3, 255),
			rgb,
		]);

		const webp = await sharp(frames, {
			raw: { width, height: height * 2, channels: 3, pageHeight: height },
		})
			.webp({ lossless: true, delay: [500, 500] })
			.toBuffer();

		const workspace = await mkdtemp(path.join(tmpdir(), "test-eyes-apng-"));
		t.after(() => rm(workspace, { recursive: true, force: true }));
		const apngPath = path.join(workspace, "animation.apng");
		const encode = spawnSync(
			"ffmpeg",
			[
				"-v",
				"error",
				"-f",
				"rawvideo",
				"-pixel_format",
				"rgb24",
				"-video_size",
				`${width}x${height}`,
				"-framerate",
				"2",
				"-i",
				"pipe:0",
				"-f",
				"apng",
				apngPath,
			],
			{ input: frames, encoding: "utf8", timeout: 15_000 },
		);
		assert.equal(encode.status, 0, encode.stderr);
		const apng = await readFile(apngPath);

		t.mock.method(
			globalThis,
			"fetch",
			async (url: string) =>
				new Response(
					new Uint8Array(url.endsWith(".webp") ? webp : apng),
				),
		);
		for (const [extension, type] of [
			["webp", "image/webp"],
			["png", "image/png"],
		] as const) {
			const result = await scanMediaUrl(
				`https://cdn.discordapp.com/animation.${extension}`,
				type,
			);
			assert.equal(
				result?.match?.frameIndex,
				1,
				`later frame of ${extension}`,
			);
		}
		assert.equal((await detectEyesInLocalMedia(apngPath))?.frameIndex, 1);
	});

	it("returns five evenly spaced timestamps", () => {
		const timestamps = getEvenlySpacedTimestamps(10, 5);
		assert.equal(timestamps.length, 5);
		assert.ok(timestamps[0] !== undefined && timestamps[0] >= 0);
		assert.ok(timestamps[4] !== undefined && timestamps[4] <= 10);
		assert.ok((timestamps[1] ?? 0) > (timestamps[0] ?? 0));
	});

	it("matches all fixtures in contains and no-eyes folders", async () => {
		const fixturesBasePath = path.resolve("tests/fixtures/eyes");
		const containsPath = path.join(fixturesBasePath, "contains");
		const noEyesPath = path.join(fixturesBasePath, "no-eyes");

		const runFullFixtures = process.env.EYES_FULL_FIXTURES === "1";
		const quickFixtures = {
			contains: ["eye-emoji-side-eye-emoji.mp4"],
			noEyes: ["image.png"],
		};

		const containsFiles = runFullFixtures
			? (await readdir(containsPath))
					.filter((name) => !name.startsWith("."))
					.map((name) => path.join(containsPath, name))
			: quickFixtures.contains.map((name) =>
					path.join(containsPath, name),
				);
		const noEyesFiles = runFullFixtures
			? (await readdir(noEyesPath))
					.filter((name) => !name.startsWith("."))
					.map((name) => path.join(noEyesPath, name))
			: quickFixtures.noEyes.map((name) => path.join(noEyesPath, name));

		const [containsResults, noEyesResults] = await Promise.all([
			Promise.all(
				containsFiles.map(async (filePath) => ({
					filePath,
					match: await detectEyesInLocalMedia(filePath),
				})),
			),
			Promise.all(
				noEyesFiles.map(async (filePath) => ({
					filePath,
					match: await detectEyesInLocalMedia(filePath),
				})),
			),
		]);

		const falseNegatives = containsResults
			.filter(({ match }) => !match)
			.map(
				({ filePath }) =>
					`${path.basename(filePath)} -> NO_MATCH (threshold=${EYES_DETECTION_THRESHOLD})`,
			);

		const falsePositives = noEyesResults
			.filter(({ match }) => match)
			.map(
				({ filePath, match }) =>
					`${path.basename(filePath)} -> ${match!.templateName} (threshold=${EYES_DETECTION_THRESHOLD}, value=${match!.score.toFixed(2)}, frame=${match!.frameIndex})`,
			);

		assert.equal(
			falsePositives.length,
			0,
			`False detections:\n${falsePositives.join("\n")}`,
		);
		assert.equal(
			falseNegatives.length,
			0,
			`Missed detections:\n${falseNegatives.join("\n")}`,
		);
	});
});
