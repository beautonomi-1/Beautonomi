"use client";

/**
 * Virtual List Component
 * 
 * A performant virtual scrolling list for large datasets.
 * Uses @tanstack/react-virtual for efficient rendering.
 * 
 * @module components/ui/virtual-list
 */

import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Height of each item in pixels */
  itemHeight: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Optional container height (defaults to 400px) */
  containerHeight?: number;
  /** Optional className for the container */
  className?: string;
  /** Optional className for each item */
  itemClassName?: string;
  /** Optional estimated item size for dynamic heights */
  estimateSize?: (index: number) => number;
  /** Optional overscan (number of items to render outside viewport) */
  overscan?: number;
}

export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  containerHeight = 400,
  className,
  itemClassName,
  estimateSize,
  overscan = 5,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: estimateSize || (() => itemHeight),
    overscan,
  });

  const itemsToRender = virtualizer.getVirtualItems();

  return (
    <div className={cn("w-full relative", className)} style={{ height: containerHeight }}>
      <div
        ref={parentRef}
        className="w-full h-full overflow-auto"
      >
        <div
          className="relative w-full"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${itemsToRender[0]?.start ?? 0}px)`,
            }}
          >
            {itemsToRender.map((virtualItem) => (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                className={itemClassName}
                style={{
                  height: `${virtualItem.size}px`,
                }}
              >
                {renderItem(items[virtualItem.index], virtualItem.index)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Virtual Table Component
 * 
 * A virtual scrolling table for large datasets using div-based rows.
 */
interface VirtualTableProps<T> {
  items: T[];
  itemHeight: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  containerHeight?: number;
  className?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export function VirtualTable<T>({
  items,
  itemHeight,
  renderRow,
  containerHeight = 400,
  className,
  header,
  footer,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 5,
  });

  const itemsToRender = virtualizer.getVirtualItems();

  return (
    <div className={cn("flex flex-col", className)}>
      {header}
      <div
        ref={parentRef}
        className="relative w-full overflow-auto"
        style={{ height: containerHeight }}
      >
        <div
          className="relative w-full"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${itemsToRender[0]?.start ?? 0}px)`,
            }}
          >
            {itemsToRender.map((virtualItem) => (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  height: `${virtualItem.size}px`,
                }}
              >
                {renderRow(items[virtualItem.index], virtualItem.index)}
              </div>
            ))}
          </div>
        </div>
      </div>
      {footer}
    </div>
  );
}

/**
 * Virtual HTML Table Component
 *
 * Renders a semantic <table> with virtualized <tbody> rows.
 * The <thead> stays pinned while the body scrolls.
 */
interface VirtualHtmlTableProps<T> {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  thead: React.ReactNode;
  containerHeight?: number;
  className?: string;
  tableClassName?: string;
  overscan?: number;
}

export function VirtualHtmlTable<T>({
  items,
  rowHeight,
  renderRow,
  thead,
  containerHeight = 600,
  className,
  tableClassName,
  overscan = 10,
}: VirtualHtmlTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className={cn("overflow-hidden", className)}>
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ maxHeight: containerHeight }}
      >
        <table className={cn("w-full", tableClassName)}>
          {thead}
          <tbody>
            {virtualItems.length > 0 && (
              <tr style={{ height: virtualItems[0].start }} aria-hidden>
                <td colSpan={999} />
              </tr>
            )}
            {virtualItems.map((virtualItem) => {
              const item = items[virtualItem.index];
              return (
                <React.Fragment key={virtualItem.key}>
                  {renderRow(item, virtualItem.index)}
                </React.Fragment>
              );
            })}
            {virtualItems.length > 0 && (
              <tr
                style={{
                  height:
                    virtualizer.getTotalSize() -
                    (virtualItems[virtualItems.length - 1].end),
                }}
                aria-hidden
              >
                <td colSpan={999} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
