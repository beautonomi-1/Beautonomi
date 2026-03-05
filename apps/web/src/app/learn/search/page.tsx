"use client";

import React, { useState, useEffect, useTransition, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { BeautonomiLoadingIcon } from "@/components/BeautonomiLoadingIcon";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  rank?: number;
  result_type?: string;
  read_time_min?: number;
};
type TopicResult = { id: string; title: string; slug: string; result_type: string; audience?: string };

const DEBOUNCE_MS = 300;

function SearchResults() {
  const searchParams = useSearchParams();
  const qParam = searchParams.get("q") ?? "";
  const [inputValue, setInputValue] = useState(qParam);
  const [q, setQ] = useState(qParam);
  const [data, setData] = useState<{
    results: SearchResult[];
    by_type: { articles: SearchResult[]; topics: TopicResult[]; video_guides: SearchResult[] };
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setInputValue(qParam);
    setQ(qParam);
  }, [qParam]);

  useEffect(() => {
    const v = inputValue.trim();
    const t = setTimeout(() => {
      setQ(v);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (v) url.searchParams.set("q", v);
        else url.searchParams.delete("q");
        window.history.replaceState({}, "", url.pathname + (url.search ? "?" + url.searchParams.toString() : ""));
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [inputValue]);

  useEffect(() => {
    if (!q.trim()) {
      startTransition(() => {
        setData({ results: [], by_type: { articles: [], topics: [], video_guides: [] }, total: 0 });
      });
      return;
    }
    setLoading(true);
    fetch(`/api/public/learn/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((res) => {
        const d = res.data ?? { results: [], by_type: { articles: [], topics: [], video_guides: [] }, total: 0 };
        startTransition(() => {
          setData(d);
        });
      })
      .catch(() => {
        startTransition(() => {
          setData({ results: [], by_type: { articles: [], topics: [], video_guides: [] }, total: 0 });
        });
      })
      .finally(() => setLoading(false));
  }, [q]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = (e.currentTarget.querySelector('input[name="q"]') as HTMLInputElement)?.value?.trim() ?? "";
    setInputValue(v);
    setQ(v);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (v) url.searchParams.set("q", v);
      else url.searchParams.delete("q");
      window.history.replaceState({}, "", url.pathname + (url.search ? "?" + url.searchParams.toString() : ""));
    }
  };

  if (!q.trim()) {
    return (
      <div className="space-y-4">
        <form onSubmit={handleSubmit} className="max-w-xl">
          <input
            type="search"
            name="q"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search articles and topics..."
            className="w-full rounded-full border border-zinc-200/50 bg-zinc-100/80 px-4 py-3 text-base shadow-inner placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#ff0077]/20"
          />
        </form>
        <p className="text-sm text-zinc-600">Enter a search query above.</p>
      </div>
    );
  }

  const byType = data?.by_type ?? { articles: [], topics: [], video_guides: [] };
  const showOverlay = loading || isPending;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="max-w-xl">
        <input
          type="search"
          name="q"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search articles and topics..."
          className="w-full rounded-full border border-zinc-200/50 bg-zinc-100/80 px-4 py-3 text-base shadow-inner placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#ff0077]/20"
        />
      </form>

      <div className="relative">
        {showOverlay && (
          <div
            className="absolute inset-0 z-10 backdrop-blur-xl bg-white/50 rounded-2xl flex items-center justify-center min-h-[120px]"
            aria-busy="true"
          >
            <BeautonomiLoadingIcon size={40} />
          </div>
        )}

        <div className={cn("space-y-6", showOverlay && "opacity-60 pointer-events-none")}>
          <p className="text-xs font-mono text-zinc-500 tabular-nums">
            {data?.total ?? 0} result{(data?.total ?? 0) !== 1 ? "s" : ""} for &quot;{q}&quot;
          </p>

          {byType.topics.length > 0 && (
            <section>
              <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Topics</h2>
              <ul className="space-y-2">
                {byType.topics.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/learn/${t.slug}`}
                      className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-zinc-200/50 bg-white px-4 py-3 transition-all duration-200 ease-in-out hover:shadow-[0_0_20px_-5px_rgba(255,0,119,0.15)] hover:border-[#ff0077]/30 hover:-translate-y-0.5 active:scale-[0.99]"
                    >
                      <span className="flex-1 font-medium text-black text-sm">{t.title}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {byType.articles.length > 0 && (
            <section>
              <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Articles</h2>
              <ul className="space-y-2">
                {byType.articles.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/learn/article/${a.slug}`}
                      className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-zinc-200/50 bg-white px-4 py-3 transition-all duration-200 ease-in-out hover:shadow-[0_0_20px_-5px_rgba(255,0,119,0.15)] hover:border-[#ff0077]/30 hover:-translate-y-0.5 active:scale-[0.99]"
                    >
                      <span className="flex-1 font-medium text-black text-sm">{a.title}</span>
                      {a.read_time_min != null && (
                        <span className="font-mono text-xs text-zinc-500 tabular-nums">{a.read_time_min} min</span>
                      )}
                      {a.summary && (
                        <span className="hidden sm:block text-xs text-zinc-500 truncate max-w-xs">{a.summary}</span>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {byType.video_guides.length > 0 && (
            <section>
              <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Video guides</h2>
              <ul className="space-y-2">
                {byType.video_guides.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/learn/article/${a.slug}`}
                      className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-zinc-200/50 bg-white px-4 py-3 transition-all duration-200 ease-in-out hover:shadow-[0_0_20px_-5px_rgba(255,0,119,0.15)] hover:border-[#ff0077]/30 hover:-translate-y-0.5 active:scale-[0.99]"
                    >
                      <span className="flex-1 font-medium text-black text-sm">{a.title}</span>
                      {a.read_time_min != null && (
                        <span className="font-mono text-xs text-zinc-500 tabular-nums">{a.read_time_min} min</span>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!showOverlay && data && data.total === 0 && (
            <p className="text-sm text-zinc-600">No results found. Try different keywords.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LearnSearchPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-black">Search</h1>
      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="flex justify-center py-4">
              <BeautonomiLoadingIcon size={48} />
            </div>
            <div className="animate-pulse space-y-2">
              <div className="h-12 bg-zinc-100 rounded-xl" />
              <div className="min-h-[56px] rounded-2xl border border-zinc-200/50 bg-zinc-100 p-4" />
            </div>
          </div>
        }
      >
        <SearchResults />
      </Suspense>
    </div>
  );
}
