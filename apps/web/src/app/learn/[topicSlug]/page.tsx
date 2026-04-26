"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { BeautonomiLoadingIcon } from "@/components/BeautonomiLoadingIcon";
import { LearnBreadcrumb } from "../components/learn-breadcrumb";

interface TopicData {
  category: { id: string; title: string; slug: string };
  parents?: string[];
  parent_slugs?: string[];
  articles: Array<{ id: string; title: string; slug: string; summary: string | null; published_at: string | null }>;
  total: number;
  page: number;
  limit: number;
}

export default function LearnTopicPage() {
  const params = useParams();
  const topicSlug = params.topicSlug as string;
  const [data, setData] = useState<TopicData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!topicSlug) return;
    fetch(`/api/public/learn/topics/${encodeURIComponent(topicSlug)}`)
      .then((r) => r.json())
      .then((res) => setData(res.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [topicSlug]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-center py-4">
          <BeautonomiLoadingIcon size={48} />
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 bg-zinc-200 rounded-xl" />
          <ul className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <li key={i} className="h-20 bg-zinc-100 rounded-2xl" />
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (!data?.category) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">We couldn&apos;t find that topic. Try the Learning Center home or site home.</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 hover:border-[#ff0077]/40 hover:text-[#ff0077]"
          >
            Beautonomi home
          </Link>
          <Link
            href="/learn"
            className="inline-flex min-h-[44px] items-center rounded-full bg-[#ff0077] px-4 text-sm font-medium text-white hover:bg-[#ff0077]/90"
          >
            Learning Center topics
          </Link>
        </div>
      </div>
    );
  }

  const articles = data.articles ?? [];
  const parents = data.parents ?? [];
  const parentSlugs = data.parent_slugs ?? [];
  const ancestorTitles = parents.length > 0 && parents[parents.length - 1] === data.category.title
    ? parents.slice(0, -1)
    : parents;
  const ancestorSlugs = parentSlugs.length > ancestorTitles.length ? parentSlugs.slice(0, -1) : parentSlugs;

  return (
    <div className="space-y-6">
      <LearnBreadcrumb
        parents={ancestorTitles}
        parentSlugs={ancestorSlugs}
        current={data.category.title}
        currentHref={`/learn/${data.category.slug}`}
      />
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-black">{data.category.title}</h1>
        <p className="text-xs font-mono text-zinc-500 mt-1 tabular-nums">{articles.length} article{articles.length !== 1 ? "s" : ""}</p>
      </section>

      <ul className="space-y-2">
        {articles.map((a) => (
          <li key={a.id}>
            <Link
              href={`/learn/article/${a.slug}`}
              className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-zinc-200/50 bg-white px-4 py-3 shadow-sm transition-all duration-200 ease-in-out hover:shadow-[0_0_20px_-5px_rgba(255,0,119,0.15)] hover:border-[#ff0077]/30 hover:-translate-y-0.5 active:scale-[0.99]"
            >
              <span className="flex-1 font-medium text-black text-sm">{a.title}</span>
              {a.summary && <span className="hidden sm:block text-xs text-zinc-500 truncate max-w-xs">{a.summary}</span>}
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
            </Link>
          </li>
        ))}
      </ul>

      {articles.length === 0 && (
        <p className="text-sm text-zinc-600">No articles in this topic yet.</p>
      )}
    </div>
  );
}
