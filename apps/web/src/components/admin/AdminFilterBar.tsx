"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface AdminFilterBarProps {
  children: React.ReactNode;
  className?: string;
}

const defaultFilterBarClass = "bg-white p-4 rounded-lg border border-gray-200";

/**
 * Wrapper for admin list filter bars: search, selects, clear/apply.
 * Use with flex layout: e.g. flex flex-col md:flex-row gap-4 for search + filters.
 */
export function AdminFilterBar({ children, className }: AdminFilterBarProps) {
  return (
    <div className={cn(defaultFilterBarClass, className)}>
      {children}
    </div>
  );
}
