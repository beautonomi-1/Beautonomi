import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, requireGrcPermission, successResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { grcBadRequest, grcFromDbError, grcNotFound } from "@/lib/grc/errors";
import { GRC_EVIDENCE_BUCKET, evidenceObjectPath, sha256Hex } from "@/lib/grc/evidence";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const schema = z.strictObject({
  control_id: z.string().min(1).max(40),
  title: z.string().trim().min(3).max(200),
  body_markdown: z.string().trim().min(30, "Describe what was done, when, by whom and where the record lives (at least 30 characters)").max(50_000),
  period_start: date.nullish(),
  period_end: date.nullish(),
});

/** Written attestation (e.g. "Q3 restore test done, ticket OPS-123"). Stored as a hashed markdown object like any file. */
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await requireGrcPermission("grc.evidence.submit", request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw grcBadRequest(parsed.error.issues[0]?.message ?? "Invalid input");
    const input = parsed.data;

    const { data: control, error: cErr } = await supabase.from("grc_controls").select("id").eq("id", input.control_id).maybeSingle();
    if (cErr) throw grcFromDbError(cErr);
    if (!control) throw grcNotFound("Control not found");

    const content = `# ${input.title}\n\nControl: ${input.control_id}\nRecorded by: ${user.email ?? user.id}\nRecorded at: ${new Date().toISOString()}\n\n${input.body_markdown}\n`;
    const bytes = Buffer.from(content, "utf8");
    const sha = sha256Hex(bytes);
    const path = evidenceObjectPath(input.control_id, sha);
    const { error: upErr } = await getSupabaseAdmin().storage.from(GRC_EVIDENCE_BUCKET).upload(path, bytes, { contentType: "text/markdown", upsert: false });
    if (upErr && !/exists|duplicate/i.test(upErr.message)) throw new Error(upErr.message);

    const { data, error } = await supabase
      .from("grc_evidence")
      .insert({
        control_id: input.control_id,
        storage_path: path,
        content_sha256: sha,
        status: "submitted",
        source: "manual",
        submitted_by: user.id,
        title: input.title,
        file_name: `${input.control_id}-note.md`,
        mime_type: "text/markdown",
        size_bytes: bytes.byteLength,
        period_start: input.period_start ?? null,
        period_end: input.period_end ?? null,
        metadata: { kind: "note" },
      })
      .select("id, control_id, content_sha256, created_at")
      .single();
    if (error) throw grcFromDbError(error);
    return successResponse({ item: data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
