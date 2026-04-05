"use client";

import { withGlobalCategoryIconCacheBust } from "@beautonomi/utils";
import { cn } from "@/lib/utils";
import {
  isGlobalCategoryIconImageUrl,
  resolveGlobalCategoryLucideIcon,
} from "@/lib/icons/global-category-lucide";

/** Inactive image opacity — tuned to sit near `text-gray-600` Lucide icons in the same row */
const INACTIVE_IMAGE_OPACITY_CLASS = "opacity-[0.52]";

type Props = {
  icon?: string | null;
  className?: string;
  /** Pixel size (Lucide width/height, and image box) */
  size?: number;
  strokeWidth?: number;
  /**
   * For URL/data image icons: full opacity when active, muted when inactive.
   * When omitted, images render muted (same as inactive) so list UIs stay consistent.
   * Pass `true` when the category is selected or the row is “active”.
   */
  isActive?: boolean;
};

/**
 * Global category icon: PascalCase → Lucide/custom SVG component; `/` or `http(s)`/`data:` → `<img>`.
 *
 * All image types (PNG, SVG, WebP, etc.) use one code path: plain `<img>` with fixed width/height
 * (layout stable, works everywhere), `decoding="async"`, no CSS filter hacks — active/inactive is
 * opacity only so colours match across browsers and match raster + vector art.
 */
export function GlobalCategoryIcon({
  icon,
  className,
  size = 24,
  strokeWidth = 1.75,
  isActive,
}: Props) {
  if (isGlobalCategoryIconImageUrl(icon)) {
    const envRev =
      typeof process !== "undefined" ? process.env.NEXT_PUBLIC_CATEGORY_ICON_CACHE_REVISION?.trim() : "";
    const src = withGlobalCategoryIconCacheBust(icon!.trim(), envRev || undefined);
    const layoutPx = Math.max(16, Math.round(size));
    const imageActive = isActive === true;

    return (
      // eslint-disable-next-line @next/next/no-img-element -- DB may store arbitrary CDN URLs; <img> is the most compatible
      <img
        src={src}
        alt=""
        width={layoutPx}
        height={layoutPx}
        className={cn(
          "object-contain shrink-0 select-none pointer-events-none",
          imageActive ? "opacity-100" : INACTIVE_IMAGE_OPACITY_CLASS,
          className
        )}
        loading="lazy"
        decoding="async"
        draggable={false}
        fetchPriority="low"
      />
    );
  }

  const Lucide = resolveGlobalCategoryLucideIcon(icon);
  if (Lucide) {
    return (
      <Lucide
        className={cn("shrink-0", className)}
        width={size}
        height={size}
        strokeWidth={strokeWidth}
        aria-hidden
      />
    );
  }

  if (icon?.trim()) {
    return (
      <span
        className={cn("inline-flex items-center justify-center leading-none shrink-0", className)}
        style={{ fontSize: Math.round(size * 0.92) }}
        aria-hidden
      >
        {icon.trim()}
      </span>
    );
  }

  return null;
}
