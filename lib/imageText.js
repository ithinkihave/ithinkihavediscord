import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

export function normalizeBox(box) {
  if (!box) {
    throw new Error("missing box definition");
  }

  if ("x1" in box || "y1" in box || "x2" in box || "y2" in box) {
    const x1 = Math.min(Number(box.x1 ?? 0), Number(box.x2 ?? 0));
    const y1 = Math.min(Number(box.y1 ?? 0), Number(box.y2 ?? 0));
    const x2 = Math.max(Number(box.x1 ?? 0), Number(box.x2 ?? 0));
    const y2 = Math.max(Number(box.y1 ?? 0), Number(box.y2 ?? 0));

    return {
      x: Math.round(x1),
      y: Math.round(y1),
      width: Math.max(0, Math.round(x2 - x1)),
      height: Math.max(0, Math.round(y2 - y1)),
    };
  }

  return {
    x: Math.round(Number(box.x ?? 0)),
    y: Math.round(Number(box.y ?? 0)),
    width: Math.max(0, Math.round(Number(box.width ?? 0))),
    height: Math.max(0, Math.round(Number(box.height ?? 0))),
  };
}

export function estimateTextWidth(text, fontSize) {
  return Array.from(String(text ?? "")).reduce((width, character) => {
    width += estimateCharacterWidth(character, fontSize);
    return width;
  }, 0);
}

export function wrapText(text, maxWidth, fontSize) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  const paragraphs = normalized.split("\n");
  const wrappedLines = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      wrappedLines.push("");
      continue;
    }

    const tokens = paragraph.includes(" ") ? paragraph.trim().split(/\s+/) : Array.from(paragraph);
    let currentLine = "";

    for (const token of tokens) {
      const pieces = estimateTextWidth(token, fontSize) > maxWidth
        ? splitToken(token, maxWidth, fontSize)
        : [token];

      for (let index = 0; index < pieces.length; index += 1) {
        const piece = pieces[index];
        const isContinuation = index > 0;
        if (!currentLine) {
          currentLine = piece;
          continue;
        }

        const separator = paragraph.includes(" ") && !isContinuation ? " " : "";
        const candidateLine = `${currentLine}${separator}${piece}`;

        if (estimateTextWidth(candidateLine, fontSize) <= maxWidth) {
          currentLine = candidateLine;
        } else {
          wrappedLines.push(currentLine);
          currentLine = piece;
        }
      }
    }

    if (currentLine) {
      wrappedLines.push(currentLine);
    }
  }

  return wrappedLines.length > 0 ? wrappedLines : [""];
}

export function fitTextToBox(text, box, options = {}) {
  const normalizedBox = normalizeBox(box);
  const padding = Number(options.padding ?? 8);
  const minFontSize = Number(options.minFontSize ?? 12);
  const maxFontSize = Number(options.maxFontSize ?? 48);
  const lineGap = Number(options.lineGap ?? 1.08);
  const horizontalSquish = Number(options.horizontalSquish ?? 1);

  const innerWidth = Math.max(0, normalizedBox.width - padding * 2);
  const innerHeight = Math.max(0, normalizedBox.height - padding * 2);

  let bestLayout = null;
  let low = minFontSize;
  let high = maxFontSize;

  while (low <= high) {
    const fontSize = Math.floor((low + high) / 2);
    const layout = buildLayoutForFontSize(text, innerWidth, innerHeight, fontSize, {
      lineGap,
      horizontalSquish,
    });

    if (layout.fits) {
      bestLayout = layout;
      low = fontSize + 1;
    } else {
      high = fontSize - 1;
    }
  }

  if (!bestLayout) {
    bestLayout = buildLayoutForFontSize(text, innerWidth, innerHeight, minFontSize, {
      lineGap,
      horizontalSquish,
    });
  }

  return {
    box: normalizedBox,
    padding,
    minFontSize,
    maxFontSize,
    lineGap,
    horizontalSquish,
    ...bestLayout,
  };
}

