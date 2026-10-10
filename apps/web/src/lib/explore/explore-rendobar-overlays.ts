import type { ExploreTextOverlay } from "@/lib/explore/media-types";
import { isExploreTextOverlaysEnabled } from "@/lib/explore/explore-feature-gates";

function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

/** Whole-clip overlays only (no timed drawtext chain in v1). Returns null if disabled or empty. */
export async function buildVideoDrawtextChain(
  overlays: ExploreTextOverlay[] | null | undefined,
): Promise<string | null> {
  if (!(await isExploreTextOverlaysEnabled(null))) return null;
  const whole = (overlays ?? []).filter(
    (o) => o.start_ms == null && o.end_ms == null,
  );
  if (!whole.length) return null;

  const parts: string[] = [];
  for (const layer of whole.slice(0, 8)) {
    const text = escapeDrawtext(layer.text.trim().slice(0, 80));
    if (!text) continue;
    const fs = Math.max(16, Math.round(1080 * layer.font_size));
    const xExpr = `w*${layer.x.toFixed(4)}-text_w/2`;
    const yExpr = `h*${layer.y.toFixed(4)}-text_h/2`;
    const color = layer.color.replace("#", "0x");
    parts.push(
      `drawtext=text='${text}':fontsize=${fs}:fontcolor=${color}:x=${xExpr}:y=${yExpr}:box=1:boxcolor=black@0.45:boxborderw=8`,
    );
  }
  if (!parts.length) return null;
  return parts.join(",");
}

export function combineScaleAndDrawtext(scaleFilter: string, drawtext: string | null): string {
  if (!drawtext) return scaleFilter;
  return `${scaleFilter},${drawtext}`;
}

/** Poster -ss seconds from first overlay start_ms or 0.5 */
export function posterSeekSeconds(overlays: ExploreTextOverlay[] | null | undefined): number {
  const starts = (overlays ?? [])
    .map((o) => o.start_ms)
    .filter((ms): ms is number => ms != null && ms >= 0);
  if (!starts.length) return 0.5;
  return Math.max(0.5, Math.min(starts[0]! / 1000, 30));
}
