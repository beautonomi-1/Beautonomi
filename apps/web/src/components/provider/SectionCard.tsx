"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  headerAction?: ReactNode;
}

export function SectionCard({ children, className, title, description, headerAction }: SectionCardProps) {
  return (
    <div
      className={cn(
        "provider-surface box-border max-w-full w-full overflow-hidden",
        className
      )}
    >
      {(title || description || headerAction) && (
        <div className="mb-4 sm:mb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
          <div className="min-w-0 flex-1">
            {title && <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-0.5 truncate">{title}</h3>}
            {description && <p className="text-sm text-gray-500 line-clamp-2 break-words">{description}</p>}
          </div>
          {headerAction && (
            <div className="flex-shrink-0 flex items-center gap-2">{headerAction}</div>
          )}
        </div>
      )}
      <div className="w-full max-w-full overflow-hidden box-border">
        {children}
      </div>
    </div>
  );
}
