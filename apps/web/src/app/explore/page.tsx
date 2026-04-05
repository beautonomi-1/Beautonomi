import { fetchExplorePostsInitial } from "@/lib/explore/fetch-posts";
import { ExploreFeed } from "@/components/explore/ExploreFeed";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const initial = await fetchExplorePostsInitial(20);
  return (
    <div className="w-full max-w-7xl mx-auto px-4 pt-6">
      <ExploreFeed
        initialPosts={initial.posts}
        initialCursor={initial.next_cursor}
        initialHasMore={initial.has_more}
      />
    </div>
  );
}
