"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher } from "@/lib/http/fetcher";
import { ExplorePostCard } from "@/components/explore/ExplorePostCard";
import type { ExplorePost } from "@/types/explore";
import { ChevronLeft } from "lucide-react";
import LoginModal from "@/components/global/login-modal";

type CollectionData = {
  id: string;
  name: string;
  slug: string;
  post_count: number;
  posts: ExplorePost[];
};

export default function ExploreCollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const { user, isLoading } = useAuth();
  const [collection, setCollection] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [savedProviderIds, setSavedProviderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    params.then((p) => setResolvedId(p.id));
  }, [params]);

  useEffect(() => {
    if (!user || !resolvedId) {
      if (!user && !isLoading) setShowLogin(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetcher
      .get<CollectionData>(`/api/explore/collections/${resolvedId}`, { cache: "no-store" })
      .then((res) => {
        const data = (res as any)?.data ?? res;
        setCollection(data);
        const providerIds = new Set((data?.posts ?? []).map((p: ExplorePost) => p.provider_id));
        if (providerIds.size > 0) {
          fetcher
            .get<{ data: { id: string }[] }>("/api/me/wishlists/providers", { cache: "no-store" })
            .then((r) => {
              const list = (r as any)?.data ?? (r as any);
              const arr = Array.isArray(list) ? list : list?.data ?? [];
              setSavedProviderIds(new Set(arr.map((p: { id: string }) => p.id)));
            })
            .catch(() => {});
        }
      })
      .catch(() => setError("Could not load board"))
      .finally(() => setLoading(false));
  }, [user, resolvedId, isLoading]);

  if (!resolvedId) return null;

  if (!user && !isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <Link href="/account-settings/wishlists" className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 mb-6">
          <ChevronLeft className="h-5 w-5" /> Back to Saved
        </Link>
        <div className="py-16 text-center">
          <p className="text-gray-600 mb-4">Sign in to view this board.</p>
          <button
            onClick={() => setShowLogin(true)}
            className="px-6 py-2 bg-[#FF0077] text-white rounded-lg font-medium hover:opacity-90"
          >
            Sign in
          </button>
        </div>
        <LoginModal
          open={showLogin}
          setOpen={setShowLogin}
          initialMode="login"
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
      <Link href="/account-settings/wishlists" className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 mb-6">
        <ChevronLeft className="h-5 w-5" /> Back to Saved
      </Link>
      {loading && !collection ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-gray-100 rounded-2xl animate-pulse aspect-[4/5]" />
          ))}
        </div>
      ) : error ? (
        <p className="text-gray-600">{error}</p>
      ) : collection ? (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{collection.name}</h1>
          <p className="text-sm text-gray-500 mb-6">{collection.post_count} saved post{collection.post_count === 1 ? "" : "s"}</p>
          {collection.posts.length === 0 ? (
            <p className="text-gray-600">No posts in this board yet. Save posts from Explore and add them to this board from your Saved page.</p>
          ) : (
            <div className="columns-2 gap-4">
              {collection.posts.map((post) => (
                <div key={post.id} className="break-inside-avoid mb-4">
                  <ExplorePostCard
                    post={post}
                    isProviderInWishlist={savedProviderIds.has(post.provider_id)}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
