import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import {
	collectMediaTargetsFromMessage,
	detectEyesInLocalMedia,
	EYES_DETECTION_THRESHOLD,
	getEvenlySpacedTimestamps,
	isEyesChannelMessage,
} from "../lib/eyeCheck/index.ts";
import { createMockMessage } from "./mocks/message.ts";

describe("eyes media checks", () => {
	it("identifies eyes channel by name when id is not configured", () => {
		const message = createMockMessage({
			channelId: "some-other-id",
			channelName: "eyes",
		});

		assert.equal(isEyesChannelMessage(message), true);
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
					image: { url: "https://example.com/embedded.gif" },
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
			{ url: "https://example.com/embedded.gif", kind: "animated" },
		]);
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
