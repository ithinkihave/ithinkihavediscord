# ithinkihave 🤔

> **Disrupting community engagement 🚀 through AI-driven 🤖 conversational automation and next-generation moderation pipelines 🛡️.**

A high-impact Discord bot 🤖 delivering measurable value 📈 to the "i think i have" server 🖥️. It synergizes community moderation 🛡️, organic joke reactions ♟️, and best-in-class image-generating slash commands 🖼️ into a single, scalable solution 💼.

## Core value proposition 💎

- **Server brand management 🏷️** — dynamically renames the server 🖥️ when a message matches the "i think i have..." pattern 📝, driving brand awareness at scale 📈.
- **Bilingual truth-validation pipeline ❓** — replies to "is this true?" style messages in English and Chinese 🇨🇳, maximising cross-market reach 🌐.
- **Content compliance engine 🗑️** — deletes non-Chinese or suspicious ASCII-art-style messages 🚨 in the dedicated Chinese channel 🇨🇳, ensuring regulatory alignment ✅.
- **Sentiment-optimised community health 😊** — enforces positive-sentiment KPIs 📊 in one high-value channel 💎.
- **Keyword-triggered engagement 📢** — proactively replies to keyword matches 🔑 like `guh`, boosting interaction metrics 📈.
- **Gamified reaction framework ♟️** — randomly applies chess-themed custom emoji 🎲 to drive daily active user growth 🚀.
- **Visual content generation suite 🖼️** — the `/gpa` 📊 and `/glup` 💬 slash commands render text onto meme templates 🎨, unlocking viral content opportunities 🔥.

## Product roadmap & commands 🕹️

### `/gpa` 📊

A high-ROI 💰 command that renders the provided text onto the GPA template image 🖼️ and returns a single-frame GIF 🎞️, optimising shareability metrics 📈.

Example:

```text
/gpa text: NaN
```

![The GPA template with a GPA of NaN](res/gpa-nan.gif)

### `/glup` 💬

An end-to-end meme-generation solution 💡 that renders wrapped text 📝 into the glup speech bubble 💬. A custom image template 🖼️ can optionally be injected 💉 to personalise the content pipeline 🎨.

Example:

```text
/glup text: (λx.+x1)4→+ 4 1
```

![The glup template with a lambda expression as text](res/glup-lambda.gif)

## Automated message behaviours 💌

### 🏷️ Server rename — brand-identity module

If a message starts with one of these high-intent patterns 📝, the bot executes a server-rename action 🏷️ to keep brand identity agile and responsive 🚀:

- `i think i have ...`
- `我想我有 ...`
- `我觉得我有 ...`
- `i think ... austin`
- `我想 ... austin`
- `我觉得 ... austin`

### ✅ Truth replies — fact-verification service

The bot 🤖 delivers real-time ⚡ fact-validation responses to high-signal messages including:

- `is this true?`
- `is it real`
- `这是真的吗`
- `真的假的`

In one restricted guild 🔒, this vertical only activates inside the `is-this-true` channel 📍 to maintain scoped service-level agreements 🤝.

### 🇨🇳 Chinese-only channel — compliance & governance module

In the configured Chinese channel 🇨🇳, the bot enforces a zero-tolerance content-governance policy 🗑️, removing messages 🚨 that:

- contain non-Chinese characters 🚫 outside a small approved allowlist 📋
- contain attachments 📎 outside the accepted content taxonomy 🗂️
- fail the Han-character ratio quality threshold 📉
- exhibit ASCII-art or repeated-character spam patterns 🤖 indicative of low-value content 🗑️

### 😊 Happy channel — sentiment analytics platform

In the configured "happy" channel 😊, all messages are passed through an AI-powered 🤖 `natural` sentiment-scoring pipeline 📊:

- positive-sentiment messages receive a 👍 reaction, reinforcing healthy community behaviours 🌱
- messages scoring below `0.2` are removed 🗑️ to protect the channel's net-promoter score 📊

## Technology stack 🛠️

Our lean, cloud-native 🌐 technology stack is optimised for rapid iteration ⚡ and low operational overhead 💰:

| Technology | Role | Value |
|---|---|---|
| Node.js `v22+` 🟢 | Runtime | Industry-standard, high-throughput execution environment |
| discord.js 💬 | Platform SDK | Direct integration with the Discord API surface |
| sharp 🖼️ | Image processing | Best-in-class performance for GIF/PNG generation pipelines |
| natural 🌿 | NLP engine | Powers the sentiment-analysis and keyword-matching modules |

## Onboarding & go-to-market setup ⚙️

### 1. Dependency acquisition 📦

Leverage `npm` 📦 to onboard all required packages into the local environment 💻:

```bash
npm install
```

### 2. Environment configuration 🔐

Provision a `.env` file 📄 with your deployment credentials 🔑 to activate the authentication layer 🔐:

```env
TOKEN=your_discord_bot_token
COMMAND_GUILD_ID=your_test_or_target_guild_id
```

Strategic notes 📝:

- `TOKEN` is a required 🔑 credential — the core authentication asset 🛡️ for all API calls.
- `COMMAND_GUILD_ID` is an optional 🎯 parameter. If omitted ➡️, the platform falls back to the built-in server ID 🖥️, enabling zero-friction deployment 🚀.

### 3. Launch 🚀

Execute the following ▶️ to bring the platform live 🚀:

```bash
npm start
```

On successful initialisation ✅, the bot 🤖 auto-registers the `/gpa` and `/glup` slash commands 🕹️ for the target guild, delivering an instant command-line product experience 🚀.

## Quality assurance & test coverage 🧪

Our rigorous QA pipeline 🔬 ensures production-grade reliability 💪. Execute the full test suite ▶️ with:

```bash
npm test
```

Current test coverage 📋 spans all core business-logic modules 🏗️:

- 🔍 truth-question matching — validates the fact-verification service ✅
- 🇨🇳 Chinese-channel filtering rules — ensures compliance-engine correctness ⚖️
- 🔑 keyword matching — confirms engagement-trigger accuracy 🎯
- 🏷️ server rename matching — verifies brand-management logic 🏗️
- 😊 sentiment analysis — stress-tests the sentiment-scoring pipeline 📊
- 🖼️ image text layout helpers — guarantees visual-content generation fidelity 🎨

## Configuration & customisation notes 📝

This platform is currently optimised 🎯 for a single strategic Discord deployment 🖥️. Several values representing key business configuration ⚙️ are hard-coded in the source 💻, including:

- guild IDs 🆔 — top-level organisational unit identifiers 🏢
- channel IDs 🆔 — per-channel product surface identifiers 📍
- role IDs 🎭 — access-control and permissions configuration 🔒
- custom emoji IDs 😄 — brand asset references 🎨
- template images 🖼️ — visual content IP 💡

To onboard this solution 💼 into a new server environment 🔧, start by conducting a thorough audit 🔍 of [index.js](index.js) and the service modules in [lib](/lib) 📁.
