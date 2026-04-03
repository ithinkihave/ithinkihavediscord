import { assert } from "node:console";
import { describe, it } from "node:test";
import { shouldDeleteDisallowedChineseChannelMessage } from "../lib/chineseCheck.js";

describe("No english", () => {
  it("Shouldn't allow english chars", () => {
    assert(shouldDeleteDisallowedChineseChannelMessage("Hello World"));
    assert(shouldDeleteDisallowedChineseChannelMessage("A"));
  });
  it("Shouldn't let you use emojis to break the rules", () => {
    assert(
      shouldDeleteDisallowedChineseChannelMessage(":regional_indicator_A:"),
    );
    assert(shouldDeleteDisallowedChineseChannelMessage("🇪"));
  });
  it("Should allow pings", () => {
    assert(!shouldDeleteDisallowedChineseChannelMessage("<@1234>"));
    assert(!shouldDeleteDisallowedChineseChannelMessage("<@&1234>"));
  });
});

describe("Yes chinese", () => {
  it("Should allow punctuation", () => {
    assert(
      !shouldDeleteDisallowedChineseChannelMessage(
        `朝辞白帝彩云间，
千里江陵一日还。
两岸猿声啼不住，
轻舟已过万重山。`,
      ),
    );
  });
  it("Should work with pings", () => {
    assert(
      !shouldDeleteDisallowedChineseChannelMessage(
        "<@495780356302045195> 生日快乐",
      ),
    );
  });
});

describe("No art", () => {
  it("Should block sus lines", () => {
    assert(
      shouldDeleteDisallowedChineseChannelMessage(`
. . ... .   .   ...
... ..  .   .   . .
. . ... ... ... ...
`),
    );
  });
  it("Shouldn't allow painting with chinese chars", () => {
    assert(
      shouldDeleteDisallowedChineseChannelMessage(`
日间日间日日日间日间间间日间间间日日日
日日日间日日间间日间间间日间间间日间日
日间日间日日日间日日日间日日日间日日日
`),
    );
  });
});