export async function loadImageBuffer(source) {
  if (!source) {
    throw new Error("missing image source");
  }

  if (Buffer.isBuffer(source)) {
    return source;
  }

  if (source instanceof Uint8Array) {
    return Buffer.from(source);
  }

  if (typeof source === "string" && /^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`failed to fetch image source: ${response.status} ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  if (typeof source === "string" && existsSync(source)) {
    return readFile(source);
  }

  throw new Error(`unsupported image source: ${String(source)}`);
}

export async function renderTextOnImage({ source, text, box, options = {} }) {
  const imageBuffer = await loadImageBuffer(source);
  const baseImage = sharp(imageBuffer);
  const metadata = await baseImage.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("unable to read base image dimensions");
  }

  const layout = fitTextToBox(text, box, options);
  const svgOverlay = buildOverlaySvg(metadata.width, metadata.height, layout, options);

  const rendered = await baseImage
    .composite([{ input: Buffer.from(svgOverlay) }])
    .png()
    .toBuffer();

  return {
    buffer: rendered,
    layout,
  };
}

export async function renderSingleLineTextOnImage({ source, text, box, options = {} }) {
  const imageBuffer = await loadImageBuffer(source);
  const baseImage = sharp(imageBuffer);
  const metadata = await baseImage.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("unable to read base image dimensions");
  }

  const normalizedBox = normalizeBox(box);
  const paddingY = Number(options.paddingY ?? 0);
  const minFontSize = Number(options.minFontSize ?? 10);
  const maxFontSize = Number(options.maxFontSize ?? 96);
  const horizontalSquish = Number(options.horizontalSquish ?? 1);
  const fill = options.fill ?? "#111111";
  const stroke = options.stroke ?? "#ffffff";
  const strokeWidthRatio = Number(options.strokeWidthRatio ?? 0.08);
  const fontFamily = options.fontFamily ?? "Arial, Helvetica, DejaVu Sans, sans-serif";
  const fontWeight = options.fontWeight ?? 800;
  const textAnchor = options.textAnchor ?? "start";

  const targetHeight = Math.max(1, normalizedBox.height - paddingY * 2);
  const clampedFontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(targetHeight)));
  const strokeWidth = Math.max(1, Math.round(clampedFontSize * strokeWidthRatio));
  const squishX = Number(horizontalSquish);

  const anchorX = textAnchor === "middle"
    ? normalizedBox.x + normalizedBox.width / 2
    : normalizedBox.x;
  const anchorY = normalizedBox.y + paddingY;
  const escapedText = escapeXml(String(text ?? ""));
  const hasSquish = Math.abs(squishX - 1) > 0.0001;
  const transform = hasSquish
    ? `transform="translate(${anchorX} 0) scale(${squishX} 1) translate(${-anchorX} 0)"`
    : "";

  const svgOverlay = `
    <svg width="${metadata.width}" height="${metadata.height}" viewBox="0 0 ${metadata.width} ${metadata.height}" xmlns="http://www.w3.org/2000/svg">
      <g ${transform}>
        <text
          x="${anchorX}"
          y="${anchorY}"
          fill="${fill}"
          stroke="${stroke}"
          stroke-width="${strokeWidth}"
          paint-order="stroke fill"
          font-family="${fontFamily}"
          font-size="${clampedFontSize}"
          font-weight="${fontWeight}"
          text-anchor="${textAnchor}"
          dominant-baseline="hanging"
        >${escapedText}</text>
      </g>
    </svg>
  `;

  const rendered = await baseImage
    .composite([{ input: Buffer.from(svgOverlay) }])
    .png()
    .toBuffer();

  return {
    buffer: rendered,
    layout: {
      box: normalizedBox,
      fontSize: clampedFontSize,
      horizontalSquish: squishX,
      textAnchor,
    },
  };
}

export async function addFakeCompressionArtifacts(buffer, options = {}) {
  const quality = Number(options.quality ?? 38);
  const chromaSubsampling = options.chromaSubsampling ?? "4:2:0";

  // Re-encode through a lower-quality JPEG pass to introduce subtle blocking/ringing artifacts.
  const jpegBuffer = await sharp(buffer)
    .jpeg({
      quality,
      chromaSubsampling,
      mozjpeg: true,
    })
    .toBuffer();

  return sharp(jpegBuffer).png().toBuffer();
}

export async function toSingleFrameGif(buffer) {
  return sharp(buffer)
    .gif({
      reuse: true,
      effort: 7,
    })
    .toBuffer();
}

function buildOverlaySvg(width, height, layout, options) {
  const fill = options.fill ?? "#111111";
  const stroke = options.stroke ?? "#ffffff";
  const strokeWidthRatio = Number(options.strokeWidthRatio ?? 0.08);
  const fontFamily = options.fontFamily ?? "Arial, Helvetica, DejaVu Sans, sans-serif";
  const fontWeight = options.fontWeight ?? 800;
  const textAnchor = options.textAnchor ?? "middle";

  const centerX = layout.box.x + layout.box.width / 2;
  const topY = layout.box.y + layout.padding + Math.max(0, (layout.innerHeight - layout.blockHeight) / 2);
  const lineHeight = Math.max(1, Math.round(layout.fontSize * layout.lineGap));
  const strokeWidth = Math.max(1, Math.round(layout.fontSize * strokeWidthRatio));
  const squishX = Number(layout.horizontalSquish ?? 1);
  const hasSquish = Math.abs(squishX - 1) > 0.0001;

  const lines = layout.lines.length > 0 ? layout.lines : [""];
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;
      return `<tspan x="${centerX}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  const transform = hasSquish
    ? `transform="translate(${centerX} 0) scale(${squishX} 1) translate(${-centerX} 0)"`
    : "";

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <g ${transform}>
        <text
          x="${centerX}"
          y="${topY}"
          fill="${fill}"
          stroke="${stroke}"
          stroke-width="${strokeWidth}"
          paint-order="stroke fill"
          font-family="${fontFamily}"
          font-size="${layout.fontSize}"
          font-weight="${fontWeight}"
          text-anchor="${textAnchor}"
          dominant-baseline="hanging"
        >${tspans}</text>
      </g>
    </svg>
  `;
}

function buildLayoutForFontSize(text, innerWidth, innerHeight, fontSize, options) {
  const horizontalSquish = Number(options.horizontalSquish ?? 1);
  const lineGap = Number(options.lineGap ?? 1.08);
  const wrappedLines = wrapText(text, innerWidth / horizontalSquish, fontSize);
  const lineHeight = Math.max(1, Math.round(fontSize * lineGap));
  const blockHeight = wrappedLines.length * lineHeight;
  const blockWidth = wrappedLines.reduce((maxWidth, line) => {
    return Math.max(maxWidth, estimateTextWidth(line, fontSize) * horizontalSquish);
  }, 0);

  return {
    fontSize,
    lineHeight,
    lines: wrappedLines,
    blockWidth,
    blockHeight,
    innerWidth,
    innerHeight,
    fits: blockWidth <= innerWidth && blockHeight <= innerHeight,
  };
}

function splitToken(token, maxWidth, fontSize) {
  const pieces = [];
  let current = "";

  for (const character of Array.from(token)) {
    const candidate = `${current}${character}`;

    if (!current || estimateTextWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }

    pieces.push(current);
    current = character;
  }

  if (current) {
    pieces.push(current);
  }

  return pieces;
}

function estimateCharacterWidth(character, fontSize) {
  if (/\s/u.test(character)) {
    return fontSize * 0.33;
  }

  if (/\p{Extended_Pictographic}/u.test(character)) {
    return fontSize * 1.0;
  }

  if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)) {
    return fontSize * 1.0;
  }

  if (/[MW@#%&]/.test(character)) {
    return fontSize * 0.82;
  }

  if (/[A-Z]/.test(character)) {
    return fontSize * 0.68;
  }

  if (/[0-9]/.test(character)) {
    return fontSize * 0.58;
  }

  if (/[.,!?;:'"`]/.test(character)) {
    return fontSize * 0.3;
  }

  if (/[-–—]/.test(character)) {
    return fontSize * 0.38;
  }

  return fontSize * 0.55;
}

function escapeXml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}