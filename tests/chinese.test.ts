import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldDeleteChineseChannelContent } from "../lib/chineseCheck.js";

describe("No english", () => {
  it("Shouldn't allow english chars", () => {
    assert(shouldDeleteChineseChannelContent("Hello World"));
    assert(shouldDeleteChineseChannelContent("A"));
  });
  it("Shouldn't let you use emojis to break the rules", () => {
    assert(shouldDeleteChineseChannelContent(":regional_indicator_A:"));
    assert(shouldDeleteChineseChannelContent("🇪"));
  });
  it("Should allow pings", () => {
    assert(!shouldDeleteChineseChannelContent("<@1234> 一"));
    assert(!shouldDeleteChineseChannelContent("<@&1234> 一"));
  });
});

describe("Yes chinese", () => {
  it("Should allow punctuation", () => {
    assert(
      !shouldDeleteChineseChannelContent(
        `朝辞白帝彩云间，
千里江陵一日还。
两岸猿声啼不住，
轻舟已过万重山。`,
      ),
    );
  });
  it("Should work with pings", () => {
    assert(
      !shouldDeleteChineseChannelContent("<@495780356302045195> 生日快乐"),
    );
  });
});

describe("No art", () => {
  it("Should block sus lines", () => {
    assert(
      shouldDeleteChineseChannelContent(`
. . ... .   .   ...
... ..  .   .   . .
. . ... ... ... ...
`),
    );
  });
  it("Shouldn't allow painting with chinese chars", () => {
    assert(
      shouldDeleteChineseChannelContent(`
日间日间日日日间日间间间日间间间日日日
日日日间日日间间日间间间日间间间日间日
日间日间日日日间日日日间日日日间日日日
`),
    );
  });
});
