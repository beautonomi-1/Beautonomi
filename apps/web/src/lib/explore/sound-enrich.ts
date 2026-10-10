import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExplorePost } from "@/types/explore";
import { toPublicMediaUrl } from "@/lib/explore/media-urls";

export async function enrichExplorePostsWithSoundUrls(
  supabase: SupabaseClient,
  posts: ExplorePost[],
  supabaseUrl?: string,
): Promise<ExplorePost[]> {
  const soundIds = [...new Set(posts.map((p) => p.sound_id).filter(Boolean))] as string[];
  if (!soundIds.length) return posts;

  const { data } = await supabase
    .from("explore_sounds")
    .select("id, storage_path")
    .in("id", soundIds)
    .eq("is_hidden", false);

  const urlById = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.id && row.storage_path) {
      urlById.set(row.id, toPublicMediaUrl(row.storage_path, supabaseUrl));
    }
  }

  return posts.map((p) => {
    if (!p.sound_id) return p;
    const sound_url = urlById.get(p.sound_id);
    return sound_url ? { ...p, sound_url } : p;
  });
}

export async function enrichExplorePostWithSoundUrl(
  supabase: SupabaseClient,
  post: ExplorePost,
  supabaseUrl?: string,
): Promise<ExplorePost> {
  const [next] = await enrichExplorePostsWithSoundUrls(supabase, [post], supabaseUrl);
  return next ?? post;
}
