import sharp from "sharp";
import type { RgbaImage } from "./burn.ts";

export type MessageCardInput = {
	displayName: string;
	// role colour, or null for the default name colour
	nameColor: string | null;
	avatar: Buffer | null;
	timestamp: Date;
	// Discord-flavoured markdown, mentions already resolved to plain names
	content: string;
	media: Buffer | null;
	isEdited?: boolean;
	timeZone?: string;
	// no backdrop, so the chat itself shows through (needs a format with
	// real alpha; GIF's on/off transparency fringes the text)
	transparent?: boolean;
};

// Discord's dark theme chat background
const CARD_BACKGROUND = { r: 26, g: 26, b: 30, alpha: 1 };
const TRANSPARENT = { ...CARD_BACKGROUND, alpha: 0 };
const DEFAULT_NAME_COLOR = "#f2f3f5";
const TIMESTAMP_COLOR = "#949ba4";
const CONTENT_COLOR = "#dbdee1";
const MENTION_FOREGROUND = "#c9cdfb";
const MENTION_BACKGROUND = "#5865f2";
const CODE_BACKGROUND = "#2b2d31";
const FONT_FAMILY = "Noto Sans, DejaVu Sans, sans-serif";

const CARD_WIDTH = 540;
const AVATAR_SIZE = 40;
const GUTTER_LEFT = 16;
const CONTENT_LEFT = GUTTER_LEFT + AVATAR_SIZE + 16;
const PADDING_TOP = 14;
const PADDING_BOTTOM = 16;
const PADDING_RIGHT = 16;
const MEDIA_MAX_WIDTH = 400;
const MEDIA_MAX_HEIGHT = 300;
const MEDIA_RADIUS = 8;
const MAX_CONTENT_CHARS = 700;

export async function renderMessageCard(
	input: MessageCardInput,
): Promise<RgbaImage> {
	const textWidth = CARD_WIDTH - CONTENT_LEFT - PADDING_RIGHT;
	const [header, body, avatar, media] = await Promise.all([
		renderMarkup(buildHeaderMarkup(input), textWidth),
		input.content.trim()
			? renderContent(input.content, textWidth, input.isEdited ?? false)
			: Promise.resolve(null),
		renderAvatar(input.avatar),
		input.media ? renderMedia(input.media) : Promise.resolve(null),
	]);

	const composites: sharp.OverlayOptions[] = [
		{ input: avatar, left: GUTTER_LEFT, top: PADDING_TOP + 2 },
		{ input: header.buffer, left: CONTENT_LEFT, top: PADDING_TOP },
	];

	let cursor = PADDING_TOP + header.height + 2;
	if (body) {
		composites.push({
			input: body.buffer,
			left: CONTENT_LEFT,
			top: cursor,
		});
		cursor += body.height;
	}
	if (media) {
		cursor += 6;
		composites.push({
			input: media.buffer,
			left: CONTENT_LEFT,
			top: cursor,
		});
		cursor += media.height;
	}

	const height = Math.max(
		cursor + PADDING_BOTTOM,
		PADDING_TOP + AVATAR_SIZE + PADDING_BOTTOM,
	);

	const { data, info } = await sharp({
		create: {
			width: CARD_WIDTH,
			height,
			channels: 4,
			background: input.transparent ? TRANSPARENT : CARD_BACKGROUND,
		},
	})
		.composite(composites)
		.raw()
		.toBuffer({ resolveWithObject: true });

	return { data, width: info.width, height: info.height };
}

function buildHeaderMarkup(input: MessageCardInput): string {
	const nameColor = normalizeNameColor(input.nameColor);
	return (
		`<span font_family="${FONT_FAMILY}" weight="500" size="16pt" foreground="${nameColor}">${escapeMarkup(input.displayName)}</span>` +
		`<span font_family="${FONT_FAMILY}" size="12pt" foreground="${TIMESTAMP_COLOR}">   ${escapeMarkup(formatTimestamp(input.timestamp, input.timeZone))}</span>`
	);
}

