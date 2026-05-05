import { describe, it } from "node:test";
import assert from "node:assert";
import {
	findNicknameChange,
	handleNicknameChanges,
} from "../lib/nicknameChange.ts";
import { createMockMessage } from "./mocks/message.ts";
import { config } from "../config.ts";

const invalidSeUserId = config.nicknameChanges[0]!.userId;
const hexperiodUserId = config.nicknameChanges[1]!.userId;
const nathansnailUserId = config.nicknameChanges[2]!.userId;

describe("findNicknameChange", () => {
	describe("InvalidSE patterns", () => {
		it("returns InvalidSE userId on (word)SE", () => {
			assert.strictEqual(findNicknameChange("testSE"), invalidSeUserId);
			assert.strictEqual(
				findNicknameChange("InvalidSE"),
				invalidSeUserId,
			);
			assert.strictEqual(findNicknameChange("ChrissSE"), invalidSeUserId);
		});
		it("returns InvalidSE userId on strings with spaces ending in SE", () => {
			assert.strictEqual(
				findNicknameChange("test case SE"),
				invalidSeUserId,
			);
		});
		it("returns InvalidSE userId on Invalid(word)", () => {
			assert.strictEqual(
				findNicknameChange("InvalidBot"),
				invalidSeUserId,
			);
			assert.strictEqual(
				findNicknameChange("Invalid bot token"),
				invalidSeUserId,
			);
		});
		it("matches case-insensitively", () => {
			assert.strictEqual(findNicknameChange("testse"), invalidSeUserId);
			assert.strictEqual(
				findNicknameChange("invalidbot"),
				invalidSeUserId,
			);
		});
		it("returns null for SE alone", () => {
			assert.strictEqual(findNicknameChange("SE"), null);
		});
		it("returns null for Invalid alone", () => {
			assert.strictEqual(findNicknameChange("Invalid"), null);
		});
	});

	describe("hexperiod patterns", () => {
		it("returns hexperiod userId on 0x(anything)", () => {
			assert.strictEqual(findNicknameChange("0xhello"), hexperiodUserId);
			assert.strictEqual(findNicknameChange("0xhex."), hexperiodUserId);
			assert.strictEqual(
				findNicknameChange("0xhello world"),
				hexperiodUserId,
			);
		});
		it("matches case-insensitively", () => {
			assert.strictEqual(findNicknameChange("0XHELLO"), hexperiodUserId);
		});
		it("returns null for 0x alone", () => {
			assert.strictEqual(findNicknameChange("0x"), null);
		});
	});

	describe("nathansnail patterns", () => {
		it("returns nathansnail userId on nathan(anything)", () => {
			assert.strictEqual(
				findNicknameChange("nathancool"),
				nathansnailUserId,
			);
			assert.strictEqual(
				findNicknameChange("nathan cool person"),
				nathansnailUserId,
			);
		});
		it("returns nathansnail userId on (anything)Snail", () => {
			assert.strictEqual(
				findNicknameChange("coolSnail"),
				nathansnailUserId,
			);
			assert.strictEqual(
				findNicknameChange("cool little snail"),
				nathansnailUserId,
			);
		});
		it("matches case-insensitively", () => {
			assert.strictEqual(
				findNicknameChange("NATHANCOOL"),
				nathansnailUserId,
			);
			assert.strictEqual(
				findNicknameChange("TESTSNAIL"),
				nathansnailUserId,
			);
		});
		it("returns null for nathan alone", () => {
			assert.strictEqual(findNicknameChange("nathan"), null);
		});
		it("returns null for snail alone", () => {
			assert.strictEqual(findNicknameChange("snail"), null);
		});
	});

	describe("non-matching content", () => {
		it("returns null for unrelated words", () => {
			assert.strictEqual(findNicknameChange("hello"), null);
			assert.strictEqual(findNicknameChange("hello world"), null);
		});
		it("returns null for empty string", () => {
			assert.strictEqual(findNicknameChange(""), null);
		});
	});
});

describe("handleNicknameChanges", () => {
	it("changes InvalidSE nickname on (word)SE message", async () => {
		let changedNickname: string | undefined;
		const message = createMockMessage({
			content: "testSE",
			guildMembers: {
				[invalidSeUserId]: {
					setNickname: async (n) => {
						changedNickname = n;
					},
				},
			},
		});
		await handleNicknameChanges(message);
		assert.strictEqual(changedNickname, "testSE");
	});

	it("changes InvalidSE nickname on Invalid(word) message", async () => {
		let changedNickname: string | undefined;
		const message = createMockMessage({
			content: "InvalidBot",
			guildMembers: {
				[invalidSeUserId]: {
					setNickname: async (n) => {
						changedNickname = n;
					},
				},
			},
		});
		await handleNicknameChanges(message);
		assert.strictEqual(changedNickname, "InvalidBot");
	});

	it("changes hexperiod nickname on 0x(word) message", async () => {
		let changedNickname: string | undefined;
		const message = createMockMessage({
			content: "0xhello",
			guildMembers: {
				[hexperiodUserId]: {
					setNickname: async (n) => {
						changedNickname = n;
					},
				},
			},
		});
		await handleNicknameChanges(message);
		assert.strictEqual(changedNickname, "0xhello");
	});

	it("changes nathansnail nickname on nathan(word) message", async () => {
		let changedNickname: string | undefined;
		const message = createMockMessage({
			content: "nathancool",
			guildMembers: {
				[nathansnailUserId]: {
					setNickname: async (n) => {
						changedNickname = n;
					},
				},
			},
		});
		await handleNicknameChanges(message);
		assert.strictEqual(changedNickname, "nathancool");
	});

	it("changes nathansnail nickname on (word)Snail message", async () => {
		let changedNickname: string | undefined;
		const message = createMockMessage({
			content: "coolSnail",
			guildMembers: {
				[nathansnailUserId]: {
					setNickname: async (n) => {
						changedNickname = n;
					},
				},
			},
		});
		await handleNicknameChanges(message);
		assert.strictEqual(changedNickname, "coolSnail");
	});

	it("does nothing when no pattern matches", async () => {
		let changedNickname: string | undefined;
		const memberMock = {
			setNickname: async (n: string) => {
				changedNickname = n;
			},
		};
		const message = createMockMessage({
			content: "hello world",
			guildMembers: {
				[invalidSeUserId]: memberMock,
				[hexperiodUserId]: memberMock,
				[nathansnailUserId]: memberMock,
			},
		});
		await handleNicknameChanges(message);
		assert.strictEqual(changedNickname, undefined);
	});

	it("does nothing when message has no guild", async () => {
		const message = createMockMessage({ content: "testSE" });
		await assert.doesNotReject(() => handleNicknameChanges(message));
	});

	it("reacts with ✅ on successful nickname change", async () => {
		const reactions: string[] = [];
		const message = createMockMessage({
			content: "testSE",
			onReact: (emoji) => {
				reactions.push(emoji);
			},
			guildMembers: {
				[invalidSeUserId]: { setNickname: async () => {} },
			},
		});
		await handleNicknameChanges(message);
		assert(reactions.includes("✅"));
	});

	it("reacts with ❌ and throws on failed nickname change", async () => {
		const reactions: string[] = [];
		const message = createMockMessage({
			content: "testSE",
			onReact: (emoji) => {
				reactions.push(emoji);
			},
			guildMembers: {
				[invalidSeUserId]: {
					setNickname: async () => {
						throw new Error("Missing Permissions");
					},
				},
			},
		});
		await assert.rejects(() => handleNicknameChanges(message));
		assert(reactions.includes("❌"));
	});
});
