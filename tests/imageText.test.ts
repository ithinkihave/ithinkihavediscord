import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fitTextToBox, normalizeBox, wrapText } from "../lib/imageText.ts";

describe("image text layout", () => {
	it("normalizes coordinate bounds", () => {
		assert.deepEqual(normalizeBox({ x1: 0, y1: 65, x2: 186, y2: 217 }), {
			x: 0,
			y: 65,
			width: 186,
			height: 152,
		});
	});

	it("wraps long text into multiple lines", () => {
		const lines = wrapText(
			"this is a very long sentence that should wrap inside the bubble",
			120,
			18,
		);

		assert(lines.length > 1);
	});

	it("fits text inside the glup speech bubble bounds", () => {
		const layout = fitTextToBox(
			"this is a very long sentence that should be squeezed and wrapped to fit inside the speech bubble",
			{ x1: 0, y1: 65, x2: 186, y2: 217 },
			{
				padding: 8,
				minFontSize: 12,
				maxFontSize: 42,
				lineGap: 1.04,
				horizontalSquish: 0.94,
			},
		);

		assert(layout.fontSize >= 12);
		assert(layout.fontSize <= 42);
		assert(layout.blockWidth <= 170);
		assert(layout.blockHeight <= 136);
		assert(layout.lines.length >= 2);
	});
});
