"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const BUCKET = "explore-posts";

interface AdminPost {
  id: string;
  provider_id: string;
  caption: string | null;
  media_urls: string[];
  status: string;
  published_at: string;
  like_count: number;
  is_hidden: boolean;
  created_at: string;
  providers?: { business_name: string; slug: string };
}

export function ExploreModerationTable() {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [hidden, setHidden] = useState<string>("");

  const loadPosts = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (hidden) params.set("hidden", hidden);
      params.set("limit", "100");
      const res = await fetcher.get<{ data: AdminPost[] }>(
        `/api/admin/explore/posts?${params}`
      );
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
  }, [status, hidden]);

  const toggleHidden = async (post: AdminPost) => {
    try {
      await fetcher.patch(`/api/admin/explore/posts/${post.id}`, {
        is_hidden: !post.is_hidden,
      });
      toast.success(post.is_hidden ? "Post unhidden" : "Post hidden");
      loadPosts();
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to update");
    }
  };

  const getMediaUrl = (path: string) =>
    `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        <select
          value={hidden}
          onChange={(e) => setHidden(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All</option>
          <option value="true">Hidden only</option>
          <option value="false">Visible only</option>
        </select>
        <Button variant="outline" size="sm" onClick={loadPosts}>
          Refresh
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF0077]" />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          No posts found
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Preview
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Provider
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Caption
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Likes
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Hidden
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {posts.map((post) => (
                <tr key={post.id} className={post.is_hidden ? "bg-gray-50 opacity-75" : ""}>
                  <td className="px-4 py-2">
                    {post.media_urls?.[0] ? (
                      <img
                        src={getMediaUrl(post.media_urls[0])}
                        alt=""
                        className="w-14 h-14 rounded object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded bg-gray-200" />
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    {post.providers?.business_name || post.provider_id}
                  </td>
                  <td className="px-4 py-2 text-sm max-w-[200px] truncate">
                    {post.caption || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        post.status === "published"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {post.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm">{post.like_count ?? 0}</td>
                  <td className="px-4 py-2 text-sm">
                    {post.is_hidden ? (
                      <span className="text-amber-600">Yes</span>
                    ) : (
                      <span className="text-gray-500">No</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleHidden(post)}
                    >
                      {post.is_hidden ? (
                        <>
                          <Eye className="w-3 h-3 mr-1" />
                          Unhide
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3 mr-1" />
                          Hide
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
