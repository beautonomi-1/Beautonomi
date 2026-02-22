"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import RoleGuard from "@/components/auth/RoleGuard";
import { Loader2, Plus, Pencil, Trash2, Image as ImageIcon, ExternalLink, Eye, Heart, MessageCircle, Gift } from "lucide-react";
import type { ExplorePost } from "@/types/explore";

export default function ProviderExplorePage() {
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPosts = async () => {
    try {
      setIsLoading(true);
      const res = await fetcher.get<{ data: ExplorePost[] }>("/api/explore/posts/mine");
      const data = (res as any)?.data ?? res ?? [];
      setPosts(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load posts");
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    try {
      await fetcher.delete(`/api/explore/posts/${id}`);
      toast.success("Post deleted");
      loadPosts();
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Delete failed");
    }
  };

  return (
    <RoleGuard
      allowedRoles={["provider_owner", "provider_staff"]}
      redirectTo="/provider/dashboard"
      showLoading={false}
    >
      <div className="min-h-screen bg-white">
        <PageHeader
          title="Explore"
          subtitle="Create and manage posts for the explore feed"
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Provider", href: "/provider" },
            { label: "Explore" },
          ]}
        />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-6">
          {/* Reward points nudge */}
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center gap-3">
            <Gift className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-900 flex-1">
              <strong>Earn reward points</strong> when you post to Explore. Share your work to grow visibility and unlock rewards.
            </p>
            <Link href="/provider/explore/new">
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0">
                <Plus className="w-4 h-4 mr-1" />
                Post now
              </Button>
            </Link>
          </div>
          {/* Analytics summary */}
          {posts.length > 0 && (
            <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-gray-500" />
                <span className="text-sm text-gray-600">Total views:</span>
                <span className="font-semibold text-gray-900">
                  {posts.reduce((a, p) => a + (p.view_count ?? 0), 0)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-gray-500" />
                <span className="text-sm text-gray-600">Total likes:</span>
                <span className="font-semibold text-gray-900">
                  {posts.reduce((a, p) => a + (p.like_count ?? 0), 0)}
                </span>
              </div>
              <Link
                href="/explore"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-2 text-[#FF0077] text-sm font-medium hover:underline"
              >
                <ExternalLink className="w-4 h-4" />
                View on Explore
              </Link>
            </div>
          )}
          <div className="flex justify-end mb-6">
            <Link href="/provider/explore/new">
              <Button className="bg-[#FF0077] hover:bg-[#D60565] text-white">
                <Plus className="w-4 h-4 mr-2" />
                Create Post
              </Button>
            </Link>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-10 h-10 animate-spin text-[#FF0077]" />
            </div>
          ) : posts.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">No posts yet</p>
              <p className="text-sm text-gray-500 mb-6">
                Create your first post to appear in the explore feed and earn reward points.
              </p>
              <Link href="/provider/explore/new">
                <Button className="bg-[#FF0077] hover:bg-[#D60565] text-white">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Post
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="aspect-square bg-gray-100">
                    {post.media_urls?.length ? (
                      (() => {
                        const url = post.media_urls[0];
                        const isVideo =
                          url?.toLowerCase().endsWith(".mp4") ||
                          url?.toLowerCase().endsWith(".webm") ||
                          url?.toLowerCase().endsWith(".mov");
                        return isVideo ? (
                          <video
                            src={url}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        );
                      })()
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                      {post.caption || "No caption"}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded ${
                          post.status === "published"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {post.status}
                      </span>
                      <span>{post.like_count} likes</span>
                      <span>{post.comment_count ?? 0} comments</span>
                      {typeof post.view_count === "number" && (
                        <span>{post.view_count} views</span>
                      )}
                      {post.status === "published" && (
                        <Link
                          href="/explore"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto flex items-center gap-1 text-[#FF0077] hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View on Explore
                        </Link>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Link href={`/provider/explore/${post.id}`}>
                        <Button variant="outline" size="sm">
                          <MessageCircle className="w-3 h-3 mr-1" />
                          View & comments
                        </Button>
                      </Link>
                      <Link href={`/provider/explore/${post.id}/edit`}>
                        <Button variant="outline" size="sm">
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 border-red-200"
                        onClick={() => handleDelete(post.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
