import { EmbedBuilder } from "discord.js";
import { getRandomPost } from "./redditFetcher.js";

const ERROR_IMG = "https://cdn.discordapp.com/attachments/1487372867153690664/1487372867350958221/IMG-20260328-WA0017.png";

export async function handleRedditCommand(interaction) {
  try {
    // Get subreddit name from command option, default to universityofauckland
    const subredditName = interaction.options.getString("subreddit") || "universityofauckland";

    // Defer reply to show loading state
    await interaction.deferReply();

    // Fetch random post
    const post = await getRandomPost(subredditName);

    // Check NSFW restrictions
    const isNSFW = post.over_18;
    const isNSFWChannel = interaction.channel?.nsfw || false;

    if (isNSFW && !isNSFWChannel) {
      // Post is NSFW but channel is not NSFW-marked
      await interaction.editReply({
        content: ERROR_IMG,
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("Cannot post NSFW content")
            .setDescription(`This post from r/${post.subreddit} is marked NSFW and cannot be shared in non-NSFW channels.`)
            .setFooter({ text: "Use /r in an NSFW channel to see NSFW posts" }),
        ],
      });
      return;
    }

    // Post is safe or channel is NSFW - show the post
    let description = `**Subreddit:** r/${post.subreddit}\n**Score:** ${post.score.toLocaleString()}\n**Author:** u/${post.author}`;
    
    // Add post body if it exists, truncate if too long
    if (post.selftext && post.selftext.trim()) {
      const bodyPreview = post.selftext.length > 512 
        ? post.selftext.substring(0, 512) + "...[truncated]" 
        : post.selftext;
      description += `\n\n**Post:**\n${bodyPreview}`;
    }

    const embed = new EmbedBuilder()
      .setColor("#FF4500") // Reddit orange
      .setTitle(post.title)
      .setURL(post.url)
      .setDescription(description)
      .setFooter(isNSFW ? { text: "⚠️ NSFW Content" } : null);

    await interaction.editReply({
      embeds: [embed],
    });
  } catch (error) {
    console.error("[bot] error in handleRedditCommand", error);

    // Handle errors
    const errorMessage = error.message || "An unexpected error occurred";

    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: ERROR_IMG,
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("Reddit Error")
              .setDescription(errorMessage)
              .setFooter({ text: "Try again with a different subreddit" }),
          ],
        });
      } else {
        await interaction.reply({
          content: ERROR_IMG,
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("Reddit Error")
              .setDescription(errorMessage)
              .setFooter({ text: "Try again with a different subreddit" }),
          ],
        });
      }
    } catch (replyError) {
      console.error("[bot] error replying to reddit command with error embed", replyError);
      try {
        // Fallback: send minimal response
        const fallbackMethod = interaction.deferred ? "editReply" : "reply";
        await interaction[fallbackMethod]({
          content: `${ERROR_IMG}\n\nError: ${errorMessage}`,
        });
      } catch (fallbackError) {
        console.error("[bot] error sending reddit command error fallback", fallbackError);
      }
    }
  }
}
