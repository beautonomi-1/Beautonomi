import type { SupabaseClient } from "@supabase/supabase-js";
import { hashContent } from "./approvals";

export async function snapshotBriefVersion(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    briefId: string;
    fields: Record<string, unknown>;
    editorId: string;
  },
): Promise<{ version_number: number; content_hash: string }> {
  const { data: last } = await supabase
    .from("brand_brief_versions")
    .select("version_number, content_hash")
    .eq("brief_id", input.briefId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const content_hash = hashContent(input.fields);
  if (last?.content_hash === content_hash) {
    return { version_number: last.version_number, content_hash };
  }

  const version_number = (last?.version_number ?? 0) + 1;

  const { error } = await supabase.from("brand_brief_versions").insert({
    tenant_id: input.tenantId,
    brief_id: input.briefId,
    version_number,
    fields: input.fields,
    content_hash,
    editor_id: input.editorId,
  });
  if (error) throw error;

  return { version_number, content_hash };
}

const SNAPSHOT_KEYS = [
  "name",
  "campaign_type",
  "business_problem",
  "objective",
  "market_notes",
  "budget_envelope",
  "flight_start",
  "flight_end",
  "success_metric",
  "success_target",
  "channels_requested",
  "notes",
  "insight",
  "proposition",
  "fields",
  "pillar_id",
  "plan_id",
] as const;

export function briefRowToSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SNAPSHOT_KEYS) {
    if (row[k] !== undefined) out[k] = row[k];
  }
  const fields = row.fields;
  if (fields && typeof fields === "object" && !Array.isArray(fields)) {
    out.fields = fields;
  }
  return out;
}

function flattenBriefSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  const out = { ...snapshot };
  const fields = snapshot.fields;
  if (fields && typeof fields === "object" && !Array.isArray(fields)) {
    delete out.fields;
    for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
      out[k] = v;
    }
  }
  return out;
}

export function diffBriefFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const b = flattenBriefSnapshot(before);
  const a = flattenBriefSnapshot(after);
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) changed.push(k);
  }
  return changed;
}
