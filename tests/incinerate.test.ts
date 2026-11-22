import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	getFrameCount,
	renderBurn,
	renderBurnFrames,
	type BurnOptions,
	type RgbaImage,
} from "../lib/incinerate/burn.ts";
import { discordMarkdownToPango } from "../lib/incinerate/card.ts";
import { renderBlackholeFrames } from "../lib/incinerate/blackhole.ts";
import { renderCrtFrames } from "../lib/incinerate/crt.ts";
import { renderDustFrames } from "../lib/incinerate/dust.ts";
import { renderMeltFrames } from "../lib/incinerate/melt.ts";
import {
	EFFECTS,
	formatMessageContent,
	incinerateMessage,
	pickEffect,
} from "../lib/incinerate/index.ts";
import { createMockMessage } from "./mocks/message.ts";

const FAST_BURN: BurnOptions = {
	fps: 10,
	holdMs: 300,
	activeMs: 1000,
	tailMs: 3000,
	seed: 42,
};

function solidCard(width: number, height: number): RgbaImage {
	const data = Buffer.alloc(width * height * 4);
	for (let i = 0; i < width * height; i += 1) {
		// a lighter stripe of "text" so the dust effect has content to blow away
		const isText = Math.floor(i / width) % 10 === 5;
		data[i * 4] = isText ? 220 : 49;
		data[i * 4 + 1] = isText ? 222 : 51;
		data[i * 4 + 2] = isText ? 225 : 56;
		data[i * 4 + 3] = 255;
	}
	return { data, width, height };
}

function opaqueFraction(frame: Buffer): number {
	let opaque = 0;
	for (let i = 3; i < frame.length; i += 4) {
		if (frame[i]! > 0) {
			opaque += 1;
		}
	}
	return opaque / (frame.length / 4);
}

