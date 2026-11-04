import { useEffect, useRef, type ReactNode } from "react";
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
  /** When true, short lists use flex-1 min-h-0 overflow-y-auto instead of unbounded space-y-3 */
  fill?: boolean;
  overscan?: number;
  ariaLabel?: string;
  /** Scroll the active row into view (virtualized or plain list). */
  activeIndex?: number | null;
};

const fillScrollClass = "admin-scrollbar min-h-0 flex-1 overflow-y-auto pr-1";

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
  fill = false,
  overscan = 6,
  ariaLabel,
  activeIndex = null,
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

  useEffect(() => {
    if (activeIndex == null || activeIndex < 0 || activeIndex >= items.length) return;
    if (shouldVirtualize) {
      virtualizer.scrollToIndex(activeIndex, { align: "auto" });
      return;
    }
    const el = parentRef.current;
    if (!el) return;
    const row = el.children[activeIndex] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex, items.length, shouldVirtualize, virtualizer]);

  if (!shouldVirtualize) {
    return (
      <div
        ref={parentRef}
        className={cn(fill ? fillScrollClass : "admin-scrollbar space-y-3", className)}
        aria-label={ariaLabel}
      >
        {items.map((item, index) => (
          <div key={index} className={fill && index < items.length - 1 ? "mb-3" : undefined}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={cn("admin-scrollbar overflow-y-auto pr-1", fill && "min-h-0 flex-1", className)}
      style={fill ? undefined : { maxHeight }}
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
