import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { before, describe, it, type TestContext } from "node:test";
import {
	ApplicationCommandOptionType,
	AttachmentBuilder,
	Client,
	MessageFlags,
	type InteractionEditReplyOptions,
	type InteractionReplyOptions,
} from "discord.js";
import sharp from "sharp";
import { damnBirdCommandData, handleDamnBirdCommand } from "../lib/damnBird.ts";

const templatePath = fileURLToPath(
	new URL("../img/damn-bird.png", import.meta.url),
);
const portrait = { left: 85, top: 0, width: 491, height: 665 };
const captionStart = 573;
const uploadUrl = "https://cdn.discordapp.com/attachments/test/image.png";
const uploadError = "Couldn't load that image. Try a PNG, JPEG, GIF or WebP.";

function createInteraction(caption: string, imageUrl?: string) {
	const calls: string[] = [];
	const replies: InteractionReplyOptions[] = [];
	const editedReplies: (InteractionEditReplyOptions | string)[] = [];
	const interaction = {
		commandName: "damnnnnn",
		isChatInputCommand: () => true,
		options: {
			getString(name: string, required: boolean) {
				assert.equal(name, "caption");
				assert.equal(required, true);
				return caption;
			},
			getAttachment(name: string) {
				assert.equal(name, "image");
				return imageUrl ? { url: imageUrl } : null;
			},
		},
		async reply(reply: InteractionReplyOptions) {
			calls.push("reply");
			replies.push(reply);
		},
		async deferReply() {
			calls.push("deferReply");
		},
		async editReply(reply: InteractionEditReplyOptions | string) {
			calls.push("editReply");
			editedReplies.push(reply);
		},
	};

	return {
		calls,
		replies,
		editedReplies,
		interaction: interaction as unknown as Parameters<
			typeof handleDamnBirdCommand
		>[0],
	};
}

function readPng(reply: InteractionEditReplyOptions | string | undefined) {
	assert(reply && typeof reply !== "string");
	assert.equal(reply.files?.length, 1);
	const file = reply.files[0];
	assert(file instanceof AttachmentBuilder);
	assert.equal(file.name, "damnnnnn.png");
	assert(Buffer.isBuffer(file.attachment));
	return file.attachment;
}

async function renderCaption(caption: string, imageUrl?: string) {
	const command = createInteraction(caption, imageUrl);
	await handleDamnBirdCommand(command.interaction);
	assert.deepEqual(command.calls, ["deferReply", "editReply"]);
	return readPng(command.editedReplies[0]);
}

function mockUpload(t: TestContext, data: Buffer) {
	return t.mock.method(
		globalThis,
		"fetch",
		async () => new Response(Uint8Array.from(data)),
	);
}

function solidImage(width: number, height: number, background = "#ff00ff") {
	return sharp({ create: { width, height, channels: 3, background } });
}

function rgba(image: Buffer) {
	return sharp(image).ensureAlpha().raw().toBuffer();
}

