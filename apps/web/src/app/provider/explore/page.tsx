"use client";
import { useTranslation } from "@beautonomi/i18n";

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
  const { t } = useTranslation();
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPosts = async () => {
    try {
      setIsLoading(true);
      const res = await fetcher.get<{ data: ExplorePost[] }>("/api/explore/posts/mine");
      const data = (res as any)?.data ?? res ?? [];
      setPosts(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t("web.provider.explorePage.failedToLoad"));
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm(t("web.provider.explorePage.deleteConfirm"))) return;
    try {
      await fetcher.delete(`/api/explore/posts/${id}`);
      toast.success(t("web.provider.explorePage.deleted"));
      loadPosts();
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : t("web.provider.explorePage.deleteFailed"));
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
          title={t("web.provider.explorePage.title")}
          subtitle={t("web.provider.explorePage.subtitle")}
          breadcrumbs={[
            { label: t("web.provider.common.breadcrumbHome"), href: "/" },
            { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
            { label: t("web.provider.explorePage.title") },
          ]}
        />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-6">
          {/* Reward points nudge */}
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center gap-3">
            <Gift className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-900 flex-1">
              <strong>{t("web.provider.explorePage.earnStrong")}</strong> {t("web.provider.explorePage.earnBody")}
            </p>
            <Link href="/provider/explore/new">
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0">
                <Plus className="w-4 h-4 me-1" />
                {t("web.provider.explorePage.postNow")}
              </Button>
            </Link>
          </div>
          {/* Analytics summary */}
          {posts.length > 0 && (
            <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-gray-500" />
                <span className="text-sm text-gray-600">{t("web.provider.explorePage.totalViews")}</span>
                <span className="font-semibold text-gray-900">
                  {posts.reduce((a, p) => a + (p.view_count ?? 0), 0)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-gray-500" />
                <span className="text-sm text-gray-600">{t("web.provider.explorePage.totalLikes")}</span>
                <span className="font-semibold text-gray-900">
                  {posts.reduce((a, p) => a + (p.like_count ?? 0), 0)}
                </span>
              </div>
              <Link
                href="/explore"
                target="_blank"
                rel="noopener noreferrer"
                className="ms-auto flex items-center gap-2 text-primary text-sm font-medium hover:underline"
              >
                <ExternalLink className="w-4 h-4" />
                {t("web.provider.explorePage.viewOnExplore")}
              </Link>
            </div>
          )}
          <div className="flex justify-end mb-6">
            <Link href="/provider/explore/new">
              <Button className="bg-primary hover:bg-primary-hover text-white">
                <Plus className="w-4 h-4 me-2" />
                {t("web.provider.explorePage.createPost")}
              </Button>
            </Link>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          ) : posts.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">{t("web.provider.explorePage.noPosts")}</p>
              <p className="text-sm text-gray-500 mb-6">
{t("web.provider.explorePage.noPostsHint")}
              </p>
              <Link href="/provider/explore/new">
                <Button className="bg-primary hover:bg-primary-hover text-white">
                  <Plus className="w-4 h-4 me-2" />
                  {t("web.provider.explorePage.createPost")}
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
                      {post.caption || t("web.provider.explorePage.noCaption")}
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
                      <span>{t("web.provider.explorePage.likes", { count: post.like_count ?? 0 })}</span>
                      <span>{t("web.provider.explorePage.comments", { count: post.comment_count ?? 0 })}</span>
                      {typeof post.view_count === "number" && (
                        <span>{t("web.provider.explorePage.views", { count: post.view_count })}</span>
                      )}
                      {post.status === "published" && (
                        <Link
                          href="/explore"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ms-auto flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {t("web.provider.explorePage.viewOnExplore")}
                        </Link>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Link href={`/provider/explore/${post.id}`}>
                        <Button variant="outline" size="sm">
                          <MessageCircle className="w-3 h-3 me-1" />
                          {t("web.provider.explorePage.viewComments")}
                        </Button>
                      </Link>
                      <Link href={`/provider/explore/${post.id}/edit`}>
                        <Button variant="outline" size="sm">
                          <Pencil className="w-3 h-3 me-1" />
                          {t("web.provider.common.edit")}
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
