import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";
import { toPublicMediaUrl } from "@/lib/explore/media-urls";
export type ExplorePostGallerySyncRow = {
  id?: string;
  provider_id: string;
  display_path?: string | null;
  media_urls?: string[];
  media_meta?: ExploreMediaSlideMeta[];
  added_to_gallery?: boolean;
};

/** Remove explore-post public URLs from a provider gallery after hide/delete. */
export async function removeExplorePostUrlsFromProviderGallery(
  supabase: SupabaseClient,
  providerId: string,
  displayPath: string | null | undefined,
  mediaUrls: string[],
  mediaMeta: ExploreMediaSlideMeta[],
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const paths = new Set<string>();
  const publicUrls = new Set<string>();
  const addRef = (value: string | null | undefined) => {
    const raw = value?.trim();
    if (!raw) return;
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      publicUrls.add(raw);
      return;
    }
    paths.add(raw.replace(/^\//, ""));
  };
  addRef(displayPath);
  for (const slide of mediaMeta) addRef(slide.display_path);
  for (const url of mediaUrls) addRef(url);
  for (const p of paths) publicUrls.add(toPublicMediaUrl(p, supabaseUrl));
  if (publicUrls.size === 0) return;

  const { data: prov } = await supabase
    .from("providers")
    .select("gallery")
    .eq("id", providerId)
    .maybeSingle();
  const gallery = (prov?.gallery ?? []) as string[];
  if (!gallery.length) return;

  const next = gallery.filter((u) => !publicUrls.has(u));
  if (next.length === gallery.length) return;

  await supabase.from("providers").update({ gallery: next }).eq("id", providerId);
}

export async function syncExplorePostGalleryOnHide(
  supabase: SupabaseClient,
  post: ExplorePostGallerySyncRow,
): Promise<void> {
  if (!post.provider_id) return;
  await removeExplorePostUrlsFromProviderGallery(
    supabase,
    post.provider_id,
    post.display_path ?? null,
    (post.media_urls ?? []) as string[],
    (post.media_meta ?? []) as ExploreMediaSlideMeta[],
  );
}

export async function syncExplorePostGalleryOnUnhide(post: ExplorePostGallerySyncRow): Promise<void> {
  if (!post.added_to_gallery || !post.provider_id) return;
  const { appendGalleryDisplayImage } = await import("@/lib/explore/publish-side-effects");
  await appendGalleryDisplayImage(
    post.provider_id,
    post.display_path ?? null,
    (post.media_urls ?? []) as string[],
    (post.media_meta ?? []) as ExploreMediaSlideMeta[],
    post.id,
  );
}
