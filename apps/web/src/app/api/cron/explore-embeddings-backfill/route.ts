import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { upsertPostEmbedding } from "@/lib/ai/embeddings";
import { resolveAiRuntime } from "@/lib/ai/resolve-runtime";

const JOB_NAME = "explore-embeddings-backfill";
export const maxDuration = 300;

const BATCH_SIZE = 25;
const MAX_BATCHES = 8;

const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
const ENVIRONMENT = ENV === "production" ? "production" : ENV === "staging" ? "staging" : "development";

/**
 * GET /api/cron/explore-embeddings-backfill
 * Idempotent batch backfill for published, visible explore posts missing embeddings.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, runJob);
}

async function runJob() {
  const runtime = await resolveAiRuntime(ENVIRONMENT, null);
  if (runtime.emergency.disableEmbeddings) {
    return NextResponse.json({ ok: true, skipped: true, reason: "embeddings_disabled" });
  }

  const supabase = getSupabaseAdmin();
  let embedded = 0;
  let skipped = 0;
  let batches = 0;

  const { data: embeddedRows } = await supabase.from("explore_post_embeddings").select("post_id");
  const embeddedIds = new Set((embeddedRows ?? []).map((r) => (r as { post_id: string }).post_id));

  for (let b = 0; b < MAX_BATCHES; b += 1) {
    const { data: posts, error } = await supabase
      .from("explore_posts")
      .select("id, caption")
      .eq("status", "published")
      .eq("is_hidden", false)
      .order("created_at", { ascending: true })
      .range(b * BATCH_SIZE * 4, b * BATCH_SIZE * 4 + BATCH_SIZE * 4 - 1);

    if (error) throw error;
    if (!posts?.length) break;

    const missing = posts.filter((p) => !embeddedIds.has(p.id)).slice(0, BATCH_SIZE);
    if (!missing.length) {
      if (posts.length < BATCH_SIZE * 4) break;
      continue;
    }

    for (const post of missing) {
      await upsertPostEmbedding(post.id, String(post.caption ?? ""), ENVIRONMENT);
      embeddedIds.add(post.id);
      embedded += 1;
    }

    skipped += posts.length - missing.length;
    batches += 1;
    if (posts.length < BATCH_SIZE * 4) break;
  }

  return NextResponse.json({ ok: true, embedded, skipped, batches, environment: ENVIRONMENT });
}
