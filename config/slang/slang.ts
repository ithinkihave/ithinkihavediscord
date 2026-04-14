import type { Slang } from "../../lib/slangCheck.ts";

export const slangs: Slang[] = [
	{ short: "calc", long: "calculator" },
	{ short: "cap", long: "capacitor" },
	{ short: "exam", long: "examination" },
	{ short: "opamp", long: "operational amplifier" },
].map((slang) => {
	(slang as typeof slang & { regex: RegExp }).regex = new RegExp(
		`([^a-zA-Z\\d]|^)${slang.long}([^a-zA-Z\\d]|$)`,
		"i",
	);
	return slang as typeof slang & { regex: RegExp };
});
