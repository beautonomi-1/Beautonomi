import { grcGetHandler } from "@/lib/grc/http";
import { grcFromDbError, grcNotFound } from "@/lib/grc/errors";

/**
 * Statement of Applicability. `?version=<id>` for a specific version; otherwise the open draft if
 * there is one, else the published version. Edits and publishing go through /actions (soa.*).
 */
export const GET = grcGetHandler("grc.controls.view", async ({ supabase }, request) => {
  const { data: versions, error: vErr } = await supabase
    .from("grc_soa_versions")
    .select("id, version_label, status, created_by, created_at, approved_by, approved_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (vErr) throw grcFromDbError(vErr);

  const wanted = new URL(request.url).searchParams.get("version");
  const list = versions ?? [];
  const version = wanted
    ? list.find((v) => v.id === wanted)
    : list.find((v) => v.status === "draft") ?? list.find((v) => v.status === "published");
  if (wanted && !version) throw grcNotFound("SoA version not found");
  if (!version) return { versions: list, version: null, entries: [] };

  const { data: entries, error } = await supabase
    .from("grc_soa_entries")
    .select("id, requirement_id, applicable, justification, control_id, grc_requirements(ref_code, title, sort_order), grc_controls(title, status)")
    .eq("soa_version_id", version.id)
    .limit(500);
  if (error) throw grcFromDbError(error);
  const sorted = (entries ?? []).sort((a, b) => {
    const ra = a.grc_requirements as unknown as { sort_order?: number } | null;
    const rb = b.grc_requirements as unknown as { sort_order?: number } | null;
    return (ra?.sort_order ?? 0) - (rb?.sort_order ?? 0) || String(a.requirement_id).localeCompare(String(b.requirement_id));
  });
  return { versions: list, version, entries: sorted };
});
