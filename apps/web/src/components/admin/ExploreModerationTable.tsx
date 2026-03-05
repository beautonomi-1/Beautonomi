"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  Loader2,
  Eye,
  EyeOff,
  Search,
  ExternalLink,
  FileText,
  CheckSquare,
  Square,
} from "lucide-react";

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
  comment_count?: number;
  is_hidden: boolean;
  moderation_notes?: string | null;
  moderated_at?: string | null;
  created_at: string;
  providers?: { business_name: string; slug: string };
}

const SORT_OPTIONS = [
  { value: "published_at_desc", label: "Newest first" },
  { value: "published_at_asc", label: "Oldest first" },
  { value: "like_count_desc", label: "Most likes" },
  { value: "comment_count_desc", label: "Most comments" },
  { value: "created_at_desc", label: "Recently created" },
] as const;

export function ExploreModerationTable() {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [hidden, setHidden] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<string>("published_at_desc");
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [hideReasonModal, setHideReasonModal] = useState<{ post: AdminPost | null; bulk: boolean }>({ post: null, bulk: false });
  const [moderationReason, setModerationReason] = useState("");

  const loadPosts = useCallback(
    async (resetOffset = true, requestOffset?: number) => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (hidden) params.set("hidden", hidden);
        if (searchQuery.trim()) params.set("search", searchQuery.trim());
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
        params.set("sort", sort);
        params.set("limit", String(limit));
        const off = requestOffset ?? (resetOffset ? 0 : offset);
        params.set("offset", String(off));
        const res = await fetcher.get<{ data: { posts: AdminPost[]; total: number; limit: number; offset: number } }>(
          `/api/admin/explore/posts?${params}`
        );
        const payload = (res as any)?.data;
        const list = Array.isArray(payload?.posts) ? payload.posts : Array.isArray((res as any)?.data) ? (res as any).data : [];
        const tot = typeof payload?.total === "number" ? payload.total : list.length;
        if (resetOffset || off === 0) {
          setPosts(list);
          setOffset(0);
        } else {
          setPosts((prev) => [...prev, ...list]);
          setOffset(off);
        }
        setTotal(tot);
      } catch {
        toast.error("Failed to load posts");
        setPosts([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [status, hidden, searchQuery, dateFrom, dateTo, sort, offset]
  );

  useEffect(() => {
    loadPosts(true);
  }, [status, hidden, sort, dateFrom, dateTo]);

  const runSearch = () => {
    setOffset(0);
    loadPosts(true);
  };

  const toggleHidden = async (post: AdminPost, reason?: string) => {
    try {
      await fetcher.patch(`/api/admin/explore/posts/${post.id}`, {
        is_hidden: !post.is_hidden,
        ...(reason !== undefined && { moderation_notes: reason || null }),
      });
      toast.success(post.is_hidden ? "Post unhidden" : "Post hidden");
      setHideReasonModal({ post: null, bulk: false });
      setModerationReason("");
      loadPosts(true);
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to update");
    }
  };

  const openHideModal = (post: AdminPost) => {
    if (post.is_hidden) {
      toggleHidden(post);
      return;
    }
    setHideReasonModal({ post, bulk: false });
    setModerationReason("");
  };

  const confirmHideWithReason = () => {
    if (hideReasonModal.post) {
      toggleHidden(hideReasonModal.post, moderationReason);
    }
  };

  const bulkHideUnhide = async (action: "hide" | "unhide") => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.error("Select at least one post");
      return;
    }
    setBulkActionLoading(true);
    try {
      await fetcher.post("/api/admin/explore/posts", {
        action: action === "hide" ? "hide" : "unhide",
        post_ids: ids,
        ...(action === "hide" && moderationReason && { moderation_notes: moderationReason }),
      });
      toast.success(`${action === "hide" ? "Hidden" : "Unhidden"} ${ids.length} post(s)`);
      setSelectedIds(new Set());
      setHideReasonModal({ post: null, bulk: false });
      setModerationReason("");
      loadPosts(true);
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Bulk action failed");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const openBulkHideModal = () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one post");
      return;
    }
    setHideReasonModal({ post: null, bulk: true });
    setModerationReason("");
  };

  const confirmBulkHide = () => {
    bulkHideUnhide("hide");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === posts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(posts.map((p) => p.id)));
    }
  };

  const getMediaUrl = (path: string) =>
    path?.startsWith("http") ? path : `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

  const hasMore = offset + posts.length < total;

  return (
    <div className="space-y-4">
      {/* Guidelines link */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3">
        <p className="text-sm text-amber-900">
          Moderate content according to your community guidelines. Hidden posts are removed from the public Explore feed.
        </p>
        <a
          href="/help"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:text-amber-900"
        >
          <FileText className="w-4 h-4" />
          Help &amp; policies
        </a>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search caption or provider..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            className="pl-9"
          />
        </div>
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
          <option value="">All visibility</option>
          <option value="true">Hidden only</option>
          <option value="false">Visible only</option>
        </select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[140px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
          title="From date"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[140px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
          title="To date"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => runSearch()}>
          Search
        </Button>
        <Button variant="ghost" size="sm" onClick={() => loadPosts(true)}>
          Refresh
        </Button>
      </div>

      {/* Bulk actions */}
      {posts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            {selectedIds.size === posts.length ? (
              <CheckSquare className="w-4 h-4 text-[#FF0077]" />
            ) : (
              <Square className="w-4 h-4 text-gray-400" />
            )}
            {selectedIds.size === posts.length ? "Deselect all" : "Select all on page"}
          </button>
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-gray-500">{selectedIds.size} selected</span>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkActionLoading}
                onClick={openBulkHideModal}
              >
                <EyeOff className="w-3 h-3 mr-1" />
                Hide selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkActionLoading}
                onClick={() => bulkHideUnhide("unhide")}
              >
                <Eye className="w-3 h-3 mr-1" />
                Unhide selected
              </Button>
            </>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF0077]" />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          No posts found. Try adjusting filters or search.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left w-10">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Preview</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Caption</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Likes</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Comments</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Visibility</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {posts.map((post) => (
                  <tr key={post.id} className={post.is_hidden ? "bg-gray-50 opacity-90" : ""}>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleSelect(post.id)}
                        className="p-1 rounded hover:bg-gray-100"
                      >
                        {selectedIds.has(post.id) ? (
                          <CheckSquare className="w-4 h-4 text-[#FF0077]" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </td>
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
                    <td className="px-4 py-2 text-sm max-w-[200px] truncate" title={post.caption || undefined}>
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
                    <td className="px-4 py-2 text-sm">{post.comment_count ?? 0}</td>
                    <td className="px-4 py-2 text-sm">
                      {post.is_hidden ? (
                        <span className="text-amber-600 font-medium">Hidden</span>
                      ) : (
                        <span className="text-gray-500">Visible</span>
                      )}
                      {post.moderation_notes && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[120px]" title={post.moderation_notes}>
                          {post.moderation_notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <a
                          href={`/explore/${post.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center rounded p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                          title="View post"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openHideModal(post)}
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => loadPosts(false, offset + limit)}
                disabled={isLoading}
              >
                Load more
              </Button>
            </div>
          )}
          <p className="text-sm text-gray-500">
            Showing {posts.length} of {total} posts
          </p>
        </>
      )}

      {/* Hide reason modal (single post) */}
      {hideReasonModal.post && !hideReasonModal.bulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Hide post</h3>
            <p className="text-sm text-gray-500 mb-4">
              Optionally add a reason (stored for audit; not sent to the provider unless you notify them separately).
            </p>
            <textarea
              value={moderationReason}
              onChange={(e) => setModerationReason(e.target.value)}
              placeholder="e.g. Community guidelines violation"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[80px]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setHideReasonModal({ post: null, bulk: false })}>
                Cancel
              </Button>
              <Button onClick={confirmHideWithReason} className="bg-[#FF0077] hover:bg-[#D60565]">
                Hide post
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk hide modal */}
      {hideReasonModal.bulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Hide {selectedIds.size} posts</h3>
            <p className="text-sm text-gray-500 mb-4">
              Optionally add a moderation reason (stored for audit).
            </p>
            <textarea
              value={moderationReason}
              onChange={(e) => setModerationReason(e.target.value)}
              placeholder="e.g. Community guidelines violation"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[80px]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setHideReasonModal({ post: null, bulk: false })}>
                Cancel
              </Button>
              <Button
                onClick={confirmBulkHide}
                disabled={bulkActionLoading}
                className="bg-[#FF0077] hover:bg-[#D60565]"
              >
                {bulkActionLoading ? "Hiding…" : "Hide selected"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
