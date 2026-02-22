import { fetchExplorePosts } from "@/lib/explore/fetch-posts";
import { ExploreFeed } from "@/components/explore/ExploreFeed";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const initialPosts = await fetchExplorePosts(20);
  return (
    <div className="w-full max-w-7xl mx-auto px-4 pt-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Explore</h1>
      <ExploreFeed initialPosts={initialPosts} />
    </div>
  );
}
