import type { Slang } from "../../lib/slangCheck.ts";

export const slangs: Slang[] = [
	{ short: "calc", long: "calculator" },
	{ short: "cap", long: "capacitor" },
	{ short: "exam", long: "examination" },
	{ short: "opamp", long: "operational amplifier" },
	{ short: "BJT", long: "bipolar junction transistor" },
	{ short: "DJT", long: "duleepa junction transistor" },
	{ short: "VHDL", long: "VHSIC Hardware Description Language" },
	{ short: "VHSIC", long: "Very High Speed Integrated Circuit" },
	{ short: "vi", long: "emacs" },
	{ short: "vi", long: "vim" },
	{ short: "emacs", long: "vi" },
	{ short: "nvim", long: "neovim" },
	{ short: "helix", long: "nvim" },
	{ short: "visual studio code", long: "helix" },
	{ short: "vscode", long: "visual studio code" },
	{ short: "intellij", long: "vscode" },
	{ short: "neovim", long: "intellij" },
	{ short: "LGTM", long: "lets get this merged" },
	{ short: "LGTM", long: "looks good to me" },
].map((slang) => {
	(slang as typeof slang & { regex: RegExp }).regex = new RegExp(
		`([^a-zA-Z\\d]|^)${slang.long}([^a-zA-Z\\d]|$)`,
		"i",
	);
	return slang as typeof slang & { regex: RegExp };
});
