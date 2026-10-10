import { z } from "zod";

export const MAX_TEXT_OVERLAYS_PER_SLIDE = 8;
export const MAX_OVERLAY_TEXT_LENGTH = 80;

export const exploreTextOverlaySchema = z.object({
  text: z.string().min(1).max(MAX_OVERLAY_TEXT_LENGTH),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  font_size: z.number().min(0.02).max(0.2),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  align: z.enum(["left", "center", "right"]).optional(),
  start_ms: z.number().int().min(0).optional(),
  end_ms: z.number().int().min(0).optional(),
});

export const exploreTextOverlaysSchema = z
  .array(exploreTextOverlaySchema)
  .max(MAX_TEXT_OVERLAYS_PER_SLIDE)
  .optional()
  .nullable();

export type ExploreTextOverlayInput = z.infer<typeof exploreTextOverlaySchema>;

export function sanitizeExploreTextOverlays(
  raw: unknown,
): z.infer<typeof exploreTextOverlaysSchema> {
  const parsed = exploreTextOverlaysSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data ?? null;
}
