import React from "react";
import { BeautonomiLoadingIcon } from "@/components/BeautonomiLoadingIcon";

export default function ArticleLoading() {
  return (
    <article className="space-y-6 max-w-3xl animate-in fade-in duration-300">
      {/* Breadcrumb placeholder */}
      <div className="h-4 w-56 bg-zinc-100 rounded animate-pulse" />
      {/* Header: title + summary + meta */}
      <header className="space-y-2">
        <div className="h-8 w-3/4 bg-zinc-200 rounded-xl animate-pulse" />
        <div className="h-4 w-full max-w-xl bg-zinc-100 rounded-xl animate-pulse" />
        <div className="h-3 w-40 bg-zinc-100 rounded animate-pulse" />
      </header>
      {/* Body prose placeholder */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-4 w-full bg-zinc-100 rounded-xl animate-pulse" />
        ))}
      </div>
      {/* "Was this helpful?" section placeholder */}
      <section className="pt-6 border-t border-zinc-200/50 space-y-2">
        <div className="h-4 w-28 bg-zinc-100 rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-9 w-16 bg-zinc-100 rounded-md animate-pulse" />
          <div className="h-9 w-12 bg-zinc-100 rounded-md animate-pulse" />
        </div>
      </section>
    </article>
  );
}
