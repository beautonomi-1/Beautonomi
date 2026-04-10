import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, RotateCcw, Mail } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
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
import { adminToast } from "@/lib/adminToast";
import { useAdminSession } from "@/providers/AdminSessionProvider";

const ADMIN_ROLES = [
  "superadmin",
  "admin_support",
  "admin_finance",
  "admin_trust",
  "admin_content",
  "admin_ecommerce",
  "admin_marketing",
  "admin_integrations",
  "admin_operations",
  "admin_platform_config",
  "support_agent",
] as const;

type AdminRole = (typeof ADMIN_ROLES)[number];

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  admin_support: "Support Admin",
  admin_finance: "Finance Admin",
  admin_trust: "Trust & Safety Admin",
  admin_content: "Content Admin",
  admin_ecommerce: "E-commerce Admin",
  admin_marketing: "Marketing Admin",
  admin_integrations: "Integrations Admin",
  admin_operations: "Operations Admin",
  admin_platform_config: "Platform Config Admin",
  support_agent: "Support Agent",
};

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-violet-100 text-violet-800",
  admin_support: "bg-blue-100 text-blue-800",
  admin_finance: "bg-emerald-100 text-emerald-800",
  admin_trust: "bg-red-100 text-red-800",
  admin_content: "bg-orange-100 text-orange-800",
  admin_ecommerce: "bg-yellow-100 text-yellow-800",
  admin_marketing: "bg-pink-100 text-pink-800",
  admin_integrations: "bg-cyan-100 text-cyan-800",
  admin_operations: "bg-indigo-100 text-indigo-800",
  admin_platform_config: "bg-purple-100 text-purple-800",
  support_agent: "bg-gray-100 text-gray-800",
};

type AdminMember = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  avatar_url: string | null;
  created_at: string;
  deactivated_at: string | null;
  last_sign_in_at?: string | null;
};

type AdminTeamPayload = {
  members: AdminMember[];
  total: number;
};

const DEFAULT_INVITE = { email: "", full_name: "", role: "admin_support" as AdminRole };

