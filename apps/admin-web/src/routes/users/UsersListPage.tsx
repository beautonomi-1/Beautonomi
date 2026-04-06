import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_USERS_TRUST } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useDebouncedUrlParam } from "@/hooks/useDebouncedUrlParam";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminDataList } from "@/components/admin/AdminDataList";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
type UserRow = Record<string, unknown> & {
  id?: string;
  full_name?: string;
  email?: string;
  role?: string;
  created_at?: string;
};

type UsersPayload = {
  data: UserRow[];
  meta: { page: number; limit: number; total: number; has_more: boolean };
};

export function UsersListPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_USERS_TRUST, "Users & trust access is required.");
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const search = sp.get("search") || "";
  const role = sp.get("role") || "";
  const [draftSearch, setDraftSearch] = useDebouncedUrlParam(search, setSp, { param: "search" });
  const qk = useMemo(() => `${page}|${search}|${role}`, [page, search, role]);

  const q = useQuery({
    queryKey: adminQueryKeys.users.list(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "25");
      if (search) p.set("search", search);
      if (role) p.set("role", role);
      return adminApi.getJson<UsersPayload>(`/api/admin/users?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;

  function updateParams(patch: Record<string, string | null>) {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") n.delete(k);
      else n.set(k, v);
    }
    setSp(n, { replace: true });
  }

  const columns = useMemo(
    () => [
      {
        id: "name",
        header: "Name",
        cell: (u: UserRow) => (
          <Link
            className="font-medium text-gray-900 underline decoration-gray-400 underline-offset-2 hover:decoration-gray-900"
            to={String(u.id ?? "")}
          >
            {String(u.full_name ?? "")}
          </Link>
        ),
      },
      { id: "email", header: "Email", cell: (u: UserRow) => <span className="break-all text-gray-700">{String(u.email ?? "")}</span> },
      { id: "role", header: "Role", cell: (u: UserRow) => String(u.role ?? "") },
      {
        id: "created",
        header: "Created",
        cell: (u: UserRow) => <span className="text-gray-600">{String(u.created_at ?? "").slice(0, 10)}</span>,
      },
    ],
    []
  );

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Users" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Users" description="GET /api/admin/users" />
      <AdminPanel>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            type="search"
            placeholder="Search name, email, phone"
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            className="min-h-11 w-full max-w-md rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm"
          />
          <select
            className="min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm sm:w-auto"
            value={role}
            onChange={(e) => updateParams({ role: e.target.value || null, page: "1" })}
          >
            <option value="">All roles</option>
            <option value="customer">customer</option>
            <option value="provider_owner">provider_owner</option>
            <option value="admin_support">admin_support</option>
          </select>
        </div>
        {meta ? (
          <p className="mt-3 text-sm text-gray-600">
            Page {meta.page} of {Math.max(1, Math.ceil(meta.total / meta.limit))} · {meta.total} users
          </p>
        ) : null}
      </AdminPanel>
      <AdminDataList
        columns={columns}
        rows={rows}
        rowKey={(u) => String(u.id ?? "")}
        empty={<EmptyState title="No users" />}
      />
      {meta && meta.total > meta.limit ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(page <= 1)}
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            Previous
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(!meta.has_more)}
            disabled={!meta.has_more}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
