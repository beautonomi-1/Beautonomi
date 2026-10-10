import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadRendobarSecrets } from "@/lib/explore/rendobar-config";
import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";
import {
  maxDurationMsForExplore,
  startEncodeAfterProbe,
} from "@/lib/explore/enqueue-video-processing";
import { resolveVideoEncodeTrim } from "@/lib/explore/resolve-video-encode-trim";
import { processExploreDisplayJpeg } from "@/lib/explore/brand-display-image";
import { denormalizeFirstSlideFromMeta } from "@/lib/explore/media-meta";
import { deferredVideoPublishRewards } from "@/lib/explore/publish-side-effects";
import {
  parseRendobarCallbackBody,
  playbackPathFromRendobarDeliveries,
  playbackPathFromRendobarOutput,
} from "@/lib/explore/rendobar-callback-envelope";

const DELIVERY_TTL_MS = 5 * 60 * 1000;
const WEBHOOK_SOURCE = "rendobar";

function verifyRendobarSignature(
  secret: string,
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
): boolean {
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts * 1000) > DELIVERY_TTL_MS) return false;
  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const received = signature.replace(/^sha256=/i, "").trim();
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
    } catch {
      return false;
    }
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secrets = await loadRendobarSecrets();
  if (!secrets.callbackSecret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const timestamp = request.headers.get("x-rendobar-timestamp");
  const signature = request.headers.get("x-rendobar-signature");
  if (!verifyRendobarSignature(secrets.callbackSecret, rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const deliveryId =
    request.headers.get("x-rendobar-delivery") ??
    `${request.headers.get("x-rendobar-timestamp") ?? "ts"}:${createHmac("sha256", secrets.callbackSecret).update(rawBody).digest("hex").slice(0, 32)}`;

  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("postId");
  const slideIndex = Number(searchParams.get("slideIndex") ?? "0");
  const phase = searchParams.get("phase");

  const supabaseForDedup = getSupabaseAdmin();
  type LeaseRow = {
    acquired: boolean;
    already_processed: boolean;
    stale_lease_reclaimed: boolean;
    status: string;
  };
  const { data: leaseRow, error: leaseError } = await (supabaseForDedup.rpc as any)(
    "try_acquire_webhook_event_lease",
    {
      p_event_id: deliveryId,
      p_source: WEBHOOK_SOURCE,
      p_event_type: `rendobar:${phase ?? "callback"}`,
      p_payload: { length: rawBody.length, postId, phase, slideIndex },
      p_lease_seconds: 300,
    },
  );
  const lease: LeaseRow | null = Array.isArray(leaseRow)
    ? ((leaseRow[0] ?? null) as LeaseRow | null)
    : ((leaseRow as LeaseRow | null) ?? null);
  if (leaseError) {
    console.error("[rendobar/webhook] try_acquire_webhook_event_lease failed:", leaseError);
  }
  if (lease) {
    if (lease.already_processed) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    if (!lease.acquired) {
      return NextResponse.json({ ok: true, processing: true }, { status: 503 });
    }
  }

  const markWebhook = async (status: "processed" | "failed", errorMessage?: string) => {
    await supabaseForDedup
      .from("webhook_events")
      .update({
        status,
        error_message: errorMessage ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("event_id", deliveryId)
      .eq("source", WEBHOOK_SOURCE);
  };
  if (!postId || !phase) {
    await markWebhook("failed", "missing params");
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    await markWebhook("failed", "invalid json");
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { event, jobId, output: jobOutput, deliveries: jobDeliveries } = parseRendobarCallbackBody(body);

  const supabase = supabaseForDedup;
  try {
  const { data: post } = await supabase
    .from("explore_posts")
    .select("id, provider_id, media_urls, media_meta, status, duration_ms, playback_path")
    .eq("id", postId)
    .maybeSingle();

  if (!post) {
    await markWebhook("processed");
    return NextResponse.json({ ok: true });
  }

  const mediaUrls = (post.media_urls ?? []) as string[];
  const meta = [...((post.media_meta ?? []) as ExploreMediaSlideMeta[])];
  const slide = meta[slideIndex];
  if (!slide) {
    await markWebhook("processed");
    return NextResponse.json({ ok: true });
  }

  if (phase === "probe") {
    if (jobId && slide.probe_job_id && jobId !== slide.probe_job_id) {
      await markWebhook("processed");
      return NextResponse.json({ ok: true });
    }
    if (event === "job.completed") {
      const durationSec = (
        jobOutput as { data?: { summary?: { durationSec?: number | null } } } | undefined
      )?.data?.summary?.durationSec;
      const maxMs = await maxDurationMsForExplore();
      const encodeTrim = resolveVideoEncodeTrim({
        slide,
        sourceDurationSec: durationSec,
        platformMaxMs: maxMs,
      });
      const objectPath = mediaUrls[slideIndex]?.replace(/^\//, "") ?? "";
      const encodeId = await startEncodeAfterProbe({
        postId,
        slideIndex,
        objectPath,
        trimStartSec: encodeTrim.trimStartSec,
        maxOutputDurationSec: encodeTrim.outputDurationSec,
      });
      meta[slideIndex] = {
        ...slide,
        duration_ms: encodeTrim.storedDurationMs,
        ...(durationSec != null && Number.isFinite(durationSec)
          ? { source_duration_ms: Math.round(durationSec * 1000) }
          : {}),
        encode_job_id: encodeId,
        status: encodeId ? "encoding" : "failed",
        error_code: encodeId ? null : "ENCODE_START_FAILED",
      };
      const denorm = denormalizeFirstSlideFromMeta(mediaUrls, meta);
      await supabase
        .from("explore_posts")
        .update({
          media_meta: meta,
          duration_ms: slideIndex === 0 ? denorm.duration_ms : post.duration_ms,
        })
        .eq("id", postId);
    } else if (event === "job.failed") {
      meta[slideIndex] = { ...slide, status: "failed", error_code: "PROBE_FAILED" };
      await supabase.from("explore_posts").update({ media_meta: meta }).eq("id", postId);
    }
    await markWebhook("processed");
    return NextResponse.json({ ok: true });
  }

  if (phase === "encode") {
    if (jobId && slide.encode_job_id && jobId !== slide.encode_job_id) {
      await markWebhook("processed");
      return NextResponse.json({ ok: true });
    }

    if (event === "job.deliveries_settled") {
      const playbackPath =
        playbackPathFromRendobarDeliveries(jobDeliveries) ??
        playbackPathFromRendobarOutput(jobOutput);
      if (playbackPath) {
        meta[slideIndex] = {
          ...meta[slideIndex]!,
          playback_path: playbackPath,
          status: "delivered",
        };
        const denorm = denormalizeFirstSlideFromMeta(mediaUrls, meta);
        await supabase
          .from("explore_posts")
          .update({
            media_meta: meta,
            playback_path: slideIndex === 0 ? denorm.playback_path : post.playback_path,
          })
          .eq("id", postId);
      }
      await markWebhook("processed");
      return NextResponse.json({ ok: true });
    }

    if (event === "job.completed") {
      const playbackPath = playbackPathFromRendobarOutput(jobOutput);
      if (playbackPath && !meta[slideIndex]?.playback_path) {
        meta[slideIndex] = {
          ...meta[slideIndex]!,
          playback_path: playbackPath,
          status: "delivered",
        };
        const denorm = denormalizeFirstSlideFromMeta(mediaUrls, meta);
        await supabase
          .from("explore_posts")
          .update({
            media_meta: meta,
            playback_path: slideIndex === 0 ? denorm.playback_path : post.playback_path,
          })
          .eq("id", postId);
      }

      const files = (jobOutput as { files?: { path?: string; url?: string; name?: string }[] } | undefined)
        ?.files;
      const poster = files?.find(
        (f) =>
          f.path === "poster.jpg" ||
          f.path?.endsWith("/poster.jpg") ||
          f.name === "poster.jpg" ||
          f.name?.endsWith("poster.jpg"),
      );
      if (poster?.url) {
        after(async () => {
          try {
            const res = await fetch(poster.url!);
            if (!res.ok) return;
            const buf = Buffer.from(await res.arrayBuffer());
            const { data: prov } = await supabase
              .from("providers")
              .select("business_name")
              .eq("id", post.provider_id)
              .maybeSingle();
            const { buffer, width, height } = await processExploreDisplayJpeg(buf, prov?.business_name);
            const displayPath = `explore/${post.provider_id}/display-${Date.now()}.jpg`;
            await supabase.storage.from("explore-posts").upload(displayPath, buffer, {
              contentType: "image/jpeg",
              cacheControl: "31536000",
              upsert: false,
            });
            const freshMeta = [...meta];
            freshMeta[slideIndex] = {
              ...freshMeta[slideIndex]!,
              display_path: displayPath,
              width,
              height,
              status: "delivered",
            };
            const denorm = denormalizeFirstSlideFromMeta(mediaUrls, freshMeta);
            await supabase
              .from("explore_posts")
              .update({
                media_meta: freshMeta,
                display_path: denorm.display_path,
                media_width: denorm.media_width,
                media_height: denorm.media_height,
              })
              .eq("id", postId);

            const pendingGallery = Boolean(freshMeta[slideIndex]?.pending_gallery_append);
            if (pendingGallery && freshMeta[slideIndex]) {
              freshMeta[slideIndex] = {
                ...freshMeta[slideIndex]!,
                pending_gallery_append: false,
              };
              await supabase
                .from("explore_posts")
                .update({ media_meta: freshMeta })
                .eq("id", postId);
            }
            await deferredVideoPublishRewards({
              postId,
              providerId: post.provider_id as string,
              newDisplayPath: displayPath,
              alsoAddToGallery: pendingGallery,
            });
          } catch (err) {
            console.warn("[rendobar webhook] poster after():", err);
          }
        });
      }
    } else if (event === "job.failed") {
      meta[slideIndex] = { ...slide, status: "failed", error_code: "ENCODE_FAILED" };
      await supabase.from("explore_posts").update({ media_meta: meta }).eq("id", postId);
    }
  }

  await markWebhook("processed");
  return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[rendobar/webhook] handler error:", err);
    await markWebhook("failed", message);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
