import sharp from "sharp";
import type { ExploreTextOverlay } from "@/lib/explore/media-types";

const DISPLAY_MAX = 1200;
const JPEG_QUALITY = 80;

export async function processExploreDisplayJpeg(
  input: Buffer,
  providerName?: string | null,
  textOverlays?: ExploreTextOverlay[] | null,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  sharp.cache(false);
  const base = sharp(input, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  const resized = base.resize(DISPLAY_MAX, DISPLAY_MAX, {
    fit: "inside",
    withoutEnlargement: true,
  });

  const outMetaPre = await resized.metadata();
  const outW = outMetaPre.width ?? DISPLAY_MAX;
  const outH = outMetaPre.height ?? DISPLAY_MAX;

  const composites: { input: Buffer; left?: number; top?: number }[] = [];

  if (textOverlays?.length) {
    for (const layer of textOverlays) {
      const svg = buildTextOverlaySvg(layer, outW, outH);
      if (svg) {
        composites.push({ input: Buffer.from(svg) });
      }
    }
  }

  const w = meta.width ?? DISPLAY_MAX;
  const h = meta.height ?? DISPLAY_MAX;
  const markText = providerName?.trim()
    ? `Beautonomi · ${providerName.trim().slice(0, 40)}`
    : "Beautonomi";

  try {
    const svg = `<svg width="${outW}" height="40">
      <rect x="8" y="8" width="${Math.max(0, outW - 16)}" height="28" rx="6" fill="rgba(0,0,0,0.45)"/>
      <text x="16" y="28" font-family="Arial,sans-serif" font-size="14" fill="white">${escapeXml(markText)}</text>
    </svg>`;
    composites.push({ input: Buffer.from(svg), left: 0, top: Math.max(0, outH - 40) });
  } catch {
    // watermark optional
  }

  let pipeline = resized;
  if (composites.length) {
    pipeline = pipeline.composite(composites);
  }

  void w;
  void h;

  const buffer = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  const outMeta = await sharp(buffer).metadata();
  return {
    buffer,
    width: outMeta.width ?? DISPLAY_MAX,
    height: outMeta.height ?? DISPLAY_MAX,
  };
}

function buildTextOverlaySvg(layer: ExploreTextOverlay, width: number, height: number): string | null {
  const text = layer.text.trim().slice(0, 80);
  if (!text) return null;
  const fontPx = Math.round(Math.max(12, Math.min(width * layer.font_size, 72)));
  const x = Math.round(layer.x * width);
  const y = Math.round(layer.y * height);
  const anchor =
    layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
  const textAnchorX =
    layer.align === "center" ? x : layer.align === "right" ? x : x;
  const pad = 8;
  const estW = Math.min(width - pad * 2, Math.max(fontPx * text.length * 0.55, 40));
  const boxH = fontPx + pad * 2;
  const boxX = Math.max(0, Math.min(width - estW, x - (layer.align === "center" ? estW / 2 : layer.align === "right" ? estW : 0)));
  const boxY = Math.max(0, Math.min(height - boxH, y - boxH / 2));
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${boxX}" y="${boxY}" width="${estW}" height="${boxH}" rx="6" fill="rgba(0,0,0,0.45)"/>
    <text x="${textAnchorX}" y="${boxY + pad + fontPx * 0.85}" font-family="Arial,sans-serif" font-size="${fontPx}" fill="${escapeXml(layer.color)}" text-anchor="${anchor}">${escapeXml(text)}</text>
  </svg>`;
}

export async function generateVideoPlaceholderCard(
  providerName?: string | null,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const width = 1200;
  const height = 1500;
  const label = providerName?.trim() ? escapeXml(providerName.trim().slice(0, 48)) : "Video";
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#1a1a1a"/>
    <circle cx="600" cy="720" r="64" fill="rgba(255,255,255,0.85)"/>
    <polygon points="580,680 580,760 660,720" fill="#1a1a1a"/>
    <text x="600" y="900" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" fill="#ffffff">${label}</text>
    <text x="600" y="950" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#aaaaaa">Beautonomi</text>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: JPEG_QUALITY }).toBuffer();
  return { buffer, width, height };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
