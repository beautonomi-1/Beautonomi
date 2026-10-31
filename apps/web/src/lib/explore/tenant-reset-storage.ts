import type { SupabaseClient } from "@supabase/supabase-js";
import { BRAND_ASSETS_BUCKET } from "@/lib/brand-marketing/assets";
import {
  collectExplorePostStoragePaths,
  collectExploreSoundStoragePath,
} from "@/lib/explore/storage-paths";
import {
  MESSAGE_ATTACHMENTS_BUCKET,
  collectStoragePathsFromAttachmentsJson,
} from "@/lib/messaging/message-attachments";

const EXPLORE_POSTS_BUCKET = "explore-posts";
const PROVIDER_GALLERY_BUCKET = "provider-gallery";
const MERCHANT_DOCS_BUCKET = "merchant-onboarding-documents";
const BOOKING_DOCS_BUCKET = "booking-documents";
const CUSTOM_REQUEST_BUCKET = "custom-request-attachments";

const CHUNK = 100;

export type TenantResetStorageCounts = {
  postPaths: number;
  soundPaths: number;
  messageAttachmentPaths: number;
  brandAssetPaths: number;
  merchantDocPaths: number;
  bookingDocPaths: number;
  customRequestPaths: number;
  reviewImagePaths: number;
};

type BucketPaths = Record<string, Set<string>>;

function supabasePublicMarker(bucket: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  if (!base) return null;
  return `${base}/storage/v1/object/public/${bucket}/`;
}

