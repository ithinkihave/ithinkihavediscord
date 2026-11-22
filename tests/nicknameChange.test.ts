import { describe, it } from "node:test";
import assert from "node:assert";
import {
	findNicknameChange,
	handleNicknameChanges,
} from "../lib/nicknameChange.ts";
import { createMockMessage } from "./mocks/message.ts";
import { handleMessage } from "../lib/messageHandler.ts";

const invalidSeUserId = "261232467955023872";
const hexperiodUserId = "495780356302045195";
const nathansnailUserId = "553043214374928395";

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

	it("gives explicit prefixes priority when a suffix also matches", () => {
		assert.strictEqual(findNicknameChange("0xse"), hexperiodUserId);
		assert.strictEqual(findNicknameChange("0XSnail"), hexperiodUserId);
		assert.strictEqual(findNicknameChange("nathanSE"), nathansnailUserId);
		assert.strictEqual(findNicknameChange("InvalidSnail"), invalidSeUserId);
	});

	it("matches nicknames up to 32 characters after trimming", () => {
		const nickname = "0x" + "🦎".repeat(30);
		assert.strictEqual(
			findNicknameChange(` ${nickname} `),
			hexperiodUserId,
		);
		assert.strictEqual(findNicknameChange(nickname + "🦎"), null);
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

	it("skips long matches without fetching a guild member or reacting", async () => {
		const message = createMockMessage({
			content: "0x" + "a".repeat(31),
			guildMembers: {},
			onReact: () =>
				assert.fail("An ignored message should not get a reaction"),
		});
		await handleNicknameChanges(message);
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

describe("nickname changes in the message pipeline", () => {
	it("sends the usual error image when the nickname update fails", async (t) => {
		t.mock.method(Math, "random", () => 0.5);
		t.mock.method(console, "error", () => {});
		const reactions: string[] = [];
		const sent: unknown[] = [];
		const message = createMockMessage({
			content: "0xse",
			guildMembers: {
				[hexperiodUserId]: {
					setNickname: async () => {
						throw new Error("Missing Permissions");
					},
				},
			},
			onReact: (emoji) => {
				reactions.push(emoji);
			},
			onSend: (payload) => sent.push(payload),
		});

		await handleMessage(message, "messageCreate");

		assert.deepStrictEqual(reactions, ["❌"]);
		assert.deepStrictEqual(sent, [
			"https://cdn.discordapp.com/attachments/1487372867153690664/1487372867350958221/IMG-20260328-WA0017.png",
		]);
	});

	it("keeps a successful rename when the success reaction fails", async (t) => {
		t.mock.method(Math, "random", () => 0.5);
		t.mock.method(console, "error", () => {});
		const changes: string[] = [];
		const sent: unknown[] = [];
		const message = createMockMessage({
			content: " 0xSE ",
			guildMembers: {
				[hexperiodUserId]: {
					setNickname: async (nickname) => {
						changes.push(nickname);
					},
				},
			},
			onReact: () => {
				throw new Error("Missing Permissions");
			},
			onSend: (payload) => sent.push(payload),
		});

		await handleMessage(message, "messageCreate");

		assert.deepStrictEqual(changes, ["0xSE"]);
		assert.deepStrictEqual(sent, []);
	});
});
