import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";

type AdminQueryBlockProps<T> = {
  query: UseQueryResult<T, Error>;
  /** Shown under the page header while loading. */
  loading?: ReactNode;
  children: (data: T) => ReactNode;
};

/**
 * Standard fetch lifecycle for admin pages: loading skeleton, 403 → PermissionDenied, else retry.
 * Place **below** `AdminPageHeader`; gate the query with `enabled: allowed` after section/superadmin checks.
 */
export function AdminQueryBlock<T>({ query, loading, children }: AdminQueryBlockProps<T>) {
  if (query.isPending || query.isLoading) {
    return <>{loading ?? <AdminPanel><AdminPageSkeleton rows={5} /></AdminPanel>}</>;
  }

  if (query.error) {
    if (isAdminApiAuthFailure(query.error)) {
      return <PermissionDenied />;
    }
    return (
      <AdminPanel>
        <AdminRetryBlock message={query.error.message} onRetry={() => void query.refetch()} />
      </AdminPanel>
    );
  }

  return <>{children(query.data as T)}</>;
}
