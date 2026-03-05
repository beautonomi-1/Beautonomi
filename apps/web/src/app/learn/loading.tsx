import React from "react";
import { BeautonomiLoadingIcon } from "@/components/BeautonomiLoadingIcon";

export default function LearnLoading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex justify-center py-6">
        <BeautonomiLoadingIcon size={56} />
      </div>
      {/* Hero + Search skeleton — rounded-[24px] to match final */}
      <div className="space-y-4">
        <div className="h-8 w-3/4 max-w-md bg-zinc-200 rounded-xl animate-pulse" />
        <div className="h-4 w-full max-w-lg bg-zinc-100 rounded-xl animate-pulse" />
        <div className="h-16 w-full max-w-2xl rounded-[24px] bg-zinc-100 border border-zinc-200/50 animate-pulse" />
      </div>
      {/* Bento grid skeleton — rounded-[24px] cards */}
      <div className="space-y-4">
        <div className="h-4 w-24 bg-zinc-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-[24px] border border-zinc-200/50 bg-white p-6 animate-pulse"
            >
              <div className="flex gap-4">
                <div className="h-12 w-12 shrink-0 rounded-2xl bg-zinc-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 bg-zinc-200 rounded-xl" />
                  <div className="h-3 w-full bg-zinc-100 rounded-xl" />
                </div>
              </div>
              <div className="mt-6 h-9 w-24 rounded-full bg-zinc-100" />
            </div>
          ))}
        </div>
      </div>
      {/* Featured list skeleton — rounded-[24px] */}
      <div className="space-y-0 rounded-[24px] border border-zinc-200/50 bg-white overflow-hidden">
        <div className="h-4 w-32 bg-zinc-200 rounded-xl mx-6 mt-6 mb-4 animate-pulse" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex min-h-[56px] items-center gap-3 border-t border-zinc-200/50 px-4 md:px-6 py-3"
          >
            <div className="h-4 flex-1 max-w-xs bg-zinc-200 rounded-xl animate-pulse" />
            <div className="h-4 w-4 shrink-0 rounded-lg bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
