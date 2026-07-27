import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";

type StaffStatistics = {
  total: number;
  active: number;
  inactive: number;
  by_staff_role: { owner: number; manager: number; employee: number };
  by_user_role: {
    provider_owner: number;
    provider_staff: number;
    customer_with_staff_login?: number;
    no_account: number;
  };
};

type StaffMember = {
  id: string;
  provider_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  user_role?: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_active: boolean;
  commission_percentage: number;
  created_at: string;
  provider?: { id: string; business_name: string; slug: string };
};

type StaffPayload = {
  staff: StaffMember[];
  statistics: StaffStatistics;
};

/** Raw users.role; provider APIs may treat customer+active staff as provider_staff — see page description. */
function formatAccountRoleLabel(m: Pick<StaffMember, "user_id" | "user_role">): string {
  const r = m.user_role ?? "";
  if (!m.user_id) return "—";
  if (r === "provider_owner" || r === "provider_staff") return r;
  if (r === "customer") return "customer (provider app: yes)";
  if (!r) return "—";
  return r;
}

export function StaffListPage() {
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [staffRoleFilter, setStaffRoleFilter] = useState("all");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const qk = useMemo(
    () => adminQueryKeys.staff(`${staffRoleFilter}|${userRoleFilter}|${statusFilter}`),
    [staffRoleFilter, userRoleFilter, statusFilter]
  );

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (staffRoleFilter !== "all") p.set("role", staffRoleFilter);
      if (statusFilter !== "all") p.set("is_active", statusFilter === "active" ? "true" : "false");
      const qs = p.toString();
      return adminApi.getJson<StaffPayload>(`/api/admin/staff${qs ? `?${qs}` : ""}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const staff = q.data?.staff ?? [];
  const statistics = q.data?.statistics;

  const filteredStaff = useMemo(() => {
    let list = staff;
    if (userRoleFilter !== "all") {
      list = list.filter((m) => (m.user_role ?? "") === userRoleFilter);
    }
    if (!searchQuery.trim()) return list;
    const qv = searchQuery.trim().toLowerCase();
    return list.filter(
      (m) =>
        (m.name ?? "").toLowerCase().includes(qv) ||
        (m.email ?? "").toLowerCase().includes(qv) ||
        (m.phone ?? "").toLowerCase().includes(qv) ||
        (m.provider?.business_name ?? "").toLowerCase().includes(qv)
    );
  }, [staff, userRoleFilter, searchQuery]);

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: [...adminQueryKeys.root, "staff"] as const });

  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "employee",
    commission_percentage: 0,
    bio: "",
  });

  const patchStaff = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/staff/${encodeURIComponent(id)}`, body),
    onSuccess: (_data, vars) => {
      setEditing(null);
      invalidate();
      if ("is_active" in vars.body) {
        adminToast.success(vars.body.is_active ? "Staff member activated" : "Staff member deactivated");
      } else {
        adminToast.success("Staff member updated");
      }
    },
    onError: (e: Error) => adminToast.error(`Failed to update staff: ${e.message}`),
  });

  const resetPwd = useMutation({
    mutationFn: (id: string) =>
      adminApi.postJson(`/api/admin/staff/${encodeURIComponent(id)}/reset-password`, {}),
    onSuccess: () => {
      invalidate();
      adminToast.success("Password reset email sent");
    },
    onError: (e: Error) => adminToast.error(`Password reset failed: ${e.message}`),
  });

  const openEdit = (m: StaffMember) => {
    setEditing(m);
    setEditForm({
      name: m.name ?? "",
      email: m.email ?? "",
      phone: m.phone ?? "",
      role: m.role ?? "employee",
      commission_percentage: m.commission_percentage ?? 0,
      bio: m.bio ?? "",
    });
  };

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Staff" />
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
      <AdminPageHeader
        title="Staff"
        description={
          <span className="block max-w-3xl text-sm font-normal leading-relaxed text-gray-600">
            Cross-provider directory of <code className="rounded bg-gray-100 px-1">provider_staff</code> rows.{" "}
            <strong>Account role</strong> is the value stored on <code className="rounded bg-gray-100 px-1">users.role</code>. If it
            shows <code className="rounded bg-gray-100 px-1">customer</code> but this person has a linked login and an{" "}
            <strong>active</strong> staff row, the provider web app and mobile APIs still grant access: the session is treated as{" "}
            <code className="rounded bg-gray-100 px-1">provider_staff</code> for those routes (same pattern as{" "}
            <code className="rounded bg-gray-100 px-1">requireRoleInApi</code> in the API). Use the user admin tools if you need to
            change the stored role to <code className="rounded bg-gray-100 px-1">provider_staff</code> for reporting consistency.
          </span>
        }
      />

      <AdminMutationAlert
        errors={[
          patchStaff.error instanceof Error ? patchStaff.error : null,
          resetPwd.error instanceof Error ? resetPwd.error : null,
        ]}
      />

      {statistics ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
          {[
            ["Total", statistics.total, "text-gray-900"],
            ["Active", statistics.active, "text-green-700"],
            ["Inactive", statistics.inactive, "text-amber-800"],
            ["Owners (account)", statistics.by_user_role?.provider_owner ?? 0, "text-amber-800"],
            ["Staff (account)", statistics.by_user_role?.provider_staff ?? 0, "text-sky-800"],
            [
              "Customer login, staff row",
              statistics.by_user_role?.customer_with_staff_login ?? 0,
              "text-violet-800",
            ],
            ["No linked account", statistics.by_user_role?.no_account ?? 0, "text-gray-600"],
          ].map(([label, val, cls]) => (
            <AdminPanel key={String(label)} className="!p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${cls}`}>{val as number}</p>
            </AdminPanel>
          ))}
        </div>
      ) : null}

      <AdminPanel>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <label className="block min-w-[200px] flex-1 text-sm">
            <span className="text-gray-600">Search</span>
            <input
              className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm"
              placeholder="Name, email, phone, provider…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          <label className="block w-full text-sm lg:w-48">
            <span className="text-gray-600">Account role</span>
            <select
              className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="provider_owner">Provider owner</option>
              <option value="provider_staff">Provider staff</option>
              <option value="customer">Customer (still gets provider app if active staff)</option>
            </select>
          </label>
          <label className="block w-full text-sm lg:w-44">
            <span className="text-gray-600">Staff role</span>
            <select
              className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={staffRoleFilter}
              onChange={(e) => setStaffRoleFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
            </select>
          </label>
          <label className="block w-full text-sm lg:w-40">
            <span className="text-gray-600">Status</span>
            <select
              className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
      </AdminPanel>

      {filteredStaff.length === 0 ? (
        <EmptyState title="No staff" description="Adjust filters or search." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Contact</AdminTh>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Staff role</AdminTh>
              <AdminTh>Account role</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh className="text-right">Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {filteredStaff.map((m) => {
              const prov = m.provider;
              const providerHref = prov?.slug
                ? adminSpaTo(`/admin/providers/${encodeURIComponent(prov.slug)}`)
                : prov?.id
                  ? adminSpaTo(`/admin/providers/${encodeURIComponent(prov.id)}`)
                  : "";
              return (
                <tr key={m.id}>
                  <AdminTd className="font-medium">{m.name}</AdminTd>
                  <AdminTd className="text-xs text-gray-700">
                    <div className="break-all">{m.email ?? "—"}</div>
                    {m.phone ? <div className="text-gray-500">{m.phone}</div> : null}
                  </AdminTd>
                  <AdminTd className="text-xs">
                    {providerHref ? (
                      <Link className="text-primary underline" to={providerHref}>
                        {prov?.business_name ?? prov?.slug}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </AdminTd>
                  <AdminTd>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium">{m.role}</span>
                  </AdminTd>
                  <AdminTd className="text-xs text-gray-600">
                    <span className="font-mono">{formatAccountRoleLabel(m)}</span>
                  </AdminTd>
                  <AdminTd>{m.is_active ? "Yes" : "No"}</AdminTd>
                  <AdminTd className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        className="text-xs font-medium text-primary underline"
                        disabled={patchStaff.isPending}
                        onClick={() =>
                          void patchStaff.mutateAsync({
                            id: m.id,
                            body: { is_active: !m.is_active },
                          })
                        }
                      >
                        {m.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-primary underline"
                        onClick={() => openEdit(m)}
                      >
                        Edit…
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-primary underline"
                        disabled={resetPwd.isPending}
                        onClick={() => {
                          if (!window.confirm(`Send password reset email for ${m.name}?`)) return;
                          void resetPwd.mutateAsync(m.id);
                        }}
                      >
                        Reset password
                      </button>
                    </div>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}

      {editing ? (
        <AdminModal
          open
          onClose={() => setEditing(null)}
          title="Edit staff member"
          description={editing.provider?.business_name ?? ""}
          footer={
            <>
              <button type="button" className={adminToolbarButtonClass(patchStaff.isPending)} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`${adminToolbarButtonClass(patchStaff.isPending)} bg-gray-900 text-white`}
                disabled={patchStaff.isPending}
                onClick={() =>
                  void patchStaff.mutateAsync({
                    id: editing.id,
                    body: {
                      name: editForm.name.trim(),
                      email: editForm.email.trim() || null,
                      phone: editForm.phone.trim() || null,
                      role: editForm.role,
                      commission_percentage: editForm.commission_percentage,
                      bio: editForm.bio.trim() || null,
                    },
                  })
                }
              >
                {patchStaff.isPending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="text-gray-600">Name</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-gray-600">Email</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-gray-600">Phone</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-gray-600">Staff role</span>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={editForm.role}
                onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
              >
                <option value="owner">owner</option>
                <option value="manager">manager</option>
                <option value="employee">employee</option>
              </select>
            </label>
            <label className="block">
              <span className="text-gray-600">Commission %</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={editForm.commission_percentage}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, commission_percentage: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="block">
              <span className="text-gray-600">Bio</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                rows={3}
                value={editForm.bio}
                onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
              />
            </label>
          </div>
        </AdminModal>
      ) : null}
    </div>
  );
}
