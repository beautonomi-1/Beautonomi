import React from "react";

/**
 * Placeholder for AccountHubGrid — matches “More” section layout to limit CLS
 * while the hub chunk or intersection observer loads.
 */
export default function AccountHubSkeleton() {
  return (
    <div
      className="rounded-xl border border-gray-100 bg-white p-4 md:p-6 shadow-sm"
      aria-hidden
    >
      <div className="mb-4 space-y-2">
        <div className="h-5 w-28 rounded bg-gray-200/80 animate-pulse" />
        <div className="h-4 w-[min(100%,16rem)] rounded bg-gray-100/90 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-100 bg-gradient-to-b from-gray-50/90 to-white p-4 md:p-6"
          >
            <div className="mb-3 md:mb-4 h-7 w-7 rounded-md bg-gray-200/70" />
            <div className="mb-2 h-5 w-[72%] max-w-[14rem] rounded bg-gray-200/55" />
            <div className="mb-1.5 h-3.5 w-full rounded bg-gray-100/95" />
            <div className="h-3.5 w-[88%] rounded bg-gray-100/95" />
          </div>
        ))}
      </div>
    </div>
  );
}
