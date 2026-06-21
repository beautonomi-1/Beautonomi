"use client";

import React from "react";
import { BeautonomiMark } from "./BeautonomiMark";

type BrowserFrameProps = {
  children: React.ReactNode;
  title?: string;
  url?: string;
  className?: string;
};

export function BrowserFrame({ children, title = "Beautonomi", url = "beautonomi.co.za", className }: BrowserFrameProps) {
  return (
    <div className={`relative mx-auto w-full max-w-2xl ${className ?? ""}`}>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-gray-900/10">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
            <BeautonomiMark className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate text-xs text-gray-500">{url}</span>
          </div>
          <span className="hidden text-xs font-medium text-gray-700 sm:inline">{title}</span>
        </div>
        <div className="max-h-[480px] overflow-y-auto bg-gray-50 p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
