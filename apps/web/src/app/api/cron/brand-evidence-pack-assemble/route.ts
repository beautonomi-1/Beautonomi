import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assembleBrandEvidencePack } from "@/lib/brand-marketing/evidence-pack-build";

const JOB_NAME = "brand-evidence-pack-assemble";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  return runLockedCronRoute(JOB_NAME, async () => {
    const supabase = getSupabaseAdmin();
    const { data: queued } = await supabase
      .from("brand_evidence_packs")
      .select("id")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(5);

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const row of queued ?? []) {
      try {
        await assembleBrandEvidencePack(supabase, row.id);
        results.push({ id: row.id, ok: true });
      } catch (e) {
        await supabase.from("brand_evidence_packs").update({ status: "failed" }).eq("id", row.id);
        results.push({ id: row.id, ok: false, error: e instanceof Error ? e.message : "unknown" });
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
  });
}
