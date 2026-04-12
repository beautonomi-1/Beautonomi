import { useState } from "react";
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

type FeaturedCity = {
  id: string;
  city_name: string;
  country?: string;
  image_url?: string | null;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
  updated_at?: string;
  created_at?: string;
};

type FeaturedCitiesPayload = { data?: FeaturedCity[] };

function FeaturedCityForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  initial: Partial<FeaturedCity>;
  onSave: (d: Partial<FeaturedCity>) => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const [cityName, setCityName] = useState(initial.city_name ?? "");
  const [country, setCountry] = useState(initial.country ?? "");
  const [imageUrl, setImageUrl] = useState(initial.image_url ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [sortOrder, setSortOrder] = useState(initial.sort_order ?? 0);
  const [isActive, setIsActive] = useState(initial.is_active !== false);

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">City name *</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={cityName}
            onChange={(e) => setCityName(e.target.value)}
            placeholder="Cape Town"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
          <input className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="South Africa" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label>
          <input className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <textarea rows={3} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sort order</label>
          <input type="number" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="cityActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-indigo-600" />
          <label htmlFor="cityActive" className="text-sm text-gray-700">Active</label>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isSaving || !cityName.trim()}
          onClick={() => onSave({
            ...(initial.id ? { id: initial.id } : {}),
            city_name: cityName.trim(),
            country: country || undefined,
            image_url: imageUrl || null,
            description: description || undefined,
            sort_order: sortOrder,
            is_active: isActive,
          })}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : initial.id ? "Update" : "Create"}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ContentFeaturedCitiesPage() {
  useAdminDocumentTitle("Featured Cities");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.contentFeaturedCities(),
    queryFn: () => adminApi.getRawJson<FeaturedCitiesPayload>("/api/admin/content/featured-cities", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [mutError, setMutError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.contentFeaturedCities() });

  const createMut = useMutation({
    mutationFn: (d: Partial<FeaturedCity>) => adminApi.postJson("/api/admin/content/featured-cities", d),
    onSuccess: () => { invalidate(); setCreating(false); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<FeaturedCity> & { id: string }) =>
      adminApi.patchJson(`/api/admin/content/featured-cities/${id}`, d),
    onSuccess: () => { invalidate(); setEditId(null); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/content/featured-cities/${id}`),
    onSuccess: () => { invalidate(); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to delete"),
  });

  const rows = (q.data?.data ?? []) as FeaturedCity[];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Featured Cities" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const editRow = editId ? rows.find((r) => r.id === editId) : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Featured Cities" description="Manage featured cities shown to customers." />

      <AdminPanel>
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => { setCreating(true); setEditId(null); setMutError(null); }}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            + New city
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            Refresh
          </button>
        </div>
        {creating && (
          <div className="mb-4">
            <FeaturedCityForm
              initial={{}}
              onSave={(d) => createMut.mutate(d)}
              onCancel={() => setCreating(false)}
              isSaving={createMut.isPending}
              error={mutError}
            />
          </div>
        )}
        {editId && editRow && (
          <div className="mb-4">
            <FeaturedCityForm
              initial={editRow}
              onSave={(d) => updateMut.mutate(d as Partial<FeaturedCity> & { id: string })}
              onCancel={() => setEditId(null)}
              isSaving={updateMut.isPending}
              error={mutError}
            />
          </div>
        )}
      </AdminPanel>

      {mutError && !creating && !editId && (
        <p className="text-sm text-red-600 px-1">{mutError}</p>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No featured cities" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>City</AdminTh>
              <AdminTh>Country</AdminTh>
              <AdminTh>Order</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Updated</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={r.id}>
                <AdminTd className="font-medium">{r.city_name}</AdminTd>
                <AdminTd className="text-xs">{r.country ?? "—"}</AdminTd>
                <AdminTd className="text-xs">{r.sort_order ?? 0}</AdminTd>
                <AdminTd>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.is_active !== false
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {r.is_active !== false ? "Active" : "Inactive"}
                  </span>
                </AdminTd>
                <AdminTd className="text-xs text-gray-500">{(r.updated_at ?? r.created_at ?? "").slice(0, 10)}</AdminTd>
                <AdminTd>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditId(r.id); setCreating(false); setMutError(null); }}
                      className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deleteMut.isPending}
                      onClick={() => { if (confirm(`Delete "${r.city_name}"?`)) deleteMut.mutate(r.id); }}
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
