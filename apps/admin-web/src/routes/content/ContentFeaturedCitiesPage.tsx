import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { cn } from "@/lib/cn";
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
import { Plus, Search } from "lucide-react";

type FeaturedCity = {
  id: string;
  /** API column */
  name?: string;
  /** Legacy / alias */
  city_name?: string;
  country?: string;
  image_url?: string | null;
  description?: string;
  display_order?: number;
  sort_order?: number;
  is_active?: boolean;
  updated_at?: string;
  created_at?: string;
  provider_count?: number;
};

function cityLabel(r: FeaturedCity): string {
  return (r.name ?? r.city_name ?? "").trim() || "—";
}

type FeaturedCitiesPayload = { data?: FeaturedCity[] };

const EMPTY_FEATURED_CITY_INITIAL: Partial<FeaturedCity> = {
  is_active: true,
  display_order: 0,
};

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
  const [cityName, setCityName] = useState((initial.name ?? initial.city_name ?? "").trim());
  const [country, setCountry] = useState(initial.country ?? "");
  const [imageUrl, setImageUrl] = useState(initial.image_url ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(initial.display_order ?? initial.sort_order ?? 0));
  const [isActive, setIsActive] = useState(initial.is_active !== false);

  return (
    <div className="space-y-5 text-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-700">City name *</label>
          <input
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={cityName}
            onChange={(e) => setCityName(e.target.value)}
            placeholder="Cape Town"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Country *</label>
          <input
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="South Africa"
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700">Image URL</label>
          <input
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700">Description</label>
          <textarea
            rows={4}
            className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Display order</label>
          <input
            type="number"
            min="0"
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="cityActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 accent-gray-900"
          />
          <label htmlFor="cityActive" className="text-sm text-gray-800">
            Active
          </label>
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
        <button type="button" className={adminToolbarButtonClass(false)} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          disabled={isSaving || !cityName.trim() || !country.trim()}
          onClick={() =>
            onSave({
              ...(initial.id ? { id: initial.id } : {}),
              name: cityName.trim(),
              country: country.trim(),
              image_url: imageUrl.trim() ? imageUrl.trim() : null,
              description: description.trim() || undefined,
              display_order: parseInt(sortOrder || "0", 10) || 0,
              is_active: isActive,
            })
          }
          className="min-h-11 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : initial.id ? "Save changes" : "Create city"}
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

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "active" | "inactive">("");
  const [mutError, setMutError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.contentFeaturedCities() });

  const createMut = useMutation({
    mutationFn: (d: Partial<FeaturedCity>) => adminApi.postJson("/api/admin/content/featured-cities", d),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<FeaturedCity> & { id: string }) =>
      adminApi.patchJson(`/api/admin/content/featured-cities/${id}`, d),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setEditId(null);
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/content/featured-cities/${id}`),
    onSuccess: () => {
      invalidate();
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to delete"),
  });

  const rows = (q.data?.data ?? []) as FeaturedCity[];

  const filteredRows = useMemo(() => {
    let list = rows;
    if (activeFilter === "active") list = list.filter((r) => r.is_active !== false);
    if (activeFilter === "inactive") list = list.filter((r) => r.is_active === false);
    const qv = search.trim().toLowerCase();
    if (!qv) return list;
    return list.filter((r) => {
      const hay = [r.name, r.city_name, r.country, r.description].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(qv);
    });
  }, [rows, search, activeFilter]);

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
  const hasFilters = Boolean(search.trim()) || Boolean(activeFilter);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Featured cities"
        description="Cities highlighted in discovery and marketing surfaces. Order with sort; inactive rows stay hidden from customers."
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
        <strong>Note:</strong> Use HTTPS image URLs. <span className="font-medium">Display order</span> controls list order (lower numbers first).
      </div>

      <AdminPanel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search city, country, description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as "" | "active" | "inactive")}
              className="min-h-11 rounded-xl border border-gray-300 px-3 py-2 text-sm"
              aria-label="Active"
            >
              <option value="">All</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
            {hasFilters ? (
              <button
                type="button"
                className="min-h-11 rounded-xl border border-gray-300 px-3 text-sm"
                onClick={() => {
                  setSearch("");
                  setActiveFilter("");
                }}
              >
                Clear filters
              </button>
            ) : null}
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
              onClick={() => {
                setEditId(null);
                setMutError(null);
                setModal("create");
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Plus className="h-4 w-4" />
              New city
            </button>
          </div>
        </div>
      </AdminPanel>

      {mutError && !modal ? <p className="text-sm text-red-600">{mutError}</p> : null}

      <AdminModal
        open={modal !== null}
        onClose={() => {
          setModal(null);
          setEditId(null);
          setMutError(null);
        }}
        title={modal === "edit" ? "Edit featured city" : "New featured city"}
        description="Sends name, country, display order, and image URL to the admin API (same contract as the Next.js CMS)."
        size="xl"
        footer={null}
      >
        {modal === "create" ? (
          <FeaturedCityForm
            key="featured-city-create"
            initial={EMPTY_FEATURED_CITY_INITIAL}
            onSave={(d) => createMut.mutate(d)}
            onCancel={() => {
              setModal(null);
              setMutError(null);
            }}
            isSaving={createMut.isPending}
            error={mutError}
          />
        ) : modal === "edit" && editRow ? (
          <FeaturedCityForm
            key={editRow.id}
            initial={editRow}
            onSave={(d) => updateMut.mutate(d as Partial<FeaturedCity> & { id: string })}
            onCancel={() => {
              setModal(null);
              setEditId(null);
              setMutError(null);
            }}
            isSaving={updateMut.isPending}
            error={mutError}
          />
        ) : null}
      </AdminModal>

      {filteredRows.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? "No featured cities" : "No matches"}
          description={rows.length === 0 ? "Add a city to feature in the product." : "Try adjusting search or filters."}
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>City</AdminTh>
              <AdminTh>Country</AdminTh>
              <AdminTh>Display order</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Updated</AdminTh>
              <AdminTh className="text-right">Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {filteredRows.map((r) => (
              <tr key={r.id}>
                <AdminTd className="font-medium">{cityLabel(r)}</AdminTd>
                <AdminTd className="text-xs text-gray-600">{r.country ?? "—"}</AdminTd>
                <AdminTd className="tabular-nums text-xs">{r.display_order ?? r.sort_order ?? 0}</AdminTd>
                <AdminTd>
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                      r.is_active !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {r.is_active !== false ? "Active" : "Inactive"}
                  </span>
                </AdminTd>
                <AdminTd className="text-xs text-gray-500">{(r.updated_at ?? r.created_at ?? "").slice(0, 10)}</AdminTd>
                <AdminTd className="text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditId(r.id);
                        setMutError(null);
                        setModal("edit");
                      }}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        if (confirm(`Delete "${cityLabel(r)}"?`)) deleteMut.mutate(r.id);
                      }}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
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

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
        <strong className="text-gray-800">API</strong>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <code className="rounded bg-gray-100 px-1">GET/POST /api/admin/content/featured-cities</code>,{" "}
            <code className="rounded bg-gray-100 px-1">PATCH /api/admin/content/featured-cities/[id]</code>
          </li>
        </ul>
      </div>
    </div>
  );
}
