import { api } from "@/lib/api-client";

/** Server dedupes views per actor per UTC day. */
export async function trackExploreView(postId: string): Promise<void> {
  await api.post("/api/explore/events", {
    post_id: postId,
    event_type: "view",
  });
}

export async function trackExploreWatchProgress(postId: string, watchedMs: number): Promise<void> {
  if (!Number.isFinite(watchedMs) || watchedMs < 0) return;
  await api.post(`/api/explore/posts/${postId}/watch-progress`, {
    watched_ms: Math.floor(watchedMs),
  });
}
