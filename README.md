# ithinkihave 🤔

> **Hark! 🚀 'Tis a most disruptive instrument of community engagement 🤖, wrought of AI-driven conversational sorcery and next-generation moderation pipelines 🛡️.**

A most high-impact Discord bot 🤖 doth deliver measurable value 📈 unto the "i think i have" server 🖥️. It doth synergize community moderation 🛡️, organic jest reactions ♟️, and best-in-class image-generating slash commands 🖼️ into a single, scalable solution most grand 💼.

## Core value proposition 💎

- **Server brand management 🏷️** — doth dynamically rename the server 🖥️ when a missive matches the "i think i have..." pattern 📝, driving brand awareness across the realm 📈.
- **Bilingual truth-validation pipeline ❓** — doth reply to "is this true?" style missives in both the English tongue and the Chinese 🇨🇳, maximising cross-market reach 'cross the globe 🌐.
- **Content compliance engine 🗑️** — doth strike down non-Chinese or suspicious ASCII-art-style missives 🚨 in the dedicated Chinese channel 🇨🇳, ensuring regulatory alignment most righteous ✅.
- **Sentiment-optimised community health 😊** — doth enforce positive-sentiment KPIs 📊 in one high-value channel most precious 💎.
- **Keyword-triggered engagement 📢** — doth proactively reply to keyword matches 🔑 such as `guh`, boosting interaction metrics most gloriously 📈.
- **Gamified reaction framework ♟️** — doth randomly bestow chess-themed custom emoji 🎲 to drive daily active user growth most vigorously 🚀.
- **Visual content generation suite 🖼️** — the `/gpa` 📊 and `/glup` 💬 slash commands doth render text upon meme templates 🎨, unlocking viral content opportunities most bountiful 🔥.

## Product roadmap & commands 🕹️

### `/gpa` 📊

A high-ROI 💰 command that doth render the provided text upon the GPA template image 🖼️ and returneth a single-frame GIF 🎞️, optimising shareability metrics most admirably 📈.

Example:

```text
/gpa text: NaN
```

![The GPA template with a GPA of NaN](res/gpa-nan.gif)

### `/glup` 💬

An end-to-end meme-generation solution 💡 that doth render wrapped text 📝 into the glup speech bubble 💬. A custom image template 🖼️ may optionally be injected 💉 to personalise the content pipeline most finely 🎨.

Example:

```text
/glup text: (λx.+x1)4→+ 4 1
```

![The glup template with a lambda expression as text](res/glup-lambda.gif)

## Automated message behaviours 💌

### 🏷️ Server rename — brand-identity module

Shouldst a missive commence with one of these high-intent patterns 📝, the bot doth execute a server-rename action 🏷️ to keep brand identity agile and most responsive 🚀:

- `i think i have ...`
- `我想我有 ...`
- `我觉得我有 ...`
- `i think ... austin`
- `我想 ... austin`
- `我觉得 ... austin`

### ✅ Truth replies — fact-verification service

The bot 🤖 doth deliver real-time ⚡ fact-validation responses to high-signal missives including:

- `is this true?`
- `is it real`
- `这是真的吗`
- `真的假的`

In one restricted guild 🔒, this vertical doth only activate inside the `is-this-true` channel 📍 to maintain scoped service-level agreements most honourable 🤝.

### 🇨🇳 Chinese-only channel — compliance & governance module

In the configured Chinese channel 🇨🇳, the bot doth enforce a zero-tolerance content-governance policy 🗑️, removing missives 🚨 that:

- contain non-Chinese characters 🚫 outside a small approved allowlist 📋
- contain attachments 📎 outside the accepted content taxonomy 🗂️
- fail the Han-character ratio quality threshold 📉
- exhibit ASCII-art or repeated-character spam patterns 🤖 most indicative of low-value content 🗑️

### 😊 Happy channel — sentiment analytics platform

In the configured "happy" channel 😊, all missives are passed through an AI-powered 🤖 `natural` sentiment-scoring pipeline 📊:

- missives of positive sentiment doth receive a 👍 reaction, reinforcing healthy community behaviours most wholesome 🌱
- missives scoring below `0.2` are removed 🗑️ to safeguard the channel's net-promoter score most zealously 📊

## Technology stack 🛠️

Our lean, cloud-native 🌐 technology stack is optimised for rapid iteration ⚡ and low operational overhead most efficient 💰:

| Technology | Role | Value |
|---|---|---|
| Node.js `v22+` 🟢 | Runtime | Industry-standard, high-throughput execution environment |
| discord.js 💬 | Platform SDK | Direct integration with the Discord API surface |
| sharp 🖼️ | Image processing | Best-in-class performance for GIF/PNG generation pipelines |
| natural 🌿 | NLP engine | Powers the sentiment-analysis and keyword-matching modules |

## Onboarding & go-to-market setup ⚙️

### 1. Dependency acquisition 📦

Prithee, leverage `npm` 📦 to onboard all required packages into thy local environment 💻:

```bash
npm install
```

### 2. Environment configuration 🔐

Thou must provision a `.env` file 📄 with thy deployment credentials 🔑 to activate the authentication layer 🔐:

```env
TOKEN=your_discord_bot_token
COMMAND_GUILD_ID=your_test_or_target_guild_id
```

Strategic notes 📝:

- `TOKEN` is a required 🔑 credential — the core authentication asset most vital 🛡️ for all API calls.
- `COMMAND_GUILD_ID` is an optional 🎯 parameter. If omitted ➡️, the platform doth fall back to the built-in server ID 🖥️, enabling zero-friction deployment most swift 🚀.

### 3. Launch 🚀

Execute the following ▶️ to bring the platform live and flourishing 🚀:

```bash
npm start
```

Upon successful initialisation ✅, the bot 🤖 doth auto-register the `/gpa`, `/glup`, and `/emoji-war` slash commands 🕹️ for the target guild, delivering an instant command-line product experience most splendid 🚀.

## Quality assurance & test coverage 🧪

Our rigorous QA pipeline 🔬 doth ensure production-grade reliability most steadfast 💪. Execute the full test suite ▶️ with:

```bash
npm test
```

Current test coverage 📋 doth span all core business-logic modules 🏗️:

- 🔍 truth-question matching — doth validate the fact-verification service ✅
- 🇨🇳 Chinese-channel filtering rules — doth ensure compliance-engine correctness ⚖️
- 🔑 keyword matching — doth confirm engagement-trigger accuracy 🎯
- 🏷️ server rename matching — doth verify brand-management logic 🏗️
- 😊 sentiment analysis — doth stress-test the sentiment-scoring pipeline 📊
- 🖼️ image text layout helpers — doth guarantee visual-content generation fidelity 🎨

## Configuration & customisation notes 📝

This platform is currently optimised 🎯 for a single strategic Discord deployment most focused 🖥️. Several values representing key business configuration ⚙️ are hard-coded in the source 💻, including:

- guild IDs 🆔 — top-level organisational unit identifiers of the realm 🏢
- channel IDs 🆔 — per-channel product surface identifiers most precise 📍
- role IDs 🎭 — access-control and permissions configuration most guarded 🔒
- custom emoji IDs 😄 — brand asset references most cherished 🎨
- template images 🖼️ — visual content IP most prized 💡

To onboard this solution 💼 into a new server environment most noble 🔧, thou shouldst commence with a thorough audit 🔍 of [index.js](index.js) and the service modules in [lib](/lib) 📁.
