import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";
import { toPublicMediaUrl } from "@/lib/explore/media-urls";

/** Remove explore-post public URLs from a provider gallery after a system hide. */
export async function removeExplorePostUrlsFromProviderGallery(
  supabase: SupabaseClient,
  providerId: string,
  displayPath: string | null | undefined,
  mediaUrls: string[],
  mediaMeta: ExploreMediaSlideMeta[],
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const paths = new Set<string>();
  if (displayPath?.trim()) paths.add(displayPath.replace(/^\//, ""));
  for (const slide of mediaMeta) {
    if (slide.display_path?.trim()) paths.add(slide.display_path.replace(/^\//, ""));
  }
  for (const url of mediaUrls) {
    if (url && !url.startsWith("http")) paths.add(url.replace(/^\//, ""));
  }
  if (paths.size === 0) return;

  const publicUrls = new Set<string>();
  for (const p of paths) {
    publicUrls.add(toPublicMediaUrl(p, supabaseUrl));
  }

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
