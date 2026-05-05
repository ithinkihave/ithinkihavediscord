import { describe, it } from "node:test";
import assert from "node:assert";
import {
	matchesInvalidSE,
	matchesHex,
	matchesNathan,
	handleNicknameChanges,
} from "../lib/nicknameChange.ts";
import { createMockMessage } from "./mocks/message.ts";
import { config } from "../config.ts";

describe("matchesInvalidSE", () => {
	describe("(word)SE pattern", () => {
		it("matches a word ending in SE", () => {
			assert(matchesInvalidSE("testSE"));
			assert(matchesInvalidSE("InvalidSE"));
			assert(matchesInvalidSE("ChrissSE"));
		});
		it("matches strings with spaces ending in SE", () => {
			assert(matchesInvalidSE("test case SE"));
			assert(matchesInvalidSE("hello world se"));
		});
		it("matches case-insensitively", () => {
			assert(matchesInvalidSE("testse"));
			assert(matchesInvalidSE("TESTse"));
		});
		it("does not match SE alone", () => {
			assert.strictEqual(matchesInvalidSE("SE"), false);
		});
	});

	describe("Invalid(word) pattern", () => {
		it("matches a word starting with Invalid", () => {
			assert(matchesInvalidSE("InvalidBot"));
			assert(matchesInvalidSE("InvalidToken"));
			assert(matchesInvalidSE("InvalidSE"));
		});
		it("matches strings with spaces after Invalid", () => {
			assert(matchesInvalidSE("Invalid bot token"));
			assert(matchesInvalidSE("Invalid user name"));
		});
		it("matches case-insensitively", () => {
			assert(matchesInvalidSE("invalidbot"));
			assert(matchesInvalidSE("INVALIDBOT"));
		});
		it("does not match Invalid alone", () => {
			assert.strictEqual(matchesInvalidSE("Invalid"), false);
		});
	});

	describe("non-matching content", () => {
		it("does not match unrelated words", () => {
			assert.strictEqual(matchesInvalidSE("hello"), false);
			assert.strictEqual(matchesInvalidSE("nathancool"), false);
			assert.strictEqual(matchesInvalidSE("0xhello"), false);
		});
		it("does not match empty string", () => {
			assert.strictEqual(matchesInvalidSE(""), false);
		});
	});
});

describe("matchesHex", () => {
	it("matches 0x followed by a word", () => {
		assert(matchesHex("0xhello"));
		assert(matchesHex("0xtest"));
		assert(matchesHex("0xhex."));
	});
	it("matches 0x followed by a string with spaces", () => {
		assert(matchesHex("0xhello world"));
		assert(matchesHex("0x some value"));
	});
	it("matches case-insensitively", () => {
		assert(matchesHex("0XHELLO"));
		assert(matchesHex("0Xtest"));
	});
	it("does not match 0x alone", () => {
		assert.strictEqual(matchesHex("0x"), false);
	});
	it("does not match unrelated words", () => {
		assert.strictEqual(matchesHex("hello"), false);
		assert.strictEqual(matchesHex("InvalidBot"), false);
		assert.strictEqual(matchesHex("nathancool"), false);
	});
});

describe("matchesNathan", () => {
	it("matches nathan followed by a word", () => {
		assert(matchesNathan("nathancool"));
		assert(matchesNathan("nathansnail"));
		assert(matchesNathan("nathanbot"));
	});
	it("matches nathan followed by a string with spaces", () => {
		assert(matchesNathan("nathan cool person"));
		assert(matchesNathan("nathan is here"));
	});
	it("matches case-insensitively", () => {
		assert(matchesNathan("NATHANCOOL"));
		assert(matchesNathan("NathanCool"));
	});
	it("does not match nathan alone", () => {
		assert.strictEqual(matchesNathan("nathan"), false);
	});
	it("does not match unrelated words", () => {
		assert.strictEqual(matchesNathan("hello"), false);
		assert.strictEqual(matchesNathan("testSE"), false);
		assert.strictEqual(matchesNathan("0xhello"), false);
	});
});

describe("handleNicknameChanges", () => {
	it("changes InvalidSE nickname on (word)SE message", async () => {
		let changedNickname: string | undefined;
		const message = createMockMessage({
			content: "testSE",
			guildMembers: {
				[config.users.invalidSeUserId]: {
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
				[config.users.invalidSeUserId]: {
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
				[config.users.hexperiodUserId]: {
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
				[config.users.nathansnailUserId]: {
					setNickname: async (n) => {
						changedNickname = n;
					},
				},
			},
		});
		await handleNicknameChanges(message);
		assert.strictEqual(changedNickname, "nathancool");
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
				[config.users.invalidSeUserId]: memberMock,
				[config.users.hexperiodUserId]: memberMock,
				[config.users.nathansnailUserId]: memberMock,
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
				[config.users.invalidSeUserId]: {
					setNickname: async () => {},
				},
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
				[config.users.invalidSeUserId]: {
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
