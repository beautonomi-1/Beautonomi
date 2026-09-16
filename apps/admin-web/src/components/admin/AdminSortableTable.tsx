import type { ReactNode } from "react";
import { ArrowUpDown, LayoutGrid, Rows3 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  useAdminTableDensity,
  type AdminTableDensity,
} from "@/hooks/useAdminTableDensity";

export type AdminSortableColumn = {
  id: string;
  label: string;
  /** When set, renders a clickable sort header for this column key. */
  sortKey?: string;
  className?: string;
  header?: ReactNode;
};

export interface AdminSortableTableProps {
  columns: AdminSortableColumn[];
  children: ReactNode;
  /** Current URL sort column */
  sortBy?: string;
  /** Current URL sort direction */
  sortDir?: "asc" | "desc";
  /** Called when a sortable header is clicked */
  onSort?: (column: string) => void;
  /** Pin thead while scrolling */
  stickyHeader?: boolean;
  /** localStorage key for density preference */
  densityStorageKey?: string;
  /** Controlled density (optional — uses internal hook when storageKey is set) */
  density?: AdminTableDensity;
  onDensityChange?: (density: AdminTableDensity) => void;
  className?: string;
  tableClassName?: string;
  minWidthClass?: string;
  toolbar?: ReactNode;
  empty?: ReactNode;
  isEmpty?: boolean;
}

function SortHeaderButton({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  column: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSort?: (column: string) => void;
}) {
  const active = sortBy === column;
  return (
    <button
      type="button"
      onClick={() => onSort?.(column)}
      className="group inline-flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 hover:text-gray-900"
    >
      {label}
      <ArrowUpDown
        className={cn(
          "h-3 w-3 transition-colors",
          active ? "text-gray-900" : "text-gray-300 group-hover:text-gray-500",
        )}
        aria-hidden
      />
      {active ? (
        <span className="text-[9px] text-gray-400">{sortDir === "asc" ? "↑" : "↓"}</span>
      ) : null}
    </button>
  );
}

function DensityToggle({
  density,
  onChange,
}: {
  density: AdminTableDensity;
  onChange: (next: AdminTableDensity) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        aria-label="Comfortable density"
        title="Comfortable density"
        onClick={() => onChange("comfortable")}
        className={cn(
          "inline-flex min-h-9 min-w-9 items-center justify-center rounded-l-xl px-2.5",
          density === "comfortable" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50",
        )}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Compact density"
        title="Compact density"
        onClick={() => onChange("compact")}
        className={cn(
          "inline-flex min-h-9 min-w-9 items-center justify-center rounded-r-xl px-2.5",
          density === "compact" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50",
        )}
      >
        <Rows3 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Sortable admin table shell with optional sticky header and density toggle.
 * Sort state is URL-driven — pass `sortBy` / `sortDir` / `onSort` from the page.
 */
export function AdminSortableTable({
  columns,
  children,
  sortBy,
  sortDir = "desc",
  onSort,
  stickyHeader = false,
  densityStorageKey,
  density: controlledDensity,
  onDensityChange,
  className,
  tableClassName,
  minWidthClass = "min-w-[680px]",
  toolbar,
  empty,
  isEmpty,
}: AdminSortableTableProps) {
  const internalDensity = useAdminTableDensity(densityStorageKey ?? "admin-table-density-default");
  const density = controlledDensity ?? (densityStorageKey ? internalDensity.density : "comfortable");
  const setDensity = onDensityChange ?? (densityStorageKey ? internalDensity.setDensity : undefined);
  const headerPad = density === "compact" ? "py-2" : "py-3.5";

  if (isEmpty && empty) {
    return <>{empty}</>;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {(toolbar || densityStorageKey) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">{toolbar}</div>
          {densityStorageKey && setDensity ? (
            <DensityToggle density={density} onChange={setDensity} />
          ) : null}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-gray-950/[0.04]">
        <table
          className={cn(
            "w-full border-collapse text-left text-sm text-gray-900",
            minWidthClass,
            tableClassName,
          )}
        >
          <thead
            className={cn(
              "border-b border-gray-200 bg-gradient-to-b from-gray-50/80 to-gray-50/40 text-xs font-semibold uppercase tracking-wide text-gray-600",
              stickyHeader && "sticky top-0 z-10 backdrop-blur-sm",
            )}
          >
            <tr>
              {columns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  className={cn("whitespace-nowrap px-4 font-medium md:px-5", headerPad, col.className)}
                >
                  {col.header ??
                    (col.sortKey && onSort ? (
                      <SortHeaderButton
                        label={col.label}
                        column={col.sortKey}
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={onSort}
                      />
                    ) : (
                      col.label
                    ))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            className={cn(
              "divide-y divide-gray-100",
              density === "compact" && "[&_td]:!py-1.5 [&_th]:!py-2",
            )}
          >
            {children}
          </tbody>
        </table>
      </div>
    </div>
  );
}
