import React from "react";
import { BeautonomiLoadingIcon } from "@/components/BeautonomiLoadingIcon";

export default function TopicLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-center py-4">
        <BeautonomiLoadingIcon size={48} />
      </div>
      <div className="h-8 w-1/3 bg-zinc-200 rounded-xl animate-pulse" />
      <div className="h-4 w-24 bg-zinc-100 rounded-xl animate-pulse" />
      <ul className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="min-h-[56px] rounded-2xl border border-zinc-200/50 bg-white px-4 py-3 animate-pulse"
          >
            <div className="h-4 w-3/4 bg-zinc-200 rounded-xl" />
            <div className="mt-1 h-3 w-1/2 bg-zinc-100 rounded-xl" />
          </div>
        ))}
      </ul>
    </div>
  );
}
