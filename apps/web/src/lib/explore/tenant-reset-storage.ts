import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collectExplorePostStoragePaths,
  collectExploreSoundStoragePath,
  removeExplorePostsStoragePaths,
} from "@/lib/explore/storage-paths";

export async function purgeExploreStorageForTenant(
  admin: SupabaseClient,
  tenantId: string,
  dryRun: boolean,
): Promise<{ postPaths: number; soundPaths: number }> {
  const { data: providers } = await admin
    .from("providers")
    .select("id")
    .eq("tenant_id", tenantId);
  const providerIds = (providers ?? []).map((p) => (p as { id: string }).id);
  if (!providerIds.length) return { postPaths: 0, soundPaths: 0 };

  const { data: posts } = await admin
    .from("explore_posts")
    .select("media_urls, display_path, playback_path, media_meta")
    .in("provider_id", providerIds);

  const postPaths = new Set<string>();
  for (const row of posts ?? []) {
    for (const p of collectExplorePostStoragePaths(row as Parameters<typeof collectExplorePostStoragePaths>[0])) {
      postPaths.add(p);
    }
  }

  const { data: sounds } = await admin
    .from("explore_sounds")
    .select("storage_path")
    .eq("owner_type", "provider")
    .in("provider_id", providerIds);

  const soundPaths = new Set<string>();
  for (const s of sounds ?? []) {
    const p = collectExploreSoundStoragePath((s as { storage_path: string }).storage_path);
    if (p) soundPaths.add(p);
  }

  if (!dryRun) {
    await removeExplorePostsStoragePaths(admin.storage, [...postPaths, ...soundPaths]);
    await admin.from("explore_sounds").delete().eq("owner_type", "provider").in("provider_id", providerIds);
  }

  return { postPaths: postPaths.size, soundPaths: soundPaths.size };
}
