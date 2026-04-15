import { toSeperatedRegex, type Slang } from "../../lib/slangCheck.ts";

export const slangs: Slang[] = [
	// electronics
	{ short: "comp", long: "computer" },
	{ short: "calc", long: "calculator" },
	{ short: "mic", long: "microphone" },

	{ short: "res", long: "resistor" },
	{ short: "ind", long: "inductor" },
	{ short: "cap", long: "capacitor" },

	{ short: "opamp", long: "operational amplifier" },
	{ short: "BJT", long: "bipolar junction transistor" },
	{ short: "DJT", long: "duleepa junction transistor" },
	{
		short: "MOSFET",
		long: "metal oxide semiconductor field effect transistor",
	},
	{ short: "FET", long: "field effect transistor" },

	{ short: "scope", long: "oscilloscope" },
	{ short: "meter", long: "multimeter" },
	{ short: "board", long: "breadboard" },

	// software
	{ short: "VHDL", long: "VHSIC Hardware Description Language" },
	{ short: "VHSIC", long: "Very High Speed Integrated Circuit" },
	{ short: "vi", long: "emacs" },
	{ short: "vi", long: "vim" },
	{ short: "vim", long: "vi improved" },
	{ short: "emacs", long: "vi" },
	{ short: "nvim", long: "neovim" },
	{ short: "helix", long: "nvim" },
	{ short: "visual studio code", long: "helix" },
	{ short: "vscode", long: "visual studio code" },
	{ short: "intellij", long: "vscode" },
	{ short: "neovim", long: "intellij" },

	{ short: "app", long: "application" },
	{ short: "spec", long: "specification" },

	{ short: "alg", long: "algorithm" },
	{ short: "func", long: "function" },
	{ short: "var", long: "variable" },
	{ short: "arg", long: "argument" },
	{ short: "param", long: "parameter" },
	{ short: "obj", long: "object" },
	{ short: "pkg", long: "package" },
	{ short: "lib", long: "library" },
	{ short: "dep", long: "dependency" },

	{ short: "bug", long: "feature" },
	{ short: "feature", long: "bug" },

	// github
	{ short: "repo", long: "repository" },
	{ short: "LGTM", long: "let's get this merged" },
	{ short: "LGTM", long: "lets get this merged" }, // so that it still responds to incorrect grammar
	{ short: "LGTM", long: "looks good to me" },
	{ short: "ref", long: "reference" },

	// university
	{ short: "uni", long: "university" },
	{ short: "lec", long: "lecture" },
	{ short: "lec", long: "lecturer" },
	{ short: "prof", long: "professor" },
	{ short: "lab", long: "laboratory" },
	{ short: "exam", long: "examination" },
	{ short: "tut", long: "tutorial" },

	{ short: "prereq", long: "prerequisite" },

	{ short: "TA", long: "teaching assistant" },
	{ short: "RA", long: "research assistant" },
	{ short: "GTA", long: "graduate teaching assistant" },
	{ short: "GRA", long: "graduate research assistant" },
	// lets be real; theyre all the same thing
	{ short: "TA", long: "RA" },
	{ short: "TA", long: "GTA" },
	{ short: "TA", long: "GRA" },
].map((slang) => ({
	...slang,
	regex: toSeperatedRegex(slang.long),
}));
