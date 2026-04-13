import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Dense admin list/table shell per ADMIN_SPA_UI_CONVENTIONS §4.
 * On small screens use horizontal scroll; prefer `AdminDataList` for card stacks.
 */
export function AdminDataTable({
  children,
  className,
  tableClassName,
}: {
  children: ReactNode;
  className?: string;
  tableClassName?: string;
}) {
  return (
    <div
      className={cn(
        "-mx-1 overflow-x-auto rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-gray-950/[0.04] sm:mx-0",
        className
      )}
    >
      <table
        className={cn("w-full min-w-[min(100%,720px)] border-collapse text-left text-sm text-gray-900", tableClassName)}
      >
        {children}
      </table>
    </div>
  );
}

export function AdminTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-gray-200 bg-gradient-to-b from-gray-50/90 to-gray-50/50 text-xs font-semibold uppercase tracking-wide text-gray-600">
      {children}
    </thead>
  );
}

export function AdminTableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-gray-100">{children}</tbody>;
}

export function AdminTh({
  children,
  className = "",
  scope = "col",
}: {
  children?: ReactNode;
  className?: string;
  scope?: "col" | "row";
}) {
  return (
    <th scope={scope} className={`px-3 py-3 text-left font-medium md:px-4 ${className}`}>
      {children}
    </th>
  );
}

export function AdminTd({
  children,
  className = "",
  colSpan,
  title,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
  /** Native tooltip on hover (e.g. full ISO timestamp). */
  title?: string;
}) {
  return (
    <td colSpan={colSpan} className={`px-3 py-3 align-top md:px-4 ${className}`} title={title}>
      {children}
    </td>
  );
}
