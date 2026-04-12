import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_USERS_TRUST } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminToast } from "@/lib/adminToast";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useDebouncedUrlParam } from "@/hooks/useDebouncedUrlParam";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { useAdminSession } from "@/providers/AdminSessionProvider";
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
import { CompliancePurgeUserModal } from "@/components/admin/CompliancePurgeUserModal";
import { adminSpaTo } from "@/lib/adminSpaPath";

const SIGNUP_SOURCE_LABELS: Record<string, string> = {
  google: "Google",
  social_instagram: "Instagram",
  social_facebook: "Facebook",
  social_twitter: "X",
  friend_or_family: "Friend or family",
  blog_or_article: "Blog or article",
  app_store: "App Store",
  provider_referral: "Provider referral",
  other: "Other",
};

/** Superadmin role endpoint — keep in sync with `api/admin/users/[id]/role/route.ts`. */
const MANAGEABLE_USER_ROLES = [
  "customer",
  "provider_owner",
  "provider_staff",
  "support_agent",
  "admin_support",
  "admin_finance",
  "admin_trust",
  "admin_content",
  "admin_ecommerce",
  "admin_marketing",
  "admin_integrations",
  "admin_operations",
  "admin_platform_config",
  "superadmin",
] as const;

type UserRow = Record<string, unknown> & {
  id?: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  role?: string;
  created_at?: string;
  deactivated_at?: string | null;
  signup_source?: string | null;
  stats?: { booking_count?: number; provider_count?: number };
};

