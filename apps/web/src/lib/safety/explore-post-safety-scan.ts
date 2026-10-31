import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";
import { getImageSafetyScanner } from "@/lib/safety/image-safety-scanner";
import {
  captionHasMedicalClaims,
  MEDICAL_CLAIMS_MODERATION_NOTE,
} from "@/lib/safety/medical-claims-keywords";
import { exploreCaptionSafetyVerdict } from "@/lib/safety/explore-caption-denylist";
import { removeExplorePostUrlsFromProviderGallery } from "@/lib/safety/explore-post-gallery";

const SYSTEM_HIDE_NOTE_PREFIX = "[safety-scan]";

function mergeModerationNotes(
  existing: string | null | undefined,
  addition: string,
): string {
  const prev = existing?.trim() ?? "";
  if (!prev) return addition;
  if (prev.includes(addition)) return prev;
  return `${prev}\n${addition}`;
}

/** Skip when a superadmin unhid (or acted) after this scan started. */
function shouldSkipSystemHide(params: {
  moderated_by: string | null;
  moderated_at: string | null;
  is_hidden: boolean;
  scanStartedAt: string;
}): boolean {
  if (!params.moderated_by || !params.moderated_at) return false;
  if (params.is_hidden) return false;
  return new Date(params.moderated_at).getTime() > new Date(params.scanStartedAt).getTime();
}

function collectScanImageUrls(
  displayPath: string | null | undefined,
  mediaMeta: ExploreMediaSlideMeta[],
): string[] {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const paths: string[] = [];
  if (displayPath?.trim()) paths.push(displayPath.replace(/^\//, ""));
  for (const slide of mediaMeta) {
    if (slide.kind === "image" && slide.display_path?.trim()) {
      paths.push(slide.display_path.replace(/^\//, ""));
    }
  }
  const unique = [...new Set(paths)].slice(0, 3);
  if (!supabaseUrl) return unique;
  return unique.map((p) =>
    p.startsWith("http") ? p : `${supabaseUrl}/storage/v1/object/public/explore-posts/${p}`,
  );
}

async function applySystemHide(
  postId: string,
  providerId: string,
  note: string,
  displayPath: string | null,
  mediaUrls: string[],
  mediaMeta: ExploreMediaSlideMeta[],
  scanStartedAt: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: fresh } = await supabase
    .from("explore_posts")
    .select("is_hidden, moderated_by, moderated_at, moderation_notes")
    .eq("id", postId)
    .maybeSingle();

  if (!fresh || fresh.is_hidden) return;
  if (
    shouldSkipSystemHide({
      moderated_by: fresh.moderated_by as string | null,
      moderated_at: fresh.moderated_at as string | null,
      is_hidden: Boolean(fresh.is_hidden),
      scanStartedAt,
    })
  ) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("explore_posts")
    .update({
      is_hidden: true,
      moderated_at: now,
      moderation_notes: mergeModerationNotes(
        fresh.moderation_notes as string | null,
        note,
      ),
    })
    .eq("id", postId);

  if (error) {
    console.warn("[explore-safety-scan] hide failed:", error);
    return;
  }

  await removeExplorePostUrlsFromProviderGallery(
    supabase,
    providerId,
    displayPath,
    mediaUrls,
    mediaMeta,
  );
}

async function applyModerationNoteOnly(
  postId: string,
  note: string,
  scanStartedAt: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: fresh } = await supabase
    .from("explore_posts")
    .select("moderation_notes, moderated_by, moderated_at, is_hidden")
    .eq("id", postId)
    .maybeSingle();
  if (!fresh || fresh.is_hidden) return;
  if (
    shouldSkipSystemHide({
      moderated_by: fresh.moderated_by as string | null,
      moderated_at: fresh.moderated_at as string | null,
      is_hidden: Boolean(fresh.is_hidden),
      scanStartedAt,
    })
  ) {
    return;
  }

  await supabase
    .from("explore_posts")
    .update({
      moderation_notes: mergeModerationNotes(
        fresh.moderation_notes as string | null,
        note,
      ),
    })
    .eq("id", postId);
}

export async function runExplorePostSafetyScan(
  postId: string,
  scanStartedAt: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: post } = await supabase
    .from("explore_posts")
    .select(
      "id, provider_id, status, caption, display_path, media_urls, media_meta, is_hidden",
    )
    .eq("id", postId)
    .maybeSingle();

  if (!post || post.status !== "published" || post.is_hidden) return;

  const providerId = String(post.provider_id);
  const caption = String(post.caption ?? "");
  const mediaUrls = (post.media_urls ?? []) as string[];
  const mediaMeta = (post.media_meta ?? []) as ExploreMediaSlideMeta[];
  const displayPath = post.display_path as string | null;

  const captionVerdict = exploreCaptionSafetyVerdict(caption);
  if (captionVerdict === "likely_violation") {
    await applySystemHide(
      postId,
      providerId,
      `${SYSTEM_HIDE_NOTE_PREFIX} Caption matched automatic safety denylist.`,
      displayPath,
      mediaUrls,
      mediaMeta,
      scanStartedAt,
    );
    return;
  }

  const notes: string[] = [];
  if (captionHasMedicalClaims(caption)) {
    notes.push(MEDICAL_CLAIMS_MODERATION_NOTE);
  }

  const imageUrls = collectScanImageUrls(displayPath, mediaMeta);
  if (imageUrls.length > 0) {
    const scanner = getImageSafetyScanner();
    const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
    const environment =
      env === "production" ? "production" : env === "staging" ? "staging" : "development";
    const imageVerdict = await scanner.scanImageUrls({
      urls: imageUrls,
      environment,
      tenantId: null,
      sensitiveMedicalContext: false,
    });

    if (imageVerdict.verdict === "likely_violation") {
      await applySystemHide(
        postId,
        providerId,
        `${SYSTEM_HIDE_NOTE_PREFIX} Image scan: ${imageVerdict.rationale || "likely_violation"}`,
        displayPath,
        mediaUrls,
        mediaMeta,
        scanStartedAt,
      );
      return;
    }

    if (imageVerdict.verdict === "needs_human") {
      notes.push(
        `${SYSTEM_HIDE_NOTE_PREFIX} Image scan needs human review: ${imageVerdict.rationale || imageVerdict.verdict}`,
      );
    }
  }

  if (notes.length) {
    await applyModerationNoteOnly(postId, notes.join("\n"), scanStartedAt);
  }
}

/** Fire-and-forget safety scan after explore publish or media/caption change. */
export function enqueueExplorePostSafetyScan(postId: string): void {
  const scanStartedAt = new Date().toISOString();
  void runExplorePostSafetyScan(postId, scanStartedAt).catch((err) => {
    console.warn("[explore-safety-scan] failed:", postId, err);
  });
}
