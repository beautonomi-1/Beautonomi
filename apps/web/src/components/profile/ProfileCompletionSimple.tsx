"use client";

import React from "react";
import type { CompletionData } from "@/types/profile";

interface ProfileCompletionSimpleProps {
  completionData: CompletionData;
  onCompleteClick?: () => void;
  onItemClick?: (itemId: string) => void;
}

export default function ProfileCompletionSimple({
  completionData,
  onCompleteClick,
  onItemClick,
}: ProfileCompletionSimpleProps) {
  const { percentage, completed, total, topItems } = completionData;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 md:p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-zinc-900">Profile strength</h3>
        <p className="text-sm text-zinc-600 mt-0.5">
          {completed} of {total} completed · {percentage}%
        </p>
        <div className="mt-3 h-2 w-full rounded-full bg-zinc-100 overflow-hidden" aria-hidden>
          <div
            className="h-full rounded-full bg-[#FF0077]"
            style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
          />
        </div>
      </div>

      {topItems.length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-xs font-medium text-zinc-700">Next steps</p>
          <ul className="space-y-2">
            {topItems.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onItemClick?.(item.id)}
                  className="w-full text-left rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 hover:bg-zinc-100"
                >
                  <span className="text-zinc-500 mr-2 tabular-nums">{index + 1}.</span>
                  {item.label}
                  {item.timeEstimate ? (
                    <span className="block text-xs text-zinc-500 mt-0.5">{item.timeEstimate}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onCompleteClick}
        className="w-full rounded-xl bg-[#FF0077] px-4 py-3 text-sm font-medium text-white hover:opacity-95"
      >
        Complete profile
      </button>
    </div>
  );
}
