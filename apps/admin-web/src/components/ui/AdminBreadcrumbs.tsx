import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { breadcrumbsForPath } from "@/lib/breadcrumbMap";
import { useAdminBreadcrumbContext } from "@/providers/AdminBreadcrumbProvider";
import { adminSpaTo } from "@/lib/adminSpaPath";

/**
 * Global breadcrumb bar rendered inside AdminChrome above the page content.
 * Automatically derives the trail from the current URL via `breadcrumbsForPath`.
 * Detail pages can override the leaf label via `useAdminBreadcrumbLeaf`.
 *
 * Hidden on the dashboard root (no parent to navigate to).
 */
export function AdminBreadcrumbs() {
  const { pathname } = useLocation();
  const { leafLabel } = useAdminBreadcrumbContext();

  const crumbs = breadcrumbsForPath(pathname, leafLabel);

  // Only render when there are 2+ crumbs (leaf + at least one parent)
  if (crumbs.length < 2) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex min-h-0 flex-wrap items-center gap-1 text-xs text-gray-500"
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight className="h-3 w-3 shrink-0 text-gray-300" aria-hidden />
            )}
            {isLast ? (
              <span className="font-medium text-gray-700" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link
                to={adminSpaTo(crumb.href)}
                className="rounded hover:text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