describe("incineration", () => {
	for (const [name, effect] of [
		["burn", renderBurnFrames],
		["dust", renderDustFrames],
		["melt", renderMeltFrames],
		["crt", renderCrtFrames],
		["blackhole", renderBlackholeFrames],
	] as const) {
		it(`${name}: holds the intact card, then leaves nothing`, () => {
			const card = solidCard(120, 60);
			const frames = Array.from(effect(card, FAST_BURN));

			assert.equal(frames.length, getFrameCount(FAST_BURN));
			assert.ok(
				frames[0]!.equals(card.data),
				"first frame is the message",
			);
			assert.equal(opaqueFraction(frames[frames.length - 1]!), 0);
		});
	}

	it("burn sets fire to the message, not the empty card around it", () => {
		const [width, height] = [400, 200];
		const card = solidCard(width, height);
		const isText = (pixel: number) => Math.floor(pixel / width) % 10 === 5;
		// a transparent card: only the "text" rows are visible
		for (let i = 0; i < width * height; i += 1) {
			if (!isText(i)) {
				card.data[i * 4 + 3] = 0;
			}
		}

		for (const frame of renderBurnFrames(card, FAST_BURN)) {
			let outside = 0;
			for (let i = 0; i < width * height; i += 1) {
				if (!isText(i) && frame[i * 4 + 3]! > 0) {
					outside += 1;
				}
			}
			// only drifting embers and ash; a flame front across the empty
			// card would light up several percent of it
			assert.ok(
				outside / (width * height) < 0.01,
				`${outside} px alight`,
			);
		}
	});

	it("burn only ever shrinks the card", () => {
		const card = solidCard(120, 60);
		const frames = Array.from(renderBurnFrames(card, FAST_BURN));

		const coverage = frames.map(opaqueFraction);
		for (let i = 1; i < coverage.length; i += 1) {
			// embers can flicker over burnt-out space, but never by much
			assert.ok(coverage[i]! <= coverage[i - 1]! + 0.02);
		}
	});

	it("picks effects at random, never the same twice running", () => {
		const picks = Array.from({ length: 200 }, () => pickEffect());
		for (let i = 1; i < picks.length; i += 1) {
			assert.notEqual(picks[i], picks[i - 1]);
		}
		assert.deepEqual(new Set(picks), new Set(Object.keys(EFFECTS)));
	});

	it("encodes webp that plays once and parks on the empty last frame", async () => {
		const { data, format } = await renderBurn(solidCard(64, 32), FAST_BURN);
		assert.equal(format, "webp");
		assert.equal(data.toString("ascii", 8, 12), "WEBP");

		let loops = -1;
		let lastFrameMs = -1;
		for (let offset = 12; offset + 8 <= data.length; ) {
			const fourcc = data.toString("ascii", offset, offset + 4);
			const size = data.readUInt32LE(offset + 4);
			if (fourcc === "ANIM") {
				loops = data.readUInt16LE(offset + 12);
			} else if (fourcc === "ANMF") {
				lastFrameMs = data.readUIntLE(offset + 20, 3);
			}
			offset += 8 + size + (size & 1);
		}
		assert.equal(loops, 1);
		assert.equal(lastFrameMs, 0xffffff);
	});

	it("is deterministic for a given seed", () => {
		const card = solidCard(80, 40);
		const first = Array.from(renderBurnFrames(card, FAST_BURN));
		const second = Array.from(renderBurnFrames(card, FAST_BURN));
		assert.ok(first.every((frame, i) => frame.equals(second[i]!)));
	});

	it("resolves mentions, custom emoji and hides bare gif links", () => {
		const message = createMockMessage({
			content: "hey <@42> in <#7> with <@&9> <:pog:123> <a:dance:456>",
			mentions: {
				users: [{ id: "42", username: "parm", globalName: "Parmjot" }],
				roles: [{ id: "9", name: "clanker" }],
				channels: [{ id: "7", name: "eyes" }],
			},
		});
		assert.equal(
			formatMessageContent(message),
			"hey \ue000@Parmjot\ue001 in \ue000#eyes\ue001 with \ue000@clanker\ue001 :pog: :dance:",
		);

		const gifLink = createMockMessage({
			content: "https://tenor.com/view/some-gif-123",
			embeds: [{ video: { url: "https://media.tenor.com/x/abc.mp4" } }],
		});
		assert.equal(formatMessageContent(gifLink), "");
	});

	it("escapes markup before applying markdown", () => {
		assert.equal(
			discordMarkdownToPango("**bold** <b>not</b> & `code`"),
			'<b>bold</b> &lt;b&gt;not&lt;/b&gt; &amp; <span font_family="monospace" background="#2b2d31">code</span>',
		);
	});

	it("carries on if the original was deleted while rendering", async () => {
		const events: string[] = [];
		const message = createMockMessage({
			author: { username: "someone" },
			onDelete: () => {
				throw Object.assign(new Error("Unknown Message"), {
					code: 10008,
				});
			},
			onSend: () => ({
				delete: async () => {
					events.push("delete burn");
				},
			}),
		});

		await incinerateMessage(message, {
			scheduleCleanup: () => events.push("cleanup scheduled"),
		});
		assert.deepEqual(events, ["cleanup scheduled"]);
	});

	it("pulls the burn back down if the original can't be deleted", async () => {
		const events: string[] = [];
		const message = createMockMessage({
			author: { username: "someone" },
			onDelete: () => {
				throw new Error("Missing Permissions");
			},
			onSend: () => ({
				delete: async () => {
					events.push("delete burn");
				},
			}),
		});

		await assert.rejects(
			incinerateMessage(message, { scheduleCleanup: () => {} }),
			/Missing Permissions/,
		);
		assert.deepEqual(events, ["delete burn"]);
	});

	it("sends the burn, deletes the post, then cleans up after it plays", async () => {
		const events: string[] = [];
		let cleanup: (() => void) | undefined;
		let cleanupDelay = 0;
		let sentPayload: { files?: unknown[] } | undefined;

		const message = createMockMessage({
			content: "no eyes here",
			author: { username: "someone" },
			member: { displayName: "Someone", displayHexColor: "#e67e22" },
			onDelete: () => {
				events.push("delete original");
			},
			onSend: (payload) => {
				events.push("send burn");
				sentPayload = payload as { files?: unknown[] };
				return {
					delete: async () => {
						events.push("delete burn");
					},
				};
			},
		});

		await incinerateMessage(message, {
			scheduleCleanup: (fn, delayMs) => {
				cleanup = fn;
				cleanupDelay = delayMs;
			},
		});

		assert.deepEqual(events, ["send burn", "delete original"]);
		assert.equal(sentPayload?.files?.length, 1);
		assert.ok(cleanupDelay > 2000, "waits for the gif to finish");

		cleanup?.();
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(events, [
			"send burn",
			"delete original",
			"delete burn",
		]);
	});
});
