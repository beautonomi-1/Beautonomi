"use client";

import React, { useEffect, useState } from "react";
import { useParams, notFound as triggerNotFound } from "next/navigation";
import { ExplorePostDetail } from "@/components/explore/ExplorePostDetail";
import { fetcher } from "@/lib/http/fetcher";
import type { ExplorePost } from "@/types/explore";

export default function ExplorePostPage() {
  const params = useParams();
  const id = params?.id as string;
  const [post, setPost] = useState<ExplorePost | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<ExplorePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [show404, setShow404] = useState(false);

  useEffect(() => {
    if (!id) {
      queueMicrotask(() => {
        setShow404(true);
        setLoading(false);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      setLoading(true);
      setShow404(false);
    });
    fetcher
      .get<ExplorePost>(`/api/explore/posts/${id}`)
      .then((postRes) => {
        if (cancelled) return;
        const p = (postRes as any)?.data ?? postRes;
        if (!p || !p.id) {
          setShow404(true);
          setPost(null);
          setRelatedPosts([]);
          return;
        }
        setPost(p);
        // Fetch related posts for "More like this"; failure is non-fatal (show post with empty related)
        fetcher
          .get<{ data: ExplorePost[] }>(`/api/explore/posts?limit=13`)
          .then((listRes) => {
            if (cancelled) return;
            const list = (listRes as any)?.data ?? listRes;
            const items = Array.isArray(list) ? list : list?.data ?? [];
            setRelatedPosts(items.filter((x: ExplorePost) => x.id !== id).slice(0, 12));
          })
          .catch(() => {
            // Ignore: post is already shown, related stays []
          });
      })
      .catch(() => {
        if (!cancelled) setShow404(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (show404 || !post) {
    triggerNotFound();
    return null;
  }

  return <ExplorePostDetail post={post} relatedPosts={relatedPosts} />;
}
