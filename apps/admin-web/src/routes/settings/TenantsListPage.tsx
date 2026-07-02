import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";
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
import { AdminModal } from "@/components/admin/AdminModal";

type Lifecycle = "active" | "sandbox" | "suspended" | "disabled";

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  region_code: string;
  lifecycle: Lifecycle;
  default_currency: string;
  default_language: string;
  default_timezone: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

const LIFECYCLE_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  sandbox: "bg-blue-100 text-blue-800",
  suspended: "bg-red-100 text-red-800",
  disabled: "bg-gray-200 text-gray-700",
};

function defaultCreate() {
  return {
    slug: "",
    name: "",
    region_code: "ZA",
    lifecycle: "active" as Lifecycle,
    default_currency: "ZAR",
    default_language: "en",
    default_timezone: "Africa/Johannesburg",
  };
}

function defaultEdit(t: TenantRow) {
  return {
    name: t.name,
    region_code: t.region_code,
    lifecycle: t.lifecycle,
    default_currency: t.default_currency,
    default_language: t.default_language,
    default_timezone: t.default_timezone,
    is_active: t.is_active,
  };
}

export function TenantsListPage() {
  useAdminDocumentTitle("Tenants");
  const { allowed, denied } = useSuperadminPage("Tenant management is superadmin-only.");
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(defaultCreate());
  const [editTenant, setEditTenant] = useState<TenantRow | null>(null);
  const [editForm, setEditForm] = useState<ReturnType<typeof defaultEdit> | null>(null);

  const q = useQuery({
    queryKey: adminQueryKeys.tenants(),
    queryFn: () => adminApi.getJson<TenantRow[]>("/api/admin/tenants?include_inactive=true", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const rows = (q.data ?? []).filter((t) => {
    if (!search.trim()) return true;
    const lo = search.toLowerCase();
    return (
      t.name?.toLowerCase().includes(lo) ||
      t.slug?.toLowerCase().includes(lo) ||
      t.region_code?.toLowerCase().includes(lo)
    );
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.tenants() });

  const createMut = useMutation({
    mutationFn: (body: typeof createForm) =>
      adminApi.postJson<{ tenant: TenantRow }>("/api/admin/tenants", body),
    onSuccess: () => {
      adminToast.success("Tenant created");
      setShowCreate(false);
      setCreateForm(defaultCreate());
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message || "Failed to create tenant"),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/tenants/${id}`, body),
    onSuccess: () => {
      adminToast.success("Tenant updated");
      setEditTenant(null);
      setEditForm(null);
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message || "Failed to update tenant"),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/tenants/${id}`),
    onSuccess: () => {
      adminToast.success("Tenant deactivated");
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message || "Failed to deactivate tenant"),
  });

  const reactivateMut = useMutation({
    mutationFn: (id: string) => adminApi.patchJson(`/api/admin/tenants/${id}`, { lifecycle: "active", is_active: true }),
    onSuccess: () => {
      adminToast.success("Tenant reactivated");
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message || "Failed to reactivate tenant"),
  });

  if (denied) return denied;
  if (q.isLoading)
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Tenants" />
        <AdminPanel><AdminPageSkeleton rows={5} /></AdminPanel>
      </div>
    );
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Tenants"
        description="Platform market tenants. Superadmin only."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className={adminToolbarButtonClass(q.isFetching)}
              disabled={q.isFetching}
              onClick={() => void q.refetch()}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              + New tenant
            </button>
          </div>
        }
      />

      <input
        type="search"
        placeholder="Search by name, slug, region…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      />

      {/* Create modal */}
      <AdminModal open={showCreate} title="Create tenant" onClose={() => setShowCreate(false)} footer={null}>
        <TenantForm
          form={createForm}
          showSlug
          setForm={(v) => setCreateForm((p) => ({ ...p, ...v }))}
          isPending={createMut.isPending}
          onCancel={() => setShowCreate(false)}
          onSave={() => createMut.mutate(createForm)}
          saveLabel="Create tenant"
        />
      </AdminModal>

      {/* Edit modal */}
      <AdminModal open={!!(editTenant && editForm)} title={`Edit: ${editTenant?.name ?? ""}`} onClose={() => { setEditTenant(null); setEditForm(null); }} footer={null}>
        {editTenant && editForm && (
          <TenantForm
            form={editForm}
            showSlug={false}
            setForm={(v) => setEditForm((p) => p ? { ...p, ...v } : p)}
            isPending={patchMut.isPending}
            onCancel={() => { setEditTenant(null); setEditForm(null); }}
            onSave={() => patchMut.mutate({ id: editTenant.id, body: editForm as Record<string, unknown> })}
            saveLabel="Save changes"
          />
        )}
      </AdminModal>

      {rows.length === 0 ? (
        <EmptyState
          title="No tenants"
          action={
            <button type="button" onClick={() => setShowCreate(true)} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
              + New tenant
            </button>
          }
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Slug</AdminTh>
              <AdminTh>Name</AdminTh>
              <AdminTh>Region</AdminTh>
              <AdminTh>Currency</AdminTh>
              <AdminTh>Language</AdminTh>
              <AdminTh>Timezone</AdminTh>
              <AdminTh>Lifecycle</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((t) => (
              <tr key={t.id} className={!t.is_active ? "opacity-60" : undefined}>
                <AdminTd className="font-mono text-xs">{t.slug}</AdminTd>
                <AdminTd className="font-medium">{t.name}</AdminTd>
                <AdminTd>{t.region_code}</AdminTd>
                <AdminTd>{t.default_currency}</AdminTd>
                <AdminTd className="uppercase">{t.default_language}</AdminTd>
                <AdminTd className="text-xs">{t.default_timezone}</AdminTd>
                <AdminTd>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LIFECYCLE_BADGE[t.lifecycle] ?? "bg-gray-100 text-gray-600"}`}>
                    {t.lifecycle}
                  </span>
                </AdminTd>
                <AdminTd>
                  <span className={`text-xs font-medium ${t.is_active ? "text-green-700" : "text-red-600"}`}>
                    {t.is_active ? "yes" : "no"}
                  </span>
                </AdminTd>
                <AdminTd>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditTenant(t); setEditForm(defaultEdit(t)); }}
                      className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    {t.is_active ? (
                      <button
                        type="button"
                        disabled={deactivateMut.isPending}
                        onClick={() => {
                          if (confirm(`Deactivate tenant "${t.name}"? This will suspend the tenant.`)) {
                            deactivateMut.mutate(t.id);
                          }
                        }}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={reactivateMut.isPending}
                        onClick={() => reactivateMut.mutate(t.id)}
                        className="rounded border border-green-200 px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}

type FormFields = {
  slug?: string;
  name: string;
  region_code: string;
  lifecycle: Lifecycle;
  default_currency: string;
  default_language: string;
  default_timezone: string;
  is_active?: boolean;
};

function TenantForm({
  form,
  showSlug,
  setForm,
  isPending,
  onCancel,
  onSave,
  saveLabel,
}: {
  form: FormFields;
  showSlug: boolean;
  setForm: (v: Partial<FormFields>) => void;
  isPending: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <div className="space-y-3">
      {showSlug && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Slug *</label>
          <input
            type="text"
            value={form.slug ?? ""}
            onChange={(e) => setForm({ slug: e.target.value })}
            placeholder="my-market"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">Lowercase letters, numbers, hyphens, underscores</p>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ name: e.target.value })}
          placeholder="South Africa"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Region code *</label>
          <input
            type="text"
            maxLength={2}
            value={form.region_code}
            onChange={(e) => setForm({ region_code: e.target.value.toUpperCase() })}
            placeholder="ZA"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Currency *</label>
          <input
            type="text"
            maxLength={3}
            value={form.default_currency}
            onChange={(e) => setForm({ default_currency: e.target.value.toUpperCase() })}
            placeholder="ZAR"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Language</label>
          <input
            type="text"
            value={form.default_language}
            onChange={(e) => setForm({ default_language: e.target.value.toLowerCase() })}
            placeholder="en"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Lifecycle</label>
          <select
            value={form.lifecycle}
            onChange={(e) => setForm({ lifecycle: e.target.value as FormFields["lifecycle"] })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          >
            <option value="active">Active</option>
            <option value="sandbox">Sandbox</option>
            <option value="suspended">Suspended</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Timezone *</label>
        <input
          type="text"
          value={form.default_timezone}
          onChange={(e) => setForm({ default_timezone: e.target.value })}
          placeholder="Africa/Johannesburg"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onSave}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}
