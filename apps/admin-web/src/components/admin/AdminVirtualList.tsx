import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/cn";

export type AdminVirtualListProps<T> = {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  /** Fixed or per-index row height estimate in px */
  estimateSize?: number | ((index: number) => number);
  /** Only virtualize when item count meets threshold (default 15) */
  threshold?: number;
  /** Gap between items in px (included in row estimate when using fixed estimateSize) */
  gap?: number;
  className?: string;
  /** Scrollport max height, e.g. `calc(100dvh - 14rem)` */
  maxHeight?: string;
  overscan?: number;
  ariaLabel?: string;
};

/**
 * Virtual scroll list for long admin queues (support cards, booking cards, etc.).
 * Falls back to a normal map when under the threshold.
 */
export function AdminVirtualList<T>({
  items,
  renderItem,
  estimateSize = 120,
  threshold = 15,
  gap = 12,
  className,
  maxHeight = "min(70vh, 640px)",
  overscan = 6,
  ariaLabel,
}: AdminVirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = items.length >= threshold;

  const resolveEstimate = (index: number) => {
    const base = typeof estimateSize === "function" ? estimateSize(index) : estimateSize;
    return base + (index < items.length - 1 ? gap : 0);
  };

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? items.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: resolveEstimate,
    overscan,
  });

  if (!shouldVirtualize) {
    return (
      <div className={cn("space-y-3", className)} aria-label={ariaLabel}>
        {items.map((item, index) => (
          <div key={index}>{renderItem(item, index)}</div>
        ))}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={cn("overflow-y-auto pr-1", className)}
      style={{ maxHeight }}
      aria-label={ariaLabel}
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        <div
          className="absolute left-0 top-0 w-full"
          style={{ transform: `translateY(${virtualItems[0]?.start ?? 0}px)` }}
        >
          {virtualItems.map((virtualRow) => (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                paddingBottom: virtualRow.index < items.length - 1 ? gap : 0,
              }}
            >
              {renderItem(items[virtualRow.index], virtualRow.index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