async function renderContent(
	content: string,
	width: number,
	isEdited: boolean,
): Promise<RenderedText> {
	const edited = isEdited
		? `<span size="10pt" foreground="${TIMESTAMP_COLOR}"> (edited)</span>`
		: "";
	const trimmed = truncate(content, MAX_CONTENT_CHARS);
	const wrap = (body: string) =>
		`<span font_family="${FONT_FAMILY}" size="15pt" foreground="${CONTENT_COLOR}">${body}${edited}</span>`;

	try {
		return await renderMarkup(wrap(discordMarkdownToPango(trimmed)), width);
	} catch {
		// unbalanced markdown makes pango unhappy, plain text never does
		return renderMarkup(
			wrap(escapeMarkup(trimmed.replace(/[\ue000\ue001]/g, ""))),
			width,
		);
	}
}

type RenderedText = { buffer: Buffer; height: number };

async function renderMarkup(
	markup: string,
	width: number,
): Promise<RenderedText> {
	const { data, info } = await sharp({
		text: {
			text: markup,
			width,
			dpi: 72,
			rgba: true,
			wrap: "word-char",
			spacing: 5,
		},
	})
		.png()
		.toBuffer({ resolveWithObject: true });

	return { buffer: data, height: info.height };
}

async function renderAvatar(avatar: Buffer | null): Promise<Buffer> {
	const mask = Buffer.from(
		`<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}"><circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="#fff"/></svg>`,
	);

	const base = avatar
		? sharp(avatar, { animated: false }).resize(AVATAR_SIZE, AVATAR_SIZE, {
				fit: "cover",
			})
		: sharp({
				create: {
					width: AVATAR_SIZE,
					height: AVATAR_SIZE,
					channels: 4,
					background: "#5865f2",
				},
			});

	return base
		.ensureAlpha()
		.composite([{ input: mask, blend: "dest-in" }])
		.png()
		.toBuffer();
}

async function renderMedia(media: Buffer): Promise<RenderedText> {
	const resized = await sharp(media, { animated: false })
		.resize(MEDIA_MAX_WIDTH, MEDIA_MAX_HEIGHT, {
			fit: "inside",
			withoutEnlargement: false,
		})
		.ensureAlpha()
		.png()
		.toBuffer({ resolveWithObject: true });

	const { width, height } = resized.info;
	const mask = Buffer.from(
		`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${MEDIA_RADIUS}" ry="${MEDIA_RADIUS}" fill="#fff"/></svg>`,
	);
	const buffer = await sharp(resized.data)
		.composite([{ input: mask, blend: "dest-in" }])
		.png()
		.toBuffer();

	return { buffer, height };
}

/**
 * Enough of Discord's markdown to look right: bold, italics, underline,
 * strikethrough, inline code, and the @mention pills that
 * {@link formatMessageContent} leaves behind as \ue000name\ue001.
 */
export function discordMarkdownToPango(text: string): string {
	return escapeMarkup(text)
		.replace(
			/`([^`\n]+)`/g,
			`<span font_family="monospace" background="${CODE_BACKGROUND}">$1</span>`,
		)
		.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
		.replace(/__(.+?)__/g, "<u>$1</u>")
		.replace(/~~(.+?)~~/g, "<s>$1</s>")
		.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
		.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<i>$2</i>")
		.replace(
			/\ue000([^\ue001]*)\ue001/g,
			`<span foreground="${MENTION_FOREGROUND}" background="${MENTION_BACKGROUND}" bgalpha="30%">$1</span>`,
		);
}

export function escapeMarkup(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function formatTimestamp(date: Date, timeZone?: string): string {
	const time = date.toLocaleTimeString("en-NZ", {
		hour: "numeric",
		minute: "2-digit",
		timeZone,
	});
	return `Today at ${time}`;
}

function normalizeNameColor(color: string | null): string {
	if (!color || !/^#[0-9a-f]{6}$/i.test(color) || color === "#000000") {
		return DEFAULT_NAME_COLOR;
	}
	return color;
}

function truncate(text: string, maxChars: number): string {
	const chars = Array.from(text);
	return chars.length > maxChars
		? `${chars.slice(0, maxChars).join("")}…`
		: text;
}
