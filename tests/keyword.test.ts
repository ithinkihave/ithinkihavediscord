import { describe, it } from "node:test";
import { getResponses } from "../lib/keywordCheck.ts";
import { deepStrictEqual } from "node:assert";

describe("Guh", () => {
  it("Should say guh", () => {
    deepStrictEqual(getResponses("i say guh"), [
      "https://tenor.com/view/guh-gif-25116077",
    ]);
  });
  it("Should say guh once", () => {
    deepStrictEqual(getResponses("guh guh guh guh guh"), [
      "https://tenor.com/view/guh-gif-25116077",
    ]);
  });
  it("Should only say guh when i guh", () => {
    deepStrictEqual(getResponses("... glup"), []);
  });
});
