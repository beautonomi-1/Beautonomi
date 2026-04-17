import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_ECOMMERCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToast } from "@/lib/adminToast";
import { adminToolbarButtonClass } from "@/lib/adminUi";
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

interface Addon {
  id: string;
  name?: string;
  title?: string;
  description?: string | null;
  type?: string;
  category?: string | null;
  price?: number;
  currency?: string;
  duration_minutes?: number | null;
  is_active?: boolean;
  is_recommended?: boolean;
  sort_order?: number;
  provider_id?: string | null;
}

function defaultForm() {
  return {
    name: "",
    type: "service" as "service" | "product" | "upgrade",
    description: "",
    category: "",
    price: "",
    duration_minutes: "",
    is_active: true,
    is_recommended: false,
  };
}

type FormState = ReturnType<typeof defaultForm>;

export function AddonsListPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_ECOMMERCE, "E‑commerce access is required.");
  useAdminDocumentTitle("Add-ons");
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editAddon, setEditAddon] = useState<Addon | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());

  const qk = adminQueryKeys.addons(typeFilter);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (typeFilter !== "all") p.set("type", typeFilter);
      const res = await adminApi.getJson<Addon[] | { data: Addon[] }>(
        `/api/admin/addons${p.toString() ? `?${p}` : ""}`,
        { timeoutMs: 60_000 }
      );
      if (Array.isArray(res)) return res;
      if (res && "data" in res && Array.isArray(res.data)) return res.data;
      return [];
    },
    enabled: allowed,
  });

  const rows: Addon[] = (q.data ?? []).filter((a) => {
    const label = (a.name ?? a.title ?? "").toLowerCase();
    return !search || label.includes(search.toLowerCase());
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.addons(typeFilter) });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.postJson<{ data: Addon }>("/api/admin/addons", body),
    onSuccess: () => {
      adminToast.success("Add-on created");
      setShowCreate(false);
      setForm(defaultForm());
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to create add-on"),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/addons/${id}`, body),
    onSuccess: () => {
      adminToast.success("Add-on updated");
      setEditAddon(null);
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/addons/${id}`),
    onSuccess: () => {
      adminToast.success("Add-on deleted");
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to delete"),
  });

  function openEdit(a: Addon) {
    setForm({
      name: a.name ?? a.title ?? "",
      type: (a.type as FormState["type"]) ?? "service",
      description: a.description ?? "",
      category: a.category ?? "",
      price: String(a.price ?? ""),
      duration_minutes: String(a.duration_minutes ?? ""),
      is_active: a.is_active !== false,
      is_recommended: a.is_recommended === true,
    });
    setEditAddon(a);
  }

  function buildPayload() {
    return {
      name: form.name.trim(),
      type: form.type,
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      price: form.price !== "" ? Number(form.price) : 0,
      duration_minutes: form.duration_minutes !== "" ? Number(form.duration_minutes) : null,
      is_active: form.is_active,
      is_recommended: form.is_recommended,
    };
  }

  if (denied) return denied;
  if (q.isLoading)
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Add-ons" />
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
        title="Add-ons"
        description="Global and provider-specific add-ons that can be attached to bookings."
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
              onClick={() => { setForm(defaultForm()); setShowCreate(true); }}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              + New add-on
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search add-ons…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        >
          <option value="all">All types</option>
          <option value="service">Service</option>
          <option value="product">Product</option>
          <option value="upgrade">Upgrade</option>
        </select>
      </div>

      {/* Create modal */}
      <AdminModal open={showCreate} title="Create add-on" onClose={() => setShowCreate(false)} footer={null}>
        <AddonForm
          form={form} setForm={setForm}
          isPending={createMut.isPending}
          onCancel={() => setShowCreate(false)}
          onSave={() => createMut.mutate(buildPayload())}
          saveLabel="Create add-on"
        />
      </AdminModal>

      {/* Edit modal */}
      <AdminModal open={!!editAddon} title={`Edit: ${editAddon?.name ?? editAddon?.title ?? ""}`} onClose={() => setEditAddon(null)} footer={null}>
        {editAddon && (
          <AddonForm
            form={form} setForm={setForm}
            isPending={patchMut.isPending}
            onCancel={() => setEditAddon(null)}
            onSave={() => patchMut.mutate({ id: editAddon.id, body: buildPayload() })}
            saveLabel="Save changes"
          />
        )}
      </AdminModal>

      {rows.length === 0 ? (
        <EmptyState
          title="No add-ons"
          description="Create add-ons that providers can attach to their services."
          action={
            <button type="button" onClick={() => { setForm(defaultForm()); setShowCreate(true); }} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
              + New add-on
            </button>
          }
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Price</AdminTh>
              <AdminTh>Duration</AdminTh>
              <AdminTh>Scope</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((a) => (
              <tr key={a.id} className={a.is_active === false ? "opacity-50" : ""}>
                <AdminTd>
                  <div className="font-medium">{a.name ?? a.title ?? "—"}</div>
                  {a.description && <div className="text-xs text-gray-400 truncate max-w-xs">{a.description}</div>}
                </AdminTd>
                <AdminTd>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{a.type ?? "—"}</span>
                </AdminTd>
                <AdminTd className="tabular-nums text-sm">
                  {a.price != null ? `${a.currency ?? ""} ${a.price}` : "—"}
                </AdminTd>
                <AdminTd className="text-xs text-gray-500">
                  {a.duration_minutes ? `${a.duration_minutes} min` : "—"}
                </AdminTd>
                <AdminTd className="text-xs text-gray-500">
                  {a.provider_id ? "Provider" : "Global"}
                </AdminTd>
                <AdminTd>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.is_active !== false ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                    {a.is_active !== false ? "Active" : "Inactive"}
                  </span>
                </AdminTd>
                <AdminTd>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(a)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deleteMut.isPending}
                      onClick={() => { if (confirm(`Delete add-on "${a.name ?? a.title}"?`)) deleteMut.mutate(a.id); }}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
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

function AddonForm({
  form, setForm, isPending, onCancel, onSave, saveLabel,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  isPending: boolean; onCancel: () => void; onSave: () => void; saveLabel: string;
}) {
  const isValid = form.name.trim().length > 0;
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
        <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Extended Consultation" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
        <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as FormState["type"] }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none">
          <option value="service">Service</option>
          <option value="product">Product</option>
          <option value="upgrade">Upgrade</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
        <textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
        <input type="text" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. beauty, wellness" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Price</label>
          <input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Duration (minutes)</label>
          <input type="number" min={0} value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
        </div>
      </div>
      <div className="space-y-2">
        {[
          { field: "is_active" as const, label: "Active" },
          { field: "is_recommended" as const, label: "Recommended" },
        ].map(({ field, label }) => (
          <label key={field} className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.checked }))} className="accent-gray-900" />
            {label}
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
        <button type="button" disabled={isPending || !isValid} onClick={onSave} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {isPending ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}
