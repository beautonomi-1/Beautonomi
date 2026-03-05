"use client";

import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/** Beautonomi logo used as loading indicator (e.g. lazy-loaded pages). */
export function BeautonomiLoadingIcon({
  className,
  size = 48,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={cn("inline-flex shrink-0 animate-pulse", className)}
      aria-hidden
    >
      <Image
        src="/images/logo.svg"
        alt=""
        width={size}
        height={size}
        className="object-contain"
      />
    </div>
  );
}