type UsersPayload = {
  data: UserRow[];
  meta: { page: number; limit: number; total: number; has_more: boolean };
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

export function UsersListPage() {
  useAdminDocumentTitle("Users");
  const qc = useQueryClient();
  const { bootstrap } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin === true;
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_USERS_TRUST, "Users & trust access is required.");
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const search = sp.get("search") || "";
  const role = sp.get("role") || "";
  const signupSource = sp.get("signup_source") || "";
  const [draftSearch, setDraftSearch] = useDebouncedUrlParam(search, setSp, { param: "search" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [purgeUser, setPurgeUser] = useState<{ id: string; email: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    full_name: "",
    phone: "",
    role: "customer" as (typeof MANAGEABLE_USER_ROLES)[number],
  });

  const qk = useMemo(() => `${page}|${search}|${role}|${signupSource}`, [page, search, role, signupSource]);

  const q = useQuery({
    queryKey: adminQueryKeys.users.list(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "50");
      if (search) p.set("search", search);
      if (role) p.set("role", role);
      if (signupSource) p.set("signup_source", signupSource);
      return adminApi.getJson<UsersPayload>(`/api/admin/users?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;

  const invalidateUsers = () => {
    void qc.invalidateQueries({ queryKey: adminQueryKeys.users.all() });
  };

  const bulkPost = useMutation({
    mutationFn: (body: { user_ids: string[]; action: string; reason?: string | null }) =>
      adminApi.postJson("/api/admin/users/bulk", body),
    onSuccess: (_data, vars) => {
      const count = vars.user_ids.length;
      setSelectedIds(new Set());
      invalidateUsers();
      adminToast.success(`${count} user${count !== 1 ? "s" : ""} ${vars.action === "suspend" ? "suspended" : vars.action}d`);
    },
    onError: (e: Error) => adminToast.error(`Bulk action failed: ${e.message}`),
  });

  const patchUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/users/${encodeURIComponent(id)}`, body),
    onSuccess: (_data, vars) => {
      invalidateUsers();
      if ("is_active" in vars.body) {
        adminToast.success(vars.body.is_active ? "User activated" : "User deactivated");
      } else {
        adminToast.success("User updated");
      }
    },
    onError: (e: Error) => adminToast.error(`Failed to update user: ${e.message}`),
  });

  const rolePut = useMutation({
    mutationFn: ({ id, role: next }: { id: string; role: string }) =>
      adminApi.putJson(`/api/admin/users/${encodeURIComponent(id)}/role`, { role: next }),
    onSuccess: () => {
      invalidateUsers();
      adminToast.success("User role updated");
    },
    onError: (e: Error) => adminToast.error(`Failed to update role: ${e.message}`),
  });

  const createUser = useMutation({
    mutationFn: () =>
      adminApi.postJson<unknown>("/api/admin/users", {
        email: createForm.email.trim(),
        password: createForm.password,
        full_name: createForm.full_name.trim(),
        phone: createForm.phone.trim() || undefined,
        role: createForm.role,
      }),
    onSuccess: () => {
      setShowCreate(false);
      setCreateForm({ email: "", password: "", full_name: "", phone: "", role: "customer" });
      invalidateUsers();
      adminToast.success("User created successfully");
    },
    onError: (e: Error) => adminToast.error(`Failed to create user: ${e.message}`),
  });

  function updateParams(patch: Record<string, string | null>) {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") n.delete(k);
      else n.set(k, v);
    }
    setSp(n, { replace: true });
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectAllOnPage(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    const ids = rows.map((r) => str(r.id)).filter(Boolean);
    setSelectedIds(new Set(ids));
  }

  const pageIds = useMemo(() => new Set(rows.map((r) => str(r.id)).filter(Boolean)), [rows]);
  const allPageSelected = pageIds.size > 0 && [...pageIds].every((id) => selectedIds.has(id));

  async function runBulk(action: "activate" | "deactivate" | "delete") {
    const user_ids = [...selectedIds];
    if (user_ids.length === 0) return;

    if (action === "activate") {
      if (!window.confirm(`Activate ${user_ids.length} user(s)?`)) return;
      await bulkPost.mutateAsync({ user_ids, action: "activate" });
      return;
    }
    if (action === "deactivate") {
      if (!window.confirm(`Deactivate ${user_ids.length} user(s)?`)) return;
      const reason = window.prompt("Reason (optional):") ?? "";
      await bulkPost.mutateAsync({ user_ids, action: "deactivate", reason: reason.trim() || null });
      return;
    }
    if (action === "delete") {
      const confirmation = window.prompt(
        `WARNING: Permanently delete ${user_ids.length} user(s). Type DELETE to confirm:`
      );
      if (confirmation !== "DELETE") return;
      await bulkPost.mutateAsync({ user_ids, action: "delete" });
    }
  }

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
      <AdminPageHeader
        title="Users"
        description="Search, filter, bulk actions, and compliance purge (superadmin). Matches legacy admin capabilities."
      />

      <AdminMutationAlert
        errors={[
          bulkPost.error instanceof Error ? bulkPost.error : null,
          patchUser.error instanceof Error ? patchUser.error : null,
          rolePut.error instanceof Error ? rolePut.error : null,
          createUser.error instanceof Error ? createUser.error : null,
        ]}
      />

      {isSuperadmin ? (
        <AdminPanel>
          <button
            type="button"
            className={adminToolbarButtonClass(false)}
            onClick={() => setShowCreate((s) => !s)}
          >
            {showCreate ? "Hide create user" : "Create user (superadmin)"}
          </button>
          {showCreate ? (
            <div className="mt-4 grid max-w-lg gap-3 border-t border-gray-100 pt-4 text-sm">
              <p className="text-gray-600">
                Creates a confirmed Auth user and <span className="font-mono">users</span> row (same as legacy POST{" "}
                <span className="font-mono">/api/admin/users</span>).
              </p>
              <label className="block">
                <span className="text-gray-600">Email</span>
                <input
                  type="email"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-gray-600">Password (min 8)</span>
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                />
              </label>
              <label className="block">
                <span className="text-gray-600">Full name</span>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-gray-600">Phone (optional)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-gray-600">Role</span>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      role: e.target.value as (typeof MANAGEABLE_USER_ROLES)[number],
                    }))
                  }
                >
                  {MANAGEABLE_USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={`self-start ${adminToolbarButtonClass(createUser.isPending)}`}
                disabled={
                  createUser.isPending ||
                  createForm.password.length < 8 ||
                  !createForm.email.trim() ||
                  !createForm.full_name.trim()
                }
                onClick={() => void createUser.mutateAsync()}
              >
                {createUser.isPending ? "Creating…" : "Create user"}
              </button>
            </div>
          ) : null}
        </AdminPanel>
      ) : null}

      <AdminPanel>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <label className="block min-w-[200px] flex-1 text-sm">
            <span className="text-gray-600">Search</span>
            <input
              type="search"
              placeholder="Name, email, phone"
              value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
          <label className="block w-full min-w-[160px] text-sm lg:w-auto">
            <span className="text-gray-600">Role</span>
            <select
              className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm lg:w-52"
              value={role}
              onChange={(e) => updateParams({ role: e.target.value || null, page: "1" })}
            >
              <option value="">All roles</option>
              {MANAGEABLE_USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block w-full min-w-[160px] text-sm lg:w-auto">
            <span className="text-gray-600">Signup source</span>
            <select
              className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm lg:w-52"
              value={signupSource}
              onChange={(e) => updateParams({ signup_source: e.target.value || null, page: "1" })}
            >
              <option value="">All sources</option>
              {Object.entries(SIGNUP_SOURCE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {meta ? (
          <p className="mt-3 text-sm text-gray-600">
            Page {meta.page} of {Math.max(1, Math.ceil(meta.total / meta.limit))} · {meta.total} users
          </p>
        ) : null}
      </AdminPanel>

      {selectedIds.size > 0 ? (
        <AdminPanel>
          <p className="text-sm font-medium text-gray-900">{selectedIds.size} selected</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={adminToolbarButtonClass(bulkPost.isPending)}
              disabled={bulkPost.isPending}
              onClick={() => void runBulk("activate")}
            >
              Activate
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(bulkPost.isPending)}
              disabled={bulkPost.isPending}
              onClick={() => void runBulk("deactivate")}
            >
              Deactivate
            </button>
            <button
              type="button"
              className={`${adminToolbarButtonClass(bulkPost.isPending)} border-red-300 text-red-800 hover:bg-red-50`}
              disabled={bulkPost.isPending}
              onClick={() => void runBulk("delete")}
            >
              Delete…
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(false)}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear selection
            </button>
          </div>
        </AdminPanel>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="No users" description="Try different filters or search." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh className="w-10">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(e) => selectAllOnPage(e.target.checked)}
                  aria-label="Select all on page"
                />
              </AdminTh>
              <AdminTh>User</AdminTh>
              <AdminTh>Phone</AdminTh>
              <AdminTh>Role / status</AdminTh>
              <AdminTh>Signup</AdminTh>
              <AdminTh>Stats</AdminTh>
              <AdminTh className="text-right">Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((u) => {
              const uid = str(u.id);
              if (!uid) return null;
              const suspended = u.deactivated_at != null && String(u.deactivated_at).length > 0;
              const isTargetSuperadmin = str(u.role) === "superadmin";
              return (
                <tr key={uid}>
                  <AdminTd>
                    <div className="flex items-center pt-0.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(uid)}
                        onChange={(e) => toggleSelect(uid, e.target.checked)}
                        aria-label={`Select ${str(u.email)}`}
                      />
                    </div>
                  </AdminTd>
                  <AdminTd>
                    <div className="flex items-center gap-2">
                      {u.avatar_url ? (
                        <img src={str(u.avatar_url)} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-500">
                          {(str(u.full_name) || str(u.email)).slice(0, 1).toUpperCase() || "?"}
                        </div>
                      )}
                      <div>
                        <Link
                          className="font-medium text-primary underline"
                          to={adminSpaTo(`/admin/users/${uid}`)}
                        >
                          {str(u.full_name) || "No name"}
                        </Link>
                        <div className="text-xs text-gray-600 break-all">{str(u.email)}</div>
                      </div>
                    </div>
                  </AdminTd>
                  <AdminTd className="text-sm text-gray-700">{str(u.phone) || "—"}</AdminTd>
                  <AdminTd>
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex w-fit rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs">
                        {str(u.role) || "—"}
                      </span>
                      {suspended ? (
                        <span className="w-fit rounded-md bg-red-100 px-2 py-0.5 text-xs text-red-800">Suspended</span>
                      ) : null}
                    </div>
                  </AdminTd>
                  <AdminTd className="text-sm text-gray-600">
                    {u.signup_source ? SIGNUP_SOURCE_LABELS[str(u.signup_source)] ?? str(u.signup_source) : "—"}
                  </AdminTd>
                  <AdminTd className="text-xs text-gray-600">
                    {u.stats?.booking_count != null ? <div>Bookings: {String(u.stats.booking_count)}</div> : null}
                    {u.stats?.provider_count != null ? <div>Providers: {String(u.stats.provider_count)}</div> : null}
                    {u.stats?.booking_count == null && u.stats?.provider_count == null ? "—" : null}
                  </AdminTd>
                  <AdminTd className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      {!isTargetSuperadmin ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-primary underline"
                          disabled={patchUser.isPending}
                          onClick={() => {
                            const label = str(u.full_name) || str(u.email);
                            if (suspended) {
                              if (!window.confirm(`Reactivate ${label}?`)) return;
                              void patchUser.mutateAsync({
                                id: uid,
                                body: { deactivated_at: null, deactivation_reason: null },
                              });
                            } else {
                              const r = window.prompt(`Suspend ${label} — reason (optional):`);
                              if (r === null) return;
                              if (!window.confirm(`Suspend ${label}?`)) return;
                              void patchUser.mutateAsync({
                                id: uid,
                                body: { deactivated_at: new Date().toISOString(), deactivation_reason: r.trim() || null },
                              });
                            }
                          }}
                        >
                          {suspended ? "Reactivate" : "Suspend"}
                        </button>
                      ) : null}
                      {isSuperadmin && !isTargetSuperadmin ? (
                        <select
                          className="max-w-[11rem] rounded border border-gray-200 px-1 py-1 text-xs"
                          value=""
                          disabled={rolePut.isPending}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (!next) return;
                            if (!window.confirm(`Change role to ${next}?`)) {
                              e.target.value = "";
                              return;
                            }
                            void rolePut.mutateAsync({ id: uid, role: next });
                            e.target.value = "";
                          }}
                        >
                          <option value="">Change role…</option>
                          {MANAGEABLE_USER_ROLES.map((r) => (
                            <option key={r} value={r} disabled={r === str(u.role)}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {isSuperadmin && !isTargetSuperadmin ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-red-700 underline"
                          onClick={() =>
                            setPurgeUser({ id: uid, email: str(u.email) || "" })
                          }
                        >
                          Purge…
                        </button>
                      ) : null}
                    </div>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}

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

      {purgeUser ? (
        <CompliancePurgeUserModal
          open
          onClose={() => setPurgeUser(null)}
          userId={purgeUser.id}
          userEmail={purgeUser.email}
          onComplete={invalidateUsers}
        />
      ) : null}
    </div>
  );
}