function extractPublicBucketPath(bucket: string, publicUrl: string): string | null {
  if (!publicUrl?.trim()) return null;
  if (!publicUrl.startsWith("http://") && !publicUrl.startsWith("https://")) {
    const p = publicUrl.split("?")[0]?.trim().replace(/^\//, "") ?? "";
    return p && !p.includes("..") ? p : null;
  }
  const marker = supabasePublicMarker(bucket);
  if (!marker) return null;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  let path = publicUrl.slice(idx + marker.length);
  const q = path.indexOf("?");
  if (q !== -1) path = path.slice(0, q);
  path = path.replace(/^\//, "");
  return path && !path.includes("..") ? path : null;
}

function addUrlToBucket(set: Set<string>, bucket: string, url: unknown) {
  if (typeof url !== "string") return;
  const p = extractPublicBucketPath(bucket, url);
  if (p) set.add(p);
}

function addProjectMediaUrls(
  buckets: BucketPaths,
  reviewImageSet: Set<string>,
  urls: unknown,
) {
  if (!Array.isArray(urls)) return;
  for (const u of urls) {
    if (typeof u !== "string") continue;
    for (const bucket of [
      EXPLORE_POSTS_BUCKET,
      PROVIDER_GALLERY_BUCKET,
      BOOKING_DOCS_BUCKET,
      CUSTOM_REQUEST_BUCKET,
      BRAND_ASSETS_BUCKET,
    ]) {
      const p = extractPublicBucketPath(bucket, u);
      if (p) {
        buckets[bucket]!.add(p);
        if (bucket !== EXPLORE_POSTS_BUCKET) reviewImageSet.add(p);
      }
    }
  }
}

function walkConsentUrls(formResponses: unknown, into: Set<string>) {
  if (!formResponses || typeof formResponses !== "object") return;
  for (const value of Object.values(formResponses as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    addUrlToBucket(into, BOOKING_DOCS_BUCKET, row._consent_document_url);
  }
}

/** Collect storage object paths while tenant rows still exist (no deletes). */
export async function collectTenantResetStoragePaths(
  admin: SupabaseClient,
  tenantId: string,
): Promise<{ buckets: BucketPaths; counts: TenantResetStorageCounts }> {
  const buckets: BucketPaths = {
    [EXPLORE_POSTS_BUCKET]: new Set(),
    [PROVIDER_GALLERY_BUCKET]: new Set(),
    [MESSAGE_ATTACHMENTS_BUCKET]: new Set(),
    [BRAND_ASSETS_BUCKET]: new Set(),
    [MERCHANT_DOCS_BUCKET]: new Set(),
    [BOOKING_DOCS_BUCKET]: new Set(),
    [CUSTOM_REQUEST_BUCKET]: new Set(),
  };

  const { data: providers } = await admin.from("providers").select("id").eq("tenant_id", tenantId);
  const providerIds = (providers ?? []).map((p) => (p as { id: string }).id);
  if (!providerIds.length) {
    return {
      buckets,
      counts: {
        postPaths: 0,
        soundPaths: 0,
        messageAttachmentPaths: 0,
        brandAssetPaths: 0,
        merchantDocPaths: 0,
        bookingDocPaths: 0,
        customRequestPaths: 0,
        reviewImagePaths: 0,
      },
    };
  }

  const { data: posts } = await admin
    .from("explore_posts")
    .select("media_urls, display_path, playback_path, media_meta")
    .in("provider_id", providerIds);
  for (const row of posts ?? []) {
    for (const p of collectExplorePostStoragePaths(row as Parameters<typeof collectExplorePostStoragePaths>[0])) {
      buckets[EXPLORE_POSTS_BUCKET]!.add(p);
    }
  }

  const { data: sounds } = await admin
    .from("explore_sounds")
    .select("id, storage_path")
    .eq("owner_type", "provider")
    .in("provider_id", providerIds);
  const soundRows = (sounds ?? []) as { id: string; storage_path: string | null }[];
  if (soundRows.length > 0) {
    const soundIds = soundRows.map((s) => s.id);
    const { data: foreignPosts } = await admin
      .from("explore_posts")
      .select("sound_id, provider_id")
      .in("sound_id", soundIds);
    const blockedSoundIds = new Set<string>();
    for (const row of foreignPosts ?? []) {
      const r = row as { sound_id: string | null; provider_id: string | null };
      if (!r.sound_id) continue;
      if (!r.provider_id || !providerIds.includes(r.provider_id)) {
        blockedSoundIds.add(r.sound_id);
      }
    }
    for (const s of soundRows) {
      if (blockedSoundIds.has(s.id)) continue;
      const p = collectExploreSoundStoragePath(s.storage_path);
      if (p) buckets[EXPLORE_POSTS_BUCKET]!.add(p);
    }
  }

  const { data: convs } = await admin.from("conversations").select("id").in("provider_id", providerIds);
  const conversationIds = (convs ?? []).map((c) => (c as { id: string }).id);
  if (conversationIds.length > 0) {
    const { data: msgs } = await admin.from("messages").select("attachments").in("conversation_id", conversationIds);
    for (const m of msgs ?? []) {
      for (const p of collectStoragePathsFromAttachmentsJson((m as { attachments?: unknown }).attachments)) {
        buckets[MESSAGE_ATTACHMENTS_BUCKET]!.add(p);
      }
    }
  }

  const { data: brandVersions } = await admin
    .from("brand_asset_versions")
    .select("storage_path")
    .eq("tenant_id", tenantId);
  for (const v of brandVersions ?? []) {
    const path = (v as { storage_path?: string | null }).storage_path?.trim();
    if (path) buckets[BRAND_ASSETS_BUCKET]!.add(path.replace(/^\//, ""));
  }
  const { data: evidencePacks } = await admin
    .from("brand_evidence_packs")
    .select("storage_path")
    .eq("tenant_id", tenantId);
  for (const pack of evidencePacks ?? []) {
    const path = (pack as { storage_path?: string | null }).storage_path?.trim();
    if (path) buckets[BRAND_ASSETS_BUCKET]!.add(path.replace(/^\//, ""));
  }

  const { data: merchantApps } = await admin
    .from("terminal_merchant_applications")
    .select("id")
    .eq("tenant_id", tenantId);
  const appIds = (merchantApps ?? []).map((a) => (a as { id: string }).id);
  if (appIds.length > 0) {
    const { data: docs } = await admin
      .from("terminal_merchant_application_documents")
      .select("storage_path")
      .in("application_id", appIds);
    for (const d of docs ?? []) {
      const path = (d as { storage_path?: string | null }).storage_path?.trim();
      if (path) buckets[MERCHANT_DOCS_BUCKET]!.add(path.replace(/^\//, ""));
    }
  }

  const { data: bookings } = await admin
    .from("bookings")
    .select("provider_form_responses")
    .eq("tenant_id", tenantId);
  for (const b of bookings ?? []) {
    walkConsentUrls((b as { provider_form_responses?: unknown }).provider_form_responses, buckets[BOOKING_DOCS_BUCKET]!);
  }

  const { data: customRequests } = await admin.from("custom_requests").select("id").in("provider_id", providerIds);
  const requestIds = (customRequests ?? []).map((r) => (r as { id: string }).id);
  if (requestIds.length > 0) {
    const { data: attachments } = await admin
      .from("custom_request_attachments")
      .select("url")
      .in("request_id", requestIds);
    for (const a of attachments ?? []) {
      addUrlToBucket(buckets[CUSTOM_REQUEST_BUCKET]!, CUSTOM_REQUEST_BUCKET, (a as { url?: string }).url);
    }
  }

  const reviewImageSet = new Set<string>();
  const { data: reviews } = await admin.from("reviews").select("photos").in("provider_id", providerIds);
  for (const r of reviews ?? []) {
    addProjectMediaUrls(buckets, reviewImageSet, (r as { photos?: unknown }).photos);
  }

  const { data: orders } = await admin.from("product_orders").select("id").eq("tenant_id", tenantId);
  const orderIds = (orders ?? []).map((o) => (o as { id: string }).id);
  if (orderIds.length > 0) {
    const { data: productReviews } = await admin
      .from("product_reviews")
      .select("image_urls")
      .in("order_id", orderIds);
    for (const pr of productReviews ?? []) {
      addProjectMediaUrls(buckets, reviewImageSet, (pr as { image_urls?: unknown }).image_urls);
    }
    const { data: returns } = await admin
      .from("product_return_requests")
      .select("image_urls")
      .in("order_id", orderIds);
    for (const rr of returns ?? []) {
      addProjectMediaUrls(buckets, reviewImageSet, (rr as { image_urls?: unknown }).image_urls);
    }
  }

  const counts: TenantResetStorageCounts = {
    postPaths: buckets[EXPLORE_POSTS_BUCKET]!.size,
    soundPaths: soundRows.filter((s) => {
      const p = collectExploreSoundStoragePath(s.storage_path);
      return p && buckets[EXPLORE_POSTS_BUCKET]!.has(p);
    }).length,
    messageAttachmentPaths: buckets[MESSAGE_ATTACHMENTS_BUCKET]!.size,
    brandAssetPaths: buckets[BRAND_ASSETS_BUCKET]!.size,
    merchantDocPaths: buckets[MERCHANT_DOCS_BUCKET]!.size,
    bookingDocPaths: buckets[BOOKING_DOCS_BUCKET]!.size,
    customRequestPaths: buckets[CUSTOM_REQUEST_BUCKET]!.size,
    reviewImagePaths: reviewImageSet.size,
  };

  return { buckets, counts };
}

async function removeBucketPaths(
  storage: SupabaseClient["storage"],
  bucket: string,
  paths: Set<string>,
): Promise<{ removed: number; error: string | null }> {
  const unique = [...paths].filter(Boolean);
  if (!unique.length) return { removed: 0, error: null };
  let removed = 0;
  let firstError: string | null = null;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const batch = unique.slice(i, i + CHUNK);
    const { error } = await storage.from(bucket).remove(batch);
    if (error) {
      firstError ??= error.message ?? String(error);
    } else {
      removed += batch.length;
    }
  }
  return { removed, error: firstError };
}

/** Delete collected objects after the DB reset commits. */
export async function purgeCollectedTenantResetStorage(
  admin: SupabaseClient,
  buckets: BucketPaths,
): Promise<{ messageAttachmentRemoved: number; error: string | null }> {
  let messageAttachmentRemoved = 0;
  let firstError: string | null = null;
  for (const [bucket, paths] of Object.entries(buckets)) {
    const { removed, error } = await removeBucketPaths(admin.storage, bucket, paths);
    if (bucket === MESSAGE_ATTACHMENTS_BUCKET) messageAttachmentRemoved = removed;
    if (error) firstError ??= `${bucket}: ${error}`;
  }
  return { messageAttachmentRemoved, error: firstError };
}

/** @deprecated Use collectTenantResetStoragePaths + purgeCollectedTenantResetStorage after RPC. */
export async function purgeExploreStorageForTenant(
  admin: SupabaseClient,
  tenantId: string,
  dryRun: boolean,
): Promise<{ postPaths: number; soundPaths: number }> {
  const { buckets, counts } = await collectTenantResetStoragePaths(admin, tenantId);
  if (!dryRun) {
    await purgeCollectedTenantResetStorage(admin, buckets);
  }
  return { postPaths: counts.postPaths, soundPaths: counts.soundPaths };
}
