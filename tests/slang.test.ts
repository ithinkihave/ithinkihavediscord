import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getResponse, toSeperatedRegex } from "../lib/slangCheck.ts";

describe("toSeperatedRegex", () => {
	it("matches the pattern at the start of a string", () => {
		assert.ok(toSeperatedRegex("cap").test("cap is short for capacitor"));
	});

	it("matches the pattern at the end of a string", () => {
		assert.ok(toSeperatedRegex("cap").test("I bought a cap"));
	});

	it("matches the pattern surrounded by spaces", () => {
		assert.ok(toSeperatedRegex("cap").test("buy a cap today"));
	});

	it("matches the pattern preceded by punctuation", () => {
		assert.ok(toSeperatedRegex("cap").test("(cap) is short"));
	});

	it("does not match when pattern is a prefix of a longer word", () => {
		assert.ok(!toSeperatedRegex("cap").test("capacitor"));
	});

	it("does not match when pattern is a suffix of a longer word", () => {
		assert.ok(!toSeperatedRegex("cap").test("kneecap"));
	});

	it("is case-insensitive", () => {
		assert.ok(toSeperatedRegex("cap").test("CAP is short for capacitor"));
	});
});

describe("Slang matching", () => {
	it("returns undefined when no slang is present", () => {
		assert.equal(getResponse("hello there"), undefined);
	});

	it("matches a known long-form word", () => {
		const original = Math.random;
		Math.random = () => 0;
		try {
			const response = getResponse("I just bought a capacitor");
			assert.ok(response !== undefined, "expected a response");
			assert.ok(
				response.includes("cap"),
				`expected response to mention 'cap', got: ${response}`,
			);
		} finally {
			Math.random = original;
		}
	});

	it("is case-insensitive", () => {
		const original = Math.random;
		Math.random = () => 0;
		try {
			const response = getResponse("CAPACITOR is what I need");
			assert.ok(response !== undefined, "expected a match for CAPACITOR");
		} finally {
			Math.random = original;
		}
	});

	it("does not match partial word (word boundary check)", () => {
		assert.equal(getResponse("capacitors are everywhere"), undefined);
	});

	it("substitutes $short and $long in the template", () => {
		const original = Math.random;
		Math.random = () => 0;
		try {
			const response = getResponse("I'm using a capacitor here");
			assert.ok(response !== undefined);
			// template index 0: "# DID YOU KNOW!\n**$short** is short for **$long**!"
			assert.ok(
				response.includes("cap") && response.includes("capacitor"),
				`expected both short and long in response, got: ${response}`,
			);
		} finally {
			Math.random = original;
		}
	});

	it("returns a definition when asked what a slang term means", () => {
		const response = getResponse("what is cap");
		assert.equal(response, "cap means capacitor");
	});

	it("returns a definition for question with punctuation", () => {
		const response = getResponse("what is cap?");
		assert.equal(response, "cap means capacitor");
	});

	it("prioritises definition over slang response", () => {
		const response = getResponse("what does calc mean");
		assert.equal(response, "calc means calculator");
	});
});

describe("Editor wars slang", () => {
	it("suggests vi when message contains emacs", () => {
		const original = Math.random;
		Math.random = () => 0;
		try {
			const response = getResponse("I use emacs every day");
			assert.ok(response !== undefined, "expected a response for emacs");
			assert.ok(
				response.includes("vi"),
				`expected response to mention 'vi', got: ${response}`,
			);
		} finally {
			Math.random = original;
		}
	});

	it("suggests nvim when message contains neovim", () => {
		const original = Math.random;
		Math.random = () => 0;
		try {
			const response = getResponse("I switched to neovim");
			assert.ok(response !== undefined, "expected a response for neovim");
			assert.ok(
				response.includes("nvim"),
				`expected response to mention 'nvim', got: ${response}`,
			);
		} finally {
			Math.random = original;
		}
	});

	it("suggests intellij when message contains vscode", () => {
		const original = Math.random;
		Math.random = () => 0;
		try {
			const response = getResponse("I prefer vscode for everything");
			assert.ok(response !== undefined, "expected a response for vscode");
			assert.ok(
				response.includes("intellij"),
				`expected response to mention 'intellij', got: ${response}`,
			);
		} finally {
			Math.random = original;
		}
	});

	it("returns definition for vi (vi means emacs)", () => {
		const response = getResponse("what is vi");
		assert.equal(response, "vi means emacs");
	});

	it("returns definition for emacs (emacs means vi)", () => {
		const response = getResponse("what is emacs");
		assert.equal(response, "emacs means vi");
	});

	// nvim is both a short form (for neovim) and appears as long form in
	// { short: "helix", long: "nvim" }. Definition should win over a slang
	// reply that would suggest "helix".
	it("definition takes precedence: what is nvim returns nvim means neovim", () => {
		const response = getResponse("what is nvim");
		assert.equal(response, "nvim means neovim");
	});
});
