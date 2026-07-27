import { Fragment, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
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

type ServiceRow = {
  id: string;
  name: string;
  slug: string;
  category_id?: string;
  category_name?: string;
  description?: string | null;
  default_duration_minutes: number;
  default_buffer_minutes?: number;
  allowed_location_types?: string[];
  is_active: boolean;
};

type CategoryRow = { id: string; name: string };

type ServiceForm = {
  name: string;
  slug: string;
  category_id: string;
  description: string;
  default_duration_minutes: number;
  default_buffer_minutes: number;
  allowed_location_types: string[];
  is_active: boolean;
};

const emptyForm = (): ServiceForm => ({
  name: "",
  slug: "",
  category_id: "",
  description: "",
  default_duration_minutes: 60,
  default_buffer_minutes: 0,
  allowed_location_types: ["at_salon"],
  is_active: true,
});

function ServiceFormUI({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  error,
  categories,
}: {
  value: ServiceForm;
  onChange: (v: ServiceForm) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  error?: string | null;
  categories: CategoryRow[];
}) {
  const toggleLocationType = (type: string) => {
    const existing = value.allowed_location_types;
    const next = existing.includes(type) ? existing.filter((t) => t !== type) : [...existing, type];
    onChange({ ...value, allowed_location_types: next });
  };

  return (
    <div className="space-y-3 rounded border border-gray-200 bg-gray-50 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-700">Name</label>
          <input
            type="text"
            value={value.name}
            onChange={(e) => {
              const n = e.target.value;
              const slug = n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
              onChange({ ...value, name: n, slug });
            }}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-700">Slug</label>
          <input
            type="text"
            value={value.slug}
            onChange={(e) => onChange({ ...value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
            className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-700">Category</label>
          <select
            value={value.category_id}
            onChange={(e) => onChange({ ...value, category_id: e.target.value })}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">— select —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="mb-0.5 block text-xs font-medium text-gray-700">Description</label>
          <textarea
            value={value.description}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
            rows={2}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-700">Duration (min)</label>
          <input
            type="number"
            min={1}
            value={value.default_duration_minutes}
            onChange={(e) => onChange({ ...value, default_duration_minutes: Number(e.target.value) })}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-700">Buffer (min)</label>
          <input
            type="number"
            min={0}
            value={value.default_buffer_minutes}
            onChange={(e) => onChange({ ...value, default_buffer_minutes: Number(e.target.value) })}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <div>
          <p className="mb-1 text-xs font-medium text-gray-700">Location types</p>
          {(["at_salon", "at_home"] as const).map((t) => (
            <label key={t} className="mr-4 flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={value.allowed_location_types.includes(t)}
                onChange={() => toggleLocationType(t)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              {t === "at_salon" ? "At salon" : "At home"}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.is_active}
            onChange={(e) => onChange({ ...value, is_active: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          Active
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSubmit}
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function CatalogServicesPage() {
  useAdminDocumentTitle("Catalog Services");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  const [sp] = useSearchParams();
  const categoryId = sp.get("category_id") || "";
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState<ServiceForm>(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ServiceForm>(emptyForm());
  const [mutError, setMutError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.catalogServices(categoryId || "all") });

  const q = useQuery({
    queryKey: adminQueryKeys.catalogServices(categoryId || "all"),
    queryFn: async () => {
      const p = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : "";
      return adminApi.getJson<{ data: ServiceRow[] }>(`/api/admin/catalog/services${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const catsQ = useQuery({
    queryKey: adminQueryKeys.globalCategories(),
    queryFn: () => adminApi.getJson<CategoryRow[]>("/api/admin/catalog/global-categories", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  const rows: ServiceRow[] = (q.data as any)?.data ?? (Array.isArray(q.data) ? q.data as ServiceRow[] : []);
  const categories: CategoryRow[] = Array.isArray(catsQ.data) ? catsQ.data : ((catsQ.data as any)?.data ?? []);

  const createMut = useMutation({
    mutationFn: (body: ServiceForm) =>
      adminApi.postJson("/api/admin/catalog/services", {
        ...body,
        allowed_location_types: body.allowed_location_types.length ? body.allowed_location_types : ["at_salon"],
      }),
    onSuccess: () => { invalidate(); setCreating(false); setNewForm(emptyForm()); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to create"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<ServiceForm> }) =>
      adminApi.patchJson(`/api/admin/catalog/services/${id}`, body),
    onSuccess: () => { invalidate(); setEditId(null); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/catalog/services/${id}`),
    onSuccess: () => { invalidate(); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to delete"),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Catalog" />
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
        title="Master services"
        description="Global service catalogue available to all providers."
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
            {!creating && (
              <button
                type="button"
                onClick={() => { setCreating(true); setEditId(null); setMutError(null); }}
                className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
              >
                + Add service
              </button>
            )}
          </div>
        }
      />

      <AdminPanel>
        <p className="text-sm text-gray-700">
          Use this catalog to define reusable service templates (duration, category, allowed location types) that providers can adopt.
          Editing here updates the master definition used across onboarding and provider configuration surfaces.
        </p>
      </AdminPanel>

      {creating && (
        <ServiceFormUI
          value={newForm}
          onChange={setNewForm}
          onSubmit={() => createMut.mutate(newForm)}
          onCancel={() => { setCreating(false); setMutError(null); }}
          submitLabel="Create service"
          error={mutError}
          categories={categories}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState title="No services" description="Add the first master service above." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Category</AdminTh>
              <AdminTh>Duration</AdminTh>
              <AdminTh>Locations</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr key={r.id}>
                  <AdminTd className="font-medium">{r.name}</AdminTd>
                  <AdminTd className="text-xs text-gray-500">{r.category_name ?? "—"}</AdminTd>
                  <AdminTd className="tabular-nums">{r.default_duration_minutes} min</AdminTd>
                  <AdminTd className="text-xs">
                    {(r.allowed_location_types ?? []).map((t) => (t === "at_salon" ? "Salon" : "Home")).join(" + ") || "—"}
                  </AdminTd>
                  <AdminTd>
                    <span className={`text-xs font-medium ${r.is_active ? "text-green-700" : "text-gray-400"}`}>
                      {r.is_active ? "Yes" : "No"}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(r.id);
                          setEditForm({
                            name: r.name,
                            slug: r.slug ?? r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                            category_id: r.category_id ?? "",
                            description: r.description ?? "",
                            default_duration_minutes: r.default_duration_minutes,
                            default_buffer_minutes: r.default_buffer_minutes ?? 0,
                            allowed_location_types: r.allowed_location_types ?? ["at_salon"],
                            is_active: r.is_active,
                          });
                          setCreating(false);
                          setMutError(null);
                        }}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (confirm(`Delete "${r.name}"?`)) deleteMut.mutate(r.id);
                        }}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </AdminTd>
                </tr>
                {editId === r.id && (
                  <tr key={`${r.id}-edit`}>
                    <td colSpan={6} className="bg-gray-50 p-4">
                      <ServiceFormUI
                        value={editForm}
                        onChange={setEditForm}
                        onSubmit={() => updateMut.mutate({ id: r.id, body: editForm })}
                        onCancel={() => { setEditId(null); setMutError(null); }}
                        submitLabel="Update service"
                        error={mutError}
                        categories={categories}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
