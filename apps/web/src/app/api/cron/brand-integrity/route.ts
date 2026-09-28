import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createHash } from "crypto";

function chainHash(prev: string | null, versionHash: string): string {
  return createHash("sha256").update(`${prev ?? ""}:${versionHash}`).digest("hex");
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: campaigns } = await supabase.from("brand_campaigns").select("id, tenant_id");

  let broken = 0;
  for (const c of campaigns ?? []) {
    const { data: rows } = await supabase
      .from("brand_approvals")
      .select("version_hash, prev_hash, created_at")
      .eq("subject_id", c.id)
      .order("created_at", { ascending: true });
    let expected: string | null = null;
    for (const r of rows ?? []) {
      const next = chainHash(expected, r.version_hash);
      if (r.prev_hash && r.prev_hash !== expected) broken++;
      expected = next;
    }
  }

  if (broken > 0) {
    await supabase.from("brand_activity").insert({
      tenant_id: null,
      kind: "integrity_alert",
      body: `Brand approval hash chain verification found ${broken} issue(s)`,
      meta: { broken },
    });
  }

  return Response.json({ ok: true, broken });
}
