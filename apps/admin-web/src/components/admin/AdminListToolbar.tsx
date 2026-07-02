import { useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface AdminListToolbarFilter {
  key: string;
  label: string;
  type: "select" | "date";
  options?: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export interface AdminListToolbarProps {
  /** Current search text value. */
  searchValue: string;
  /** Called when the search input changes (debounced by the parent or immediate). */
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Optional scope selector (e.g. market/tenant picker) rendered inline. */
  scopeSelector?: ReactNode;
  /** Collapsible advanced filter fields. */
  filters?: AdminListToolbarFilter[];
  /** Whether any filter (excluding search) is active — drives "Clear filters" button. */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  /** Optional extra actions rendered on the right of the toolbar. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Standardised list-page toolbar: search input, optional scope selector, and
 * an expandable advanced-filters drawer. Callers manage state externally so
 * this component stays stateless for search/filters (local state only for the
 * collapse toggle).
 */
export function AdminListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  scopeSelector,
  filters = [],
  hasActiveFilters,
  onClearFilters,
  actions,
  className,
}: AdminListToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Primary bar: search + scope + action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex min-w-0 flex-1 basis-64 items-center rounded-xl border border-gray-200 bg-white shadow-sm">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 shrink-0 text-gray-400" />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full rounded-xl bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-gray-400"
          />
          {searchValue && (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-2 rounded-md p-1 hover:bg-gray-100"
              onClick={() => onSearchChange("")}
            >
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          )}
        </div>

        {scopeSelector}

        {filters.length > 0 && (
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={cn(
              "flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm transition-colors",
              filtersOpen || hasActiveFilters
                ? "border-primary/30 bg-primary/5 text-primary"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {hasActiveFilters && (
              <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-white">
                •
              </span>
            )}
          </button>
        )}

        {hasActiveFilters && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="flex h-10 items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-500 hover:bg-gray-50"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}

        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Expandable filters drawer */}
      {filtersOpen && filters.length > 0 && (
        <div className="grid gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filters.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-medium text-gray-600">{f.label}</label>
              {f.type === "select" ? (
                <select
                  value={f.value}
                  onChange={(e) => f.onChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
                >
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="date"
                  value={f.value}
                  onChange={(e) => f.onChange(e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
