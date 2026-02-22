"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ExplorePostForm } from "@/components/provider/ExplorePostForm";
import RoleGuard from "@/components/auth/RoleGuard";
import { fetcher } from "@/lib/http/fetcher";
import { Loader2, ChevronLeft } from "lucide-react";
import type { ExplorePost } from "@/types/explore";

export default function ProviderExploreEditPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [post, setPost] = useState<ExplorePost | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetcher
      .get<{ data: ExplorePost }>(`/api/explore/posts/mine`)
      .then((res: any) => {
        const data = res?.data ?? res;
        const list = Array.isArray(data) ? data : (data?.data ? [data.data] : []);
        const found = list.find((p: ExplorePost) => p.id === id);
        setPost(found ?? null);
      })
      .catch(() => setPost(null))
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return (
      <RoleGuard
        allowedRoles={["provider_owner", "provider_staff"]}
        redirectTo="/provider/dashboard"
        showLoading={false}
      >
        <div className="min-h-screen bg-white flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF0077]" />
        </div>
      </RoleGuard>
    );
  }

  if (!post) {
    return (
      <RoleGuard
        allowedRoles={["provider_owner", "provider_staff"]}
        redirectTo="/provider/dashboard"
        showLoading={false}
      >
        <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
          <p className="text-gray-600 mb-4">Post not found</p>
          <button
            onClick={() => router.push("/provider/explore")}
            className="text-[#FF0077] hover:underline"
          >
            Back to Explore
          </button>
        </div>
      </RoleGuard>
    );
  }

  // media_urls from API are full URLs; ExplorePostForm expects paths for edit
  const postForForm: ExplorePost = {
    ...post,
    media_urls: (post.media_urls ?? []).map((url) => {
      const match = url.match(/\/explore-posts\/(.+)$/);
      return match ? match[1] : url;
    }),
  };

  return (
    <RoleGuard
      allowedRoles={["provider_owner", "provider_staff"]}
      redirectTo="/provider/dashboard"
      showLoading={false}
    >
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <Link
            href="/provider/explore"
            className="flex items-center gap-1 text-gray-700 hover:text-gray-900 -ml-1"
          >
            <ChevronLeft className="w-6 h-6" />
            <span className="text-base font-medium">Back</span>
          </Link>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-semibold text-gray-900">
            Edit post
          </h1>
          <div className="w-14" />
        </header>
        <div className="max-w-lg mx-auto px-4 py-6">
          <ExplorePostForm
            post={postForForm}
            onSuccess={() => router.replace("/provider/explore")}
            onCancel={() => router.push("/provider/explore")}
          />
        </div>
      </div>
    </RoleGuard>
  );
}
