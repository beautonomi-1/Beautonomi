import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Desktop table + mobile card stack (ADMIN_SPA_UI_CONVENTIONS §4).
 */
export type AdminListColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Hide label row on mobile (e.g. when cell is self-explanatory) */
  compactMobile?: boolean;
};

export function AdminDataList<T>({
  columns,
  rows,
  rowKey,
  empty,
  tableMinWidthClass = "min-w-[680px]",
}: {
  columns: AdminListColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  /** Tailwind min-width on &lt;table&gt; for horizontal scroll on narrow desktop */
  tableMinWidthClass?: string;
}) {
  if (rows.length === 0) {
    return empty ?? null;
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-gray-950/[0.04] md:block">
        <table className={cn("w-full border-collapse text-left text-sm text-gray-900", tableMinWidthClass)}>
          <thead className="border-b border-gray-200 bg-gradient-to-b from-gray-50/80 to-gray-50/40 text-xs font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              {columns.map((col) => (
                <th key={col.id} scope="col" className="whitespace-nowrap px-4 py-3.5 font-medium md:px-5">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-gray-50/80">
                {columns.map((col) => (
                  <td key={col.id} className="align-top px-4 py-3.5 text-gray-900 md:px-5">
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-busy={false}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-sm ring-1 ring-gray-950/[0.03]"
          >
            <dl className="space-y-3">
              {columns.map((col) => (
                <div
                  key={col.id}
                  className={cn(
                    "border-b border-gray-100 pb-3 last:border-0 last:pb-0",
                    col.compactMobile && "pb-2"
                  )}
                >
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{col.header}</dt>
                  <dd className="mt-1 break-words text-sm text-gray-900">{col.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
