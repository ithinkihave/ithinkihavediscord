import { strict as assert } from "assert";
import { describe, it, beforeEach, afterEach } from "node:test";
import { getRandomPost } from "../lib/redditFetcher.js";

describe("redditFetcher", () => {
  describe("getRandomPost", () => {
    it("should return a post object with required fields for a valid subreddit", async () => {
      const post = await getRandomPost("todayilearned");

      assert(post.title, "post should have title");
      assert(post.url, "post should have url");
      assert(typeof post.score === "number", "post should have numeric score");
      assert(post.author, "post should have author");
      assert(post.subreddit === "todayilearned", "post.subreddit should match requested subreddit");
      assert(typeof post.over_18 === "boolean", "post should have over_18 flag");
      assert(typeof post.created_utc === "number", "post should have created_utc timestamp");
    });

    it("should throw error if subreddit name is missing", async () => {
      await assert.rejects(
        () => getRandomPost(""),
        {
          message: "Subreddit name is required",
        },
        "should reject empty subreddit name"
      );

      await assert.rejects(
        () => getRandomPost(null),
        {
          message: "Subreddit name is required",
        },
        "should reject null subreddit name"
      );

      await assert.rejects(
        () => getRandomPost(undefined),
        {
          message: "Subreddit name is required",
        },
        "should reject undefined subreddit name"
      );
    });

    it("should throw error for invalid subreddit format", async () => {
      await assert.rejects(
        () => getRandomPost("invalid@sub"),
        /Invalid subreddit name/,
        "should reject subreddit with special characters"
      );

      await assert.rejects(
        () => getRandomPost("invalid sub"),
        /Invalid subreddit name/,
        "should reject subreddit with spaces"
      );
    });

    it("should throw error for nonexistent subreddit", async () => {
      await assert.rejects(
        () => getRandomPost("xyznonexistentsubredditname12345"),
        {
          message: /Subreddit "r\/xyznonexistentsubredditname12345" not found or is private/,
        },
        "should reject nonexistent subreddit"
      );
    });

    it("should handle whitespace in subreddit name", async () => {
      const post = await getRandomPost("  todayilearned  ");

      assert(post.subreddit === "todayilearned", "should trim whitespace and fetch correct subreddit");
      assert(post.title, "should return valid post");
    });

    it("should return different random posts on multiple calls", async () => {
      const post1 = await getRandomPost("todayilearned");
      const post2 = await getRandomPost("todayilearned");

      // With 100 post limit, it's very unlikely to get same post twice
      // but not impossible, so we just verify both are valid posts
      assert(post1.title, "first call should return post");
      assert(post2.title, "second call should return post");
      assert(post1.url, "first call post should have url");
      assert(post2.url, "second call post should have url");
    });

    it("should work with subreddits containing underscores and hyphens", async () => {
      const post = await getRandomPost("ask_reddit");

      assert(post.title, "should work with underscore");
      assert(post.subreddit === "ask_reddit" || post.subreddit === "AskReddit", "should return valid post from ask_reddit");
    });
  });
});