function changedBounds(
	actual: Buffer,
	original: Buffer,
	startY: number,
	endY: number,
) {
	let left = portrait.width;
	let top = endY;
	let right = -1;
	let bottom = -1;
	for (let y = startY; y < endY; y++) {
		for (let x = 0; x < portrait.width; x++) {
			const offset = (y * portrait.width + x) * 4;
			if (actual.readUInt32LE(offset) === original.readUInt32LE(offset)) {
				continue;
			}
			left = Math.min(left, x);
			top = Math.min(top, y);
			right = Math.max(right, x);
			bottom = Math.max(bottom, y);
		}
	}
	if (right === -1) return undefined;
	return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

describe("/damnnnnn", () => {
	let original: Buffer;

	before(async () => {
		original = await sharp(templatePath)
			.extract(portrait)
			.ensureAlpha()
			.raw()
			.toBuffer();
	});

	it("defines a required caption and an optional attachment in Discord", () => {
		assert.equal(damnBirdCommandData.name, "damnnnnn");
		assert.deepEqual(
			damnBirdCommandData.options?.map((option) => ({
				name: option.name,
				type: option.type,
				required: Boolean(option.required),
			})),
			[
				{
					name: "caption",
					type: ApplicationCommandOptionType.String,
					required: true,
				},
				{
					name: "image",
					type: ApplicationCommandOptionType.Attachment,
					required: false,
				},
			],
		);
		const caption = damnBirdCommandData.options?.[0];
		assert(caption?.type === ApplicationCommandOptionType.String);
		assert.equal(caption.max_length, 120);
	});

	for (const [label, caption] of [
		["empty", ""],
		["whitespace only", " \t\n\u2003 "],
		["control characters only", "\u0000\u0007"],
	] as const) {
		it(`rejects a caption that is ${label} before downloading the image`, async (t) => {
			const fetch = mockUpload(t, Buffer.alloc(0));
			const command = createInteraction(caption, uploadUrl);
			await handleDamnBirdCommand(command.interaction);
			assert.deepEqual(command.calls, ["reply"]);
			assert.deepEqual(command.replies, [
				{
					content: "Caption cannot be empty.",
					flags: MessageFlags.Ephemeral,
				},
			]);
			assert.equal(fetch.mock.callCount(), 0);
		});
	}

	it("renders a portrait PNG caption and preserves the bird when no image is supplied", async (t) => {
		const fetch = mockUpload(t, Buffer.alloc(0));
		const png = await renderCaption("SATURATION!!!");
		const { format, width, height } = await sharp(png).metadata();
		assert.deepEqual([format, width, height], ["png", 491, 665]);
		const pixels = await rgba(png);
		assert.equal(
			changedBounds(pixels, original, 0, captionStart),
			undefined,
		);
		const caption = changedBounds(
			pixels,
			original,
			captionStart,
			portrait.height,
		);
		assert(caption);
		assert(caption.width > 100);
		assert(caption.top > captionStart);
		assert(caption.top + caption.height < portrait.height);
		assert(
			Math.abs(caption.left + caption.width / 2 - portrait.width / 2) <
				15,
		);
		assert.equal(fetch.mock.callCount(), 0);
	});

	it("collapses whitespace and strips control characters from the caption", async () => {
		const normalized = await renderCaption("small signal gain");
		const padded = await renderCaption(" \tsmall\n signal\u0000   gain  ");
		assert.deepEqual(await rgba(padded), await rgba(normalized));
	});

	it("renders caption characters that have special meaning in SVG", async () => {
		const plain = await renderCaption("GAIN");
		const escaped = await renderCaption(`GAIN <&> "'`);
		const pixels = await rgba(escaped);
		assert.notDeepEqual(pixels, await rgba(plain));
		assert(changedBounds(pixels, original, captionStart, portrait.height));
		assert.equal(
			changedBounds(pixels, original, 0, captionStart),
			undefined,
		);
	});

	it("wraps a 120-character caption within the portrait", async () => {
		const pixels = await rgba(
			await renderCaption("SATURATION! ".repeat(9) + "SATURATION!!"),
		);
		const caption = changedBounds(
			pixels,
			original,
			captionStart,
			portrait.height,
		);
		assert(caption);
		assert(caption.left > 0);
		assert(caption.left + caption.width < portrait.width);
		assert(caption.top > captionStart);
		assert(caption.top + caption.height < portrait.height);
		let lineCount = 0;
		let previousRowHasText = false;
		for (let y = caption.top; y < caption.top + caption.height; y++) {
			const rowStart = y * portrait.width * 4;
			const rowEnd = rowStart + portrait.width * 4;
			const rowHasText = !pixels
				.subarray(rowStart, rowEnd)
				.equals(original.subarray(rowStart, rowEnd));
			if (rowHasText && !previousRowHasText) lineCount++;
			previousRowHasText = rowHasText;
		}
		assert(lineCount >= 2);
	});

	for (const letter of ["W", "m"]) {
		it(`fits a long unbroken caption of ${letter}s within the portrait`, async () => {
			const pixels = await rgba(await renderCaption(letter.repeat(120)));
			const caption = changedBounds(
				pixels,
				original,
				captionStart,
				portrait.height,
			);
			assert(caption);
			assert(caption.left > 0);
			assert(caption.left + caption.width < portrait.width);
			assert(caption.top + caption.height < portrait.height);
		});
	}

	for (const { label, source, expected } of [
		{
			label: "wide",
			source: [400, 100],
			expected: { left: 63, top: 176, width: 330, height: 83 },
		},
		{
			label: "tall",
			source: [100, 400],
			expected: { left: 191, top: 70, width: 74, height: 295 },
		},
		{
			label: "square",
			source: [600, 600],
			expected: { left: 81, top: 70, width: 295, height: 295 },
		},
		{
			label: "small",
			source: [24, 20],
			expected: { left: 63, top: 80, width: 330, height: 275 },
		},
		{
			label: "one-pixel-wide",
			source: [1, 1024],
			expected: { left: 228, top: 70, width: 1, height: 295 },
		},
		{
			label: "one-pixel-high",
			source: [1024, 1],
			expected: { left: 63, top: 217, width: 330, height: 1 },
		},
	] satisfies {
		label: string;
		source: [number, number];
		expected: object;
	}[]) {
		it(`scales and centers a ${label} upload while preserving its aspect ratio`, async (t) => {
			const fetch = mockUpload(
				t,
				await solidImage(...source)
					.png()
					.toBuffer(),
			);
			const pixels = await rgba(
				await renderCaption("SATURATION!!!", uploadUrl),
			);
			assert.equal(fetch.mock.callCount(), 1);
			assert.equal(fetch.mock.calls[0]?.arguments[0], uploadUrl);
			assert.deepEqual(
				changedBounds(pixels, original, 0, captionStart),
				expected,
			);
			assert(
				changedBounds(pixels, original, captionStart, portrait.height),
			);
		});
	}

	it("keeps the bird visible through transparent parts of an upload", async (t) => {
		const image = await sharp({
			create: {
				width: 40,
				height: 20,
				channels: 4,
				background: "#ff00ff",
			},
		})
			.extend({
				left: 0,
				top: 0,
				bottom: 0,
				right: 40,
				background: "#00000000",
			})
			.png()
			.toBuffer();
		mockUpload(t, image);
		const png = await renderCaption("Transparent", uploadUrl);
		const pixels = await rgba(png);
		const opaque = (217 * portrait.width + 120) * 4;
		const transparent = (217 * portrait.width + 350) * 4;
		assert.deepEqual(
			[...pixels.subarray(opaque, opaque + 4)],
			[255, 0, 255, 255],
		);
		assert.deepEqual(
			pixels.subarray(transparent, transparent + 4),
			original.subarray(transparent, transparent + 4),
		);
	});

	it("honors JPEG orientation before fitting the upload", async (t) => {
		const image = await solidImage(400, 100)
			.withMetadata({ orientation: 6 })
			.jpeg()
			.toBuffer();
		mockUpload(t, image);
		const pixels = await rgba(await renderCaption("Rotated", uploadUrl));
		assert.deepEqual(changedBounds(pixels, original, 0, captionStart), {
			left: 191,
			top: 70,
			width: 74,
			height: 295,
		});
	});

	it("uses the first frame of an animated GIF", async (t) => {
		const first = await solidImage(16, 16, "#ff00ff").raw().toBuffer();
		const second = await solidImage(16, 16, "#00ff00").raw().toBuffer();
		const gif = await sharp(Buffer.concat([first, second]), {
			raw: { width: 16, height: 32, channels: 3, pageHeight: 16 },
		})
			.gif({ delay: [100, 100] })
			.toBuffer();
		assert.equal((await sharp(gif).metadata()).pages, 2);
		mockUpload(t, gif);
		const png = await renderCaption("Animated", uploadUrl);
		const pixels = await rgba(png);
		const center = (217 * portrait.width + 228) * 4;
		assert.deepEqual(
			[...pixels.subarray(center, center + 4)],
			[255, 0, 255, 255],
		);
		assert.equal((await sharp(png).metadata()).pages ?? 1, 1);
	});

	it("decodes a WebP upload", async (t) => {
		mockUpload(
			t,
			await solidImage(100, 100).webp({ lossless: true }).toBuffer(),
		);
		const pixels = await rgba(await renderCaption("WebP", uploadUrl));
		assert.deepEqual(changedBounds(pixels, original, 0, captionStart), {
			left: 81,
			top: 70,
			width: 295,
			height: 295,
		});
	});

	for (const { label, download } of [
		{
			label: "a non-image file",
			download: () => new Response("not an image"),
		},
		{
			label: "an empty file",
			download: () => new Response(new Uint8Array()),
		},
		{
			label: "an expired CDN link",
			download: () => new Response(null, { status: 404 }),
		},
		{
			label: "an oversized download",
			download: () =>
				new Response("image", {
					headers: { "content-length": "52428801" },
				}),
		},
		{
			label: "a failed request",
			download: () => Promise.reject(new Error("connection reset")),
		},
	]) {
		it(`edits the deferred reply with an error for ${label}`, async (t) => {
			t.mock.method(globalThis, "fetch", download);
			const command = createInteraction("SATURATION!!!", uploadUrl);
			await handleDamnBirdCommand(command.interaction);
			assert.deepEqual(command.calls, ["deferReply", "editReply"]);
			assert.deepEqual(command.editedReplies, [uploadError]);
		});
	}

	it("rejects an unapproved attachment host before fetching it", async (t) => {
		const fetch = mockUpload(t, Buffer.alloc(0));
		const command = createInteraction(
			"SATURATION!!!",
			"https://example.com/image.png",
		);
		await handleDamnBirdCommand(command.interaction);
		assert.deepEqual(command.calls, ["deferReply", "editReply"]);
		assert.deepEqual(command.editedReplies, [uploadError]);
		assert.equal(fetch.mock.callCount(), 0);
	});

	it("registers the command at startup and dispatches it through the bot", async (t) => {
		const captureBot = t.mock.fn((client: Client) => client);
		t.mock.method(Client.prototype, "login", async function (this: Client) {
			captureBot(this);
			return "test login";
		});
		t.mock.method(console, "log", () => {});
		await import("../index.ts");
		const bot = captureBot.mock.calls[0]?.arguments[0];
		assert(bot);

		const set = t.mock.fn(async (commands: unknown[]) => commands);
		const ready = bot.listeners("ready")[0];
		assert(ready);
		ready({
			user: { tag: "test-bot" },
			application: { commands: { set } },
		} as unknown as Client<true>);
		assert.equal(set.mock.callCount(), 1);
		assert(set.mock.calls[0]?.arguments[0].includes(damnBirdCommandData));

		const command = createInteraction("SATURATION!!!");
		const dispatch = bot.listeners("interactionCreate")[0];
		assert(dispatch);
		await dispatch(command.interaction);
		assert.deepEqual(command.calls, ["deferReply", "editReply"]);
		readPng(command.editedReplies[0]);
	});
});