function RoleBadge({ role }: { role: string }) {
  const color = ROLE_COLORS[role] ?? "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export function AdminTeamPage() {
  const qc = useQueryClient();
  const { allowed, denied } = useSuperadminPage("Admin team management is superadmin-only.");
  const { bootstrap } = useAdminSession();
  const currentUserId = bootstrap?.userId;

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState(DEFAULT_INVITE);
  const [editMember, setEditMember] = useState<AdminMember | null>(null);
  const [editRole, setEditRole] = useState<AdminRole>("admin_support");
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  const qk = ["admin", "admin-team"] as const;

  const q = useQuery({
    queryKey: qk,
    queryFn: () => adminApi.getJson<AdminTeamPayload>("/api/admin/settings/admin-team", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: qk });

  const inviteMut = useMutation({
    mutationFn: (body: typeof inviteForm) =>
      adminApi.postJson<{ message?: string; action?: string }>("/api/admin/settings/admin-team", body),
    onSuccess: (res) => {
      setInviteResult(res?.message ?? "Done.");
      adminToast.success(res?.message ?? "Admin invited");
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/settings/admin-team/${encodeURIComponent(id)}`, body),
    onSuccess: () => {
      setEditMember(null);
      adminToast.success("Role updated");
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const deactivateMut = useMutation({
    mutationFn: ({ id, deactivate }: { id: string; deactivate: boolean }) =>
      adminApi.patchJson(`/api/admin/settings/admin-team/${encodeURIComponent(id)}`, {
        deactivated_at: deactivate ? new Date().toISOString() : null,
      }),
    onSuccess: () => {
      adminToast.success("Status updated");
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) =>
      adminApi.deleteJson(`/api/admin/settings/admin-team/${encodeURIComponent(id)}`),
    onSuccess: () => {
      adminToast.success("Admin access removed");
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const members = q.data?.members ?? [];

  const filtered = useMemo(() => {
    let list = members;
    if (roleFilter !== "all") list = list.filter((m) => m.role === roleFilter);
    if (!searchQuery.trim()) return list;
    const qv = searchQuery.toLowerCase();
    return list.filter(
      (m) =>
        (m.full_name ?? "").toLowerCase().includes(qv) ||
        (m.email ?? "").toLowerCase().includes(qv)
    );
  }, [members, roleFilter, searchQuery]);

  const isActive = (m: AdminMember) => !m.deactivated_at;

  if (denied) return denied;
  if (!allowed) return <PermissionDenied />;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Admin team" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={(q.error as Error).message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Admin team"
        description="Platform administrators and their role access. Only superadmins can invite, promote, or remove admin access."
      />

      <AdminMutationAlert
        errors={[
          patchMut.error instanceof Error ? patchMut.error : null,
          deactivateMut.error instanceof Error ? deactivateMut.error : null,
          removeMut.error instanceof Error ? removeMut.error : null,
        ]}
      />

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Total admins", members.length, "text-gray-900"],
          ["Active", members.filter(isActive).length, "text-green-700"],
          ["Deactivated", members.filter((m) => !isActive(m)).length, "text-red-600"],
        ].map(([label, val, cls]) => (
          <AdminPanel key={String(label)} className="!p-4">
            <div className={`text-2xl font-bold ${cls}`}>{val}</div>
            <div className="mt-0.5 text-xs text-gray-500">{label}</div>
          </AdminPanel>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={adminToolbarButtonClass(false) + " inline-flex items-center gap-1.5"}
          onClick={() => { setShowInvite(true); setInviteForm(DEFAULT_INVITE); setInviteResult(null); }}
        >
          <UserPlus className="h-4 w-4" />
          Invite admin
        </button>
        <button
          type="button"
          className={adminToolbarButtonClass(q.isFetching)}
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <input
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20"
          placeholder="Search name or email…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">All roles</option>
          {ADMIN_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No admin users found"
          description={
            members.length === 0
              ? "No platform admins yet. Invite one using the button above."
              : "No results match your filters."
          }
        />
      ) : (
        <AdminPanel className="overflow-x-auto">
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Name</AdminTh>
                <AdminTh>Email</AdminTh>
                <AdminTh>Role</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Last sign-in</AdminTh>
                <AdminTh>Joined</AdminTh>
                <AdminTh>Actions</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {filtered.map((m) => {
                const isSelf = m.id === currentUserId;
                const active = isActive(m);
                return (
                  <tr key={m.id} className={active ? "" : "opacity-60"}>
                    <AdminTd className="font-medium">
                      {m.full_name ?? <span className="text-gray-400 italic">No name</span>}
                      {isSelf && (
                        <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">you</span>
                      )}
                    </AdminTd>
                    <AdminTd>
                      <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-xs">
                        <Mail className="h-3 w-3" />
                        {m.email}
                      </a>
                    </AdminTd>
                    <AdminTd>
                      <RoleBadge role={m.role} />
                    </AdminTd>
                    <AdminTd>
                      <span className={`text-xs font-medium ${active ? "text-green-700" : "text-red-600"}`}>
                        {active ? "Active" : "Deactivated"}
                      </span>
                    </AdminTd>
                    <AdminTd className="text-xs text-gray-500">
                      {m.last_sign_in_at
                        ? new Date(m.last_sign_in_at).toLocaleDateString()
                        : "Never"}
                    </AdminTd>
                    <AdminTd className="text-xs text-gray-500">
                      {new Date(m.created_at).toLocaleDateString()}
                    </AdminTd>
                    <AdminTd>
                      <div className="flex flex-wrap gap-2">
                        {!isSelf && (
                          <>
                            <button
                              type="button"
                              className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
                              onClick={() => { setEditMember(m); setEditRole(m.role as AdminRole); }}
                            >
                              Change role
                            </button>
                            <button
                              type="button"
                              disabled={deactivateMut.isPending}
                              className="text-xs text-orange-600 hover:underline disabled:opacity-50"
                              onClick={() =>
                                void deactivateMut.mutate({ id: m.id, deactivate: active })
                              }
                            >
                              {active ? "Deactivate" : "Reactivate"}
                            </button>
                            <button
                              type="button"
                              disabled={removeMut.isPending}
                              className="text-xs text-red-600 hover:underline disabled:opacity-50"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Remove admin access for ${m.full_name ?? m.email}? Their role will be downgraded to customer.`
                                  )
                                ) {
                                  void removeMut.mutate(m.id);
                                }
                              }}
                            >
                              Remove access
                            </button>
                          </>
                        )}
                      </div>
                    </AdminTd>
                  </tr>
                );
              })}
            </AdminTableBody>
          </AdminDataTable>
        </AdminPanel>
      )}

      {/* Invite Modal */}
      <AdminModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        title="Invite admin"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setShowInvite(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={inviteMut.isPending || !inviteForm.email || !inviteForm.full_name}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              onClick={() => void inviteMut.mutate(inviteForm)}
            >
              {inviteMut.isPending ? "Sending…" : "Send invite"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {inviteResult ? (
            <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800">{inviteResult}</div>
          ) : null}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Full name</label>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                placeholder="Jane Smith"
                value={inviteForm.full_name}
                onChange={(e) => setInviteForm((p) => ({ ...p, full_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Email address</label>
              <input
                type="email"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                placeholder="jane@example.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Admin role</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                value={inviteForm.role}
                onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value as AdminRole }))}
              >
                {ADMIN_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-500">
              If the email already has an account, their role will be promoted. Otherwise an invite email will be sent.
            </p>
          </div>
          {inviteMut.error instanceof Error && (
            <p className="text-xs text-red-600">{inviteMut.error.message}</p>
          )}
        </div>
      </AdminModal>

      {/* Change Role Modal */}
      <AdminModal
        open={!!editMember}
        onClose={() => setEditMember(null)}
        title={`Change role — ${editMember?.full_name ?? editMember?.email ?? ""}`}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setEditMember(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={patchMut.isPending || editRole === editMember?.role}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              onClick={() => {
                if (editMember) {
                  void patchMut.mutate({ id: editMember.id, body: { role: editRole } });
                }
              }}
            >
              {patchMut.isPending ? "Saving…" : "Save role"}
            </button>
          </div>
        }
      >
        {editMember && (
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs text-gray-500">
                Current: <RoleBadge role={editMember.role} />
              </p>
              <label className="mb-1 block text-xs font-medium text-gray-700">New role</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as AdminRole)}
              >
                {ADMIN_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            {patchMut.error instanceof Error && (
              <p className="text-xs text-red-600">{patchMut.error.message}</p>
            )}
          </div>
        )}
      </AdminModal>
    </div>
  );
}
