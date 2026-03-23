require('dotenv').config();
const { Client, GatewayIntentBits, messageLink } = require('discord.js');

const ithinkihaveserver = '1435477855596318742';
const trueresponses = [
    "https://tenor.com/view/true-love-gif-18324778560370268269",
    "https://tenor.com/view/fentcord-true-coyote-gif-2599436844608872721",
    "true!",
    "https://tenor.com/view/morgan-freeman-true-seal-gif-8993121496866626214",
    "https://tenor.com/view/memes-gif-9980668056796018353",
    "https://tenor.com/qroSoIP9tfK.gif",
    "https://tenor.com/view/whatever-go-my-scarab-whatever-go-my-true-scarab-go-my-scarab-morgan-freeman-gif-3091971228562826566",
    "https://tenor.com/view/he-made-a-statement-so-good-even-his-gang-praised-him-dog-check-mark-happy-green-gif-8429843223482741276",
    "https://tenor.com/view/he-made-a-statement-so-factual-even-his-gang-applauded-him-gif-7484528142807708083",
]
const falseresponses = [
    "false",
    "https://tenor.com/view/fact-check-kellanrockssoccer-gif-2569170256995872124",
    "https://tenor.com/view/he-made-such-a-bad-he-made-he-made-such-a-bad-statement-gif-8431545385226321029",
    "https://tenor.com/view/opps-gif-16378882966061421087",
]

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
    { key: "guh", responses: ["https://tenor.com/view/guh-gif-25116077"] }
];

client.on('ready', (client) => {
    console.log(`yuhh ${client.user.tag} is online.`);

    // print current date nice
    console.log(new Date().toLocaleString('en-NZ'));
    console.log((new Date(2024, 11, 18, 0, 53, 0)).toLocaleString('en-NZ'));
});

client.on('messageCreate', async msg => {
    console.log(`[${msg.author.tag}] ${msg.content}`);

    if (msg.author.id == client.user.id) {
        return;
    }

    if (msg.content.toLowerCase().includes("is this true")) {
        const chance = Math.random();
        if (chance < 0.5) {
            msg.reply("True");
        } else {
            msg.reply("False");
        }
    }

    if (msg.content.toLowerCase().startsWith("i think i have")) {
        try {
            msg.guild.setName(msg.content.toLowerCase());
        } catch (error) {
            console.error("[bot] error changing server name");
        }
    }

    checkForKeywords(msg);
});

client.login(process.env.TOKEN);

function checkForKeywords(msg) {
    for (const item of responses) {
        if (msg.content.toLowerCase().includes(item.key)) {
            const randomResponse = item.responses[Math.floor(Math.random() * item.responses.length)];
            msg.reply(randomResponse);
        }
    }
}