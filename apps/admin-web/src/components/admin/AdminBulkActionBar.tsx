import type { ReactNode } from "react";
import { X } from "lucide-react";

export interface AdminBulkActionBarProps {
  /** Number of currently selected items. */
  selectedCount: number;
  /** Called to deselect all items. */
  onClear: () => void;
  /** Bulk action buttons to render. */
  children: ReactNode;
  /** Extra Tailwind classes — e.g. "mb-4" for spacing in a list layout. */
  className?: string;
}

/**
 * Sticky bulk-action bar that appears when one or more list items are selected.
 * Renders sticky at the top of the scroll container (z-20) so it stays visible
 * as the user scrolls the table.
 * Returns null when no items are selected so it can be rendered unconditionally.
 */
export function AdminBulkActionBar({
  selectedCount,
  onClear,
  children,
  className = "",
}: AdminBulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm shadow-sm ${className}`}
    >
      <span className="font-medium text-primary">
        {selectedCount} selected
      </span>
      <button
        type="button"
        className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
        onClick={onClear}
      >
        <X className="h-3 w-3" />
        Clear
      </button>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
