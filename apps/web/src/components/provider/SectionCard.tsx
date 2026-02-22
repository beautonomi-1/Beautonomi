"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
}

export function SectionCard({ children, className, title, description }: SectionCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 lg:p-6 shadow-sm box-border max-w-full w-full overflow-hidden",
        className
      )}
    >
      {(title || description) && (
        <div className="mb-3 sm:mb-4">
          {title && <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 truncate">{title}</h3>}
          {description && <p className="text-xs sm:text-sm text-gray-600 line-clamp-2 break-words">{description}</p>}
        </div>
      )}
      <div className="w-full max-w-full overflow-hidden box-border">
        {children}
      </div>
    </div>
  );
}
