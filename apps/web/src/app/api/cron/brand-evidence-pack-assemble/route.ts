import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assembleBrandEvidencePack } from "@/lib/brand-marketing/evidence-pack-build";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

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

  return Response.json({ ok: true, processed: results.length, results });
}
