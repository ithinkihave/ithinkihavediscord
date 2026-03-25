require("dotenv").config();
const { Client, GatewayIntentBits, messageLink } = require("discord.js");

const ithinkihaveserver = "1435477855596318742";
const 中文 = "1486174868054474762";

const trueresponses = require("./res/true.json");
const falseresponses = require("./res/false.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

const responses = [
  { key: "guh", responses: ["https://tenor.com/view/guh-gif-25116077"] },
];

client.on("ready", (client) => {
  console.log(`yuhh ${client.user.tag} is online.`);

  // print current date nice
  console.log(new Date().toLocaleString("en-NZ"));
  console.log(new Date(2024, 11, 18, 0, 53, 0).toLocaleString("en-NZ"));
});

client.on("messageCreate", async (msg) => {
  if (msg.guild.id && msg.guild.id == ithinkihaveserver) {
    console.log(`[${msg.author.tag}] ${msg.content}`);
  }

  if (msg.author.id == client.user.id) {
    return;
  }

  if (msg.content.toLowerCase().includes("is this true") || msg.content.toLowerCase().includes("这是真的吗") || msg.content.toLowerCase().includes("is this real")) {
    const chance = Math.random();
    if (chance < 0.5) {
      const randomResponse =
        trueresponses[Math.floor(Math.random() * trueresponses.length)];
      msg.channel.send(randomResponse);
    } else {
      const randomResponse =
        falseresponses[Math.floor(Math.random() * falseresponses.length)];
      msg.channel.send(randomResponse);
    }
  }

  if (msg.content.toLowerCase().startsWith("i think") || msg.content.toLowerCase().startsWith("我觉得") || msg.content.toLowerCase().startsWith("我想")) {
    try {
      (await client.guilds.fetch(ithinkihaveserver)).setName(
        msg.content.toLowerCase(),
      );
    } catch (error) {
      console.error("[bot] error changing server name");
    }
  }

  // check for messages in the 中文 chat and if they contain english delete them
  if (msg.guild.id && msg.guild.id == 中文 && /[a-zA-Z]/.test(msg.content)) {
    try {
      await msg.delete();
    } catch (error) {
      console.error("[bot] error deleting message in 中文 chat");
    }
  }

  checkForKeywords(msg);
});

client.login(process.env.TOKEN);

function checkForKeywords(msg) {
  for (const item of responses) {
    if (msg.content.toLowerCase().includes(item.key)) {
      const randomResponse =
        item.responses[Math.floor(Math.random() * item.responses.length)];
      msg.reply(randomResponse);
    }
  }
}
