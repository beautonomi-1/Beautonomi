import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, requireGrcPermission, successResponse } from "@/lib/supabase/api-helpers";
import { writeGrcActivity } from "@/lib/grc/activity";
import { grcBadRequest, grcFromDbError } from "@/lib/grc/errors";
import { parseFindings } from "@/lib/grc/findings-import";

const schema = z.strictObject({
  source: z.enum(["pentest", "vulnerability_scan", "external_audit", "internal_audit", "bug_bounty", "self_identified"]),
  format: z.enum(["csv", "json"]),
  content: z.string().min(1).max(3_500_000, "File too large; split it into smaller files"),
  control_id: z.string().min(1).max(40).nullish(),
  dry_run: z.boolean().default(false),
});

/**
 * Import pentest / scanner findings. Re-importing the same report is safe: rows are matched on
 * (source, external_ref) and existing findings are left untouched, so triage work is never overwritten.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await requireGrcPermission("grc.findings.edit", request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw grcBadRequest(parsed.error.issues[0]?.message ?? "Invalid input");
    const { source, format, content, control_id, dry_run } = parsed.data;

    const { rows, errors } = parseFindings(format, content);
    if (rows.length > 2000) throw grcBadRequest("At most 2,000 findings per import");

    const existing = new Set<string>();
    const refs = rows.map((r) => r.external_ref);
    for (let i = 0; i < refs.length; i += 200) {
      const { data, error } = await supabase.from("grc_findings").select("external_ref").eq("source", source).in("external_ref", refs.slice(i, i + 200));
      if (error) throw grcFromDbError(error);
      for (const r of data ?? []) existing.add(r.external_ref as string);
    }
    const fresh = rows.filter((r) => !existing.has(r.external_ref));

    if (dry_run || fresh.length === 0) {
      return successResponse({ dry_run, to_create: fresh.length, already_imported: existing.size, errors, preview: fresh.slice(0, 20) });
    }

    const { data: created, error } = await supabase
      .from("grc_findings")
      .insert(fresh.map((f) => ({ ...f, source, control_id: control_id ?? null, status: "open" })))
      .select("id");
    if (error) throw grcFromDbError(error);

    await writeGrcActivity({
      actor_user_id: user.id,
      action: "grc.findings.imported",
      entity_type: "grc_findings",
      metadata: { source, created: created?.length ?? 0, skipped_existing: existing.size, rejected_rows: errors.length },
    });
    return successResponse({ dry_run: false, created: created?.length ?? 0, already_imported: existing.size, errors });
  } catch (error) {
    return handleApiError(error);
  }
}
