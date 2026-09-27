import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, requireGrcPermission, successResponse } from "@/lib/supabase/api-helpers";
import { grcGetHandler } from "@/lib/grc/http";
import { grcBadRequest, grcFromDbError } from "@/lib/grc/errors";
import { writeGrcActivity } from "@/lib/grc/activity";

export const GET = grcGetHandler("grc.audit_packs.generate", async ({ supabase }) => {
  const { data, error } = await supabase
    .from("grc_audit_packs")
    .select("id, label, period_start, period_end, status, redact_pii, manifest_hash, part_count, error_message, requested_by, created_at, ready_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw grcFromDbError(error);
  return { items: data ?? [] };
});

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const schema = z.strictObject({
  label: z.string().trim().min(3).max(120).default("Audit pack"),
  period_start: date.optional(),
  period_end: date.optional(),
  redact_pii: z.boolean().default(true),
});

/** Queues a pack; the grc-tick cron builds it. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireGrcPermission("grc.audit_packs.generate", request);
    const parsed = schema.safeParse((await request.json().catch(() => null)) ?? {});
    if (!parsed.success) throw grcBadRequest(parsed.error.issues[0]?.message ?? "Invalid input");
    const body = parsed.data;

    const end = body.period_end ?? new Date().toISOString().slice(0, 10);
    const startDate = new Date(`${end}T00:00:00Z`);
    startDate.setUTCMonth(startDate.getUTCMonth() - 12);
    const start = body.period_start ?? startDate.toISOString().slice(0, 10);
    if (end < start) throw grcBadRequest("Period end must be on or after period start");

    const { data, error } = await ctx.supabase
      .from("grc_audit_packs")
      .insert({ label: body.label, period_start: start, period_end: end, redact_pii: body.redact_pii, status: "queued", requested_by: ctx.user.id })
      .select("*")
      .single();
    if (error) throw grcFromDbError(error);
    await writeGrcActivity({
      actor_user_id: ctx.user.id,
      action: "grc.audit_pack.queued",
      entity_type: "grc_audit_pack",
      entity_id: data.id,
      metadata: { period_start: start, period_end: end, redact_pii: body.redact_pii },
    });
    return successResponse({ item: data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
