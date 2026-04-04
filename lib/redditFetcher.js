import fetch from "node-fetch";

/**
 * Fetches a random post from a specified subreddit
 * @param {string} subredditName - The subreddit name (without r/ prefix, e.g., "todayilearned")
 * @returns {Promise<Object>} Post object with {title, url, score, author, subreddit, over_18, created_utc}
 * @throws {Error} If subreddit is missing, invalid, or fetch fails
 */
export async function getRandomPost(subredditName) {
  // Validate input
  if (!subredditName || typeof subredditName !== "string" || subredditName.trim() === "") {
    throw new Error("Subreddit name is required");
  }

  const cleanedName = subredditName.trim();

  // Validate subreddit name format (alphanumeric, underscores, hyphens only)
  if (!/^[a-zA-Z0-9_-]+$/.test(cleanedName)) {
    throw new Error(`Invalid subreddit name: "${cleanedName}". Use only letters, numbers, underscores, and hyphens.`);
  }

  try {
    // Fetch from Reddit's unofficial JSON endpoint
    const url = `https://reddit.com/r/${cleanedName}.json?limit=100`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "floorgy-bot/1.0",
      },
    });

    // Handle HTTP errors
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Subreddit "r/${cleanedName}" not found or is private`);
      }
      throw new Error(`Reddit API error: HTTP ${response.status}`);
    }

    const data = await response.json();

    // Check if response has valid structure
    if (!data?.data?.children || !Array.isArray(data.data.children) || data.data.children.length === 0) {
      throw new Error(`No posts found in r/${cleanedName}`);
    }

    // Filter out posts and select random one
    const posts = data.data.children
      .map((child) => child.data)
      .filter((post) => post && post.title && post.url); // Basic validation

    if (posts.length === 0) {
      throw new Error(`No valid posts found in r/${cleanedName}`);
    }

    const randomPost = posts[Math.floor(Math.random() * posts.length)];

    // Return post object with relevant fields
    return {
      title: randomPost.title,
      url: randomPost.url,
      score: randomPost.score,
      author: randomPost.author || "[deleted]",
      subreddit: randomPost.subreddit,
      over_18: randomPost.over_18 || false,
      created_utc: randomPost.created_utc,
      selftext: randomPost.selftext || "",
    };
  } catch (error) {
    // Re-throw with context if it's already a user-facing error
    if (error.message.includes("Subreddit") || error.message.includes("Invalid") || error.message.includes("No posts")) {
      throw error;
    }

    // Network errors, timeouts, etc.
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error("Failed to reach Reddit. Please try again later.");
    }

    throw new Error(`Error fetching from r/${subredditName}: ${error.message}`);
  }
}
