import { describe, expect, it } from "vitest";
import { buildTextOverlaySvg } from "../brand-display-image";
import { exploreVideoDrawtextFontPx } from "../explore-rendobar-overlays";
import {
  EXPLORE_PHOTO_WATERMARK_BAND_PX,
  clampOverlayFontSizeNorm,
  explorePhotoBurnFrame,
  exploreVideoBurnFrame,
  overlayFontNormBounds,
  photoOverlayFontPx,
  photoOverlayFrameBox,
  photoOverlayMaxCenterY,
  videoOverlayFontPx,
  videoOverlayStageOrigin,
} from "../../../../../provider/src/lib/explore-overlay-preview";

function svgRect(svg: string) {
  const m = svg.match(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/);
  const f = svg.match(/font-size="(\d+)"/);
  if (!m || !f) throw new Error("rect/font not found");
  return { x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]), fontPx: Number(f[1]) };
}

const layer = (text: string, x: number, y: number, font_size: number) => ({
  text,
  x,
  y,
  font_size,
  color: "#FFFFFF",
  align: "center" as const,
});

describe("photo preview matches buildTextOverlaySvg", () => {
  const cases: Array<[string, number, number, number, number, number]> = [
    ["Hello", 0.5, 0.5, 0.06, 900, 1200],
    ["Fresh fade by Thabo", 0.3, 0.2, 0.1, 1200, 900],
    ["x", 0.02, 0.98, 0.02, 675, 1200],
    ["A very long caption that runs past the frame edge for sure", 0.9, 0.5, 0.2, 800, 1200],
  ];
  it.each(cases)("%s at (%d,%d) font %d on %dx%d", (text, x, y, fs, w, h) => {
    const burn = svgRect(buildTextOverlaySvg(layer(text, x, y, fs), w, h)!);
    const preview = photoOverlayFrameBox(x, y, w, h, fs, text);
    expect(preview.x).toBeCloseTo(burn.x, 6);
    expect(preview.y).toBeCloseTo(burn.y, 6);
    expect(preview.width).toBeCloseTo(burn.width, 6);
    expect(preview.height).toBeCloseTo(burn.height, 6);
    expect(preview.fontPx).toBe(burn.fontPx);
  });

  it("uses the 12–72 clamp", () => {
    expect(photoOverlayFontPx(900, 0.01)).toBe(12);
    expect(photoOverlayFontPx(1200, 0.2)).toBe(72);
  });
});

describe("photo burn frame", () => {
  it("matches Sharp fit inside 1200 without enlargement", () => {
    expect(explorePhotoBurnFrame(3024, 4032)).toEqual({ width: 900, height: 1200 });
    expect(explorePhotoBurnFrame(4032, 3024)).toEqual({ width: 1200, height: 900 });
    expect(explorePhotoBurnFrame(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("keeps the decoded upright aspect (no EXIF swap)", () => {
    const portrait = explorePhotoBurnFrame(3024, 4032);
    expect(portrait.height).toBeGreaterThan(portrait.width);
  });

  it("keeps the label bottom above the watermark band", () => {
    const frameH = 1200;
    const box = photoOverlayFrameBox(0.5, 0.5, 900, frameH, 0.06, "Hi");
    const maxY = photoOverlayMaxCenterY(box.height, frameH);
    expect(maxY * frameH + box.height / 2).toBeLessThanOrEqual(frameH - EXPLORE_PHOTO_WATERMARK_BAND_PX + 1e-9);
  });
});

describe("photo pinch bounds", () => {
  it("cannot request a size the burn clamp would shrink or grow", () => {
    for (const w of [400, 675, 900, 1200]) {
      const { min, max } = overlayFontNormBounds("image", w);
      expect(photoOverlayFontPx(w, max)).toBeCloseTo(Math.min(72, w * max), 0);
      expect(w * max).toBeLessThanOrEqual(72 + 1e-9);
      expect(w * min).toBeGreaterThanOrEqual(12 - 1e-9);
      expect(clampOverlayFontSizeNorm(1, "image", w)).toBe(max);
      expect(clampOverlayFontSizeNorm(0, "image", w)).toBe(min);
    }
  });
});

describe("video preview matches drawtext", () => {
  it("font px equals buildVideoDrawtextChain fontsize", () => {
    for (const fs of [0.02, 0.06, 0.1, 0.2]) {
      expect(videoOverlayFontPx(fs)).toBe(exploreVideoDrawtextFontPx(fs));
    }
  });

  it("burn frame follows the encode scale filter (portrait is 1080 tall, not wide)", () => {
    expect(exploreVideoBurnFrame(1080, 1920)).toEqual({ width: 608, height: 1080 });
    expect(exploreVideoBurnFrame(1920, 1080)).toEqual({ width: 1080, height: 608 });
    expect(exploreVideoBurnFrame(720, 1280)).toEqual({ width: 608, height: 1080 });
    expect(exploreVideoBurnFrame(480, 854)).toEqual({ width: 480, height: 854 });
  });

  it("center at (0.5, 0.5) uses half the measured label", () => {
    const { left, top } = videoOverlayStageOrigin(0.5, 0.5, 300, 533, 120, 36);
    expect(left).toBe(150 - 60);
    expect(top).toBe(266.5 - 18);
  });

  it("pinch stays inside schema 0.02–0.2 and above the 16px floor", () => {
    const { min, max } = overlayFontNormBounds("video", 608);
    expect(max).toBe(0.2);
    expect(Math.round(1080 * min)).toBeGreaterThanOrEqual(16);
    expect(min).toBeGreaterThanOrEqual(0.02);
  });
});
