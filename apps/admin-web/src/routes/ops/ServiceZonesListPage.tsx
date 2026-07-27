import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Archive, Globe, Edit2, RotateCcw } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { ADMIN_SECTION_OPERATIONS } from "@beautonomi/admin-access";
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
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminToast } from "@/lib/adminToast";
import { ServiceZonesOverviewMap } from "@/components/maps/ServiceZonesOverviewMap";
import type { ZoneBbox } from "@/components/maps/serviceZoneMapGeo";

type ZoneRow = {
  id: string;
  name?: string;
  country_code?: string;
  status?: string;
  version?: number;
  inclusion_count?: number;
  has_geometry?: boolean;
  published_at?: string | null;
  updated_at?: string;
  bbox?: ZoneBbox;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-600",
};

export function ServiceZonesListPage() {
  useAdminDocumentTitle("Service Zones");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_OPERATIONS,
    "Operations access is required for service zones."
  );
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const archived = sp.get("include_archived") === "1" || sp.get("include_archived") === "true";
  const qk = useMemo(() => adminQueryKeys.serviceZones(archived ? "archived" : "active"), [archived]);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", country_code: "ZA" });

  // Edit modal
  const [editZone, setEditZone] = useState<ZoneRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", status: "draft", country_code: "" });

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = archived ? "?include_archived=true" : "";
      return adminApi.getJson<ZoneRow[]>(`/api/admin/service-zones${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });
  const rows = q.data ?? [];

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: adminQueryKeys.serviceZones("active") });
    void qc.invalidateQueries({ queryKey: adminQueryKeys.serviceZones("archived") });
  };

  const createMut = useMutation({
    mutationFn: (body: { name: string; country_code: string }) =>
      adminApi.postJson("/api/admin/service-zones", body),
    onSuccess: () => {
      adminToast.success("Zone created");
      setShowCreate(false);
      setCreateForm({ name: "", country_code: "ZA" });
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/service-zones/${id}`, patch),
    onSuccess: () => {
      adminToast.success("Zone updated");
      setEditZone(null);
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      adminApi.patchJson(`/api/admin/service-zones/${id}`, {
        status: archive ? "archived" : "draft",
      }),
    onSuccess: (_, vars) => {
      adminToast.success(vars.archive ? "Zone archived" : "Zone restored to draft");
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Service zones" />
        <AdminPanel><AdminPageSkeleton rows={5} /></AdminPanel>
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
        title="Market coverage"
        description="Service zones define the geographic markets where the platform operates."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className={adminToolbarButtonClass(q.isFetching)}
              disabled={q.isFetching}
              onClick={() => void q.refetch()}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(false) + " inline-flex items-center gap-1.5"}
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-4 w-4" />
              New zone
            </button>
          </div>
        }
      />

      <AdminMutationAlert
        errors={[
          createMut.error instanceof Error ? createMut.error : null,
          patchMut.error instanceof Error ? patchMut.error : null,
        ]}
      />

      <AdminPanel>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => {
              const n = new URLSearchParams(sp);
              if (e.target.checked) n.set("include_archived", "true");
              else n.delete("include_archived");
              setSp(n, { replace: true });
            }}
          />
          Include archived zones
        </label>
      </AdminPanel>

      {rows.length > 0 ? (
        <AdminPanel>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Zone overview</h3>
          <p className="mb-3 text-xs text-gray-600">
            Bounding boxes for each market. Click a region, or use <span className="font-medium">Draw areas</span>, to open the detail map with inclusion and exclusion drawing controls.
          </p>
          <ServiceZonesOverviewMap zones={rows} className="min-h-[320px]" />
        </AdminPanel>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No zones"
          description="Create your first service zone to define a market."
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Country</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Version</AdminTh>
              <AdminTh>Areas</AdminTh>
              <AdminTh>Geometry</AdminTh>
              <AdminTh>Updated</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((z) => (
              <tr key={z.id}>
                <AdminTd className="font-medium">{z.name ?? "—"}</AdminTd>
                <AdminTd>
                  <span className="inline-flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5 text-gray-400" />
                    {z.country_code ?? "—"}
                  </span>
                </AdminTd>
                <AdminTd>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[z.status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
                    {z.status ?? "—"}
                  </span>
                </AdminTd>
                <AdminTd className="tabular-nums text-xs">{z.version ?? "—"}</AdminTd>
                <AdminTd className="tabular-nums">{z.inclusion_count ?? 0}</AdminTd>
                <AdminTd>
                  <span className={`text-xs ${z.has_geometry ? "text-green-700" : "text-gray-400"}`}>
                    {z.has_geometry ? "Yes" : "None"}
                  </span>
                </AdminTd>
                <AdminTd className="text-xs text-gray-500">
                  {z.updated_at ? new Date(z.updated_at).toLocaleDateString() : "—"}
                </AdminTd>
                <AdminTd>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/service-zones/${z.id}`}
                      className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-0.5"
                    >
                      <Edit2 className="inline h-3 w-3" />
                      Manage / draw
                    </Link>
                    <button
                      type="button"
                      className="text-xs text-gray-600 hover:underline"
                      onClick={() => {
                        setEditZone(z);
                        setEditForm({
                          name: z.name ?? "",
                          status: z.status ?? "draft",
                          country_code: z.country_code ?? "",
                        });
                      }}
                    >
                      Edit
                    </button>
                    {z.status !== "archived" ? (
                      <button
                        type="button"
                        disabled={archiveMut.isPending}
                        className="text-xs text-orange-600 hover:underline disabled:opacity-50"
                        onClick={() => archiveMut.mutate({ id: z.id, archive: true })}
                      >
                        <Archive className="inline h-3 w-3 mr-0.5" />
                        Archive
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={archiveMut.isPending}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                        onClick={() => archiveMut.mutate({ id: z.id, archive: false })}
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}

      {/* Create modal */}
      <AdminModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create service zone"
        footer={
          <>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(createMut.isPending)}
              disabled={createMut.isPending || !createForm.name.trim() || createForm.country_code.length !== 2}
              onClick={() => createMut.mutate({ name: createForm.name.trim(), country_code: createForm.country_code })}
            >
              {createMut.isPending ? "Creating…" : "Create zone"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Zone name *</label>
            <input
              type="text"
              autoFocus
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. South Africa — National"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Country code (ISO-3166-1 alpha-2) *</label>
            <input
              type="text"
              maxLength={2}
              className="w-20 rounded-md border border-gray-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={createForm.country_code}
              onChange={(e) => setCreateForm((f) => ({ ...f, country_code: e.target.value.toUpperCase() }))}
            />
            <p className="text-xs text-gray-400">e.g. ZA, NG, KE</p>
          </div>
        </div>
      </AdminModal>

      {/* Edit modal */}
      <AdminModal
        open={!!editZone}
        onClose={() => setEditZone(null)}
        title={`Edit zone: ${editZone?.name ?? ""}`}
        footer={
          <>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => setEditZone(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(patchMut.isPending)}
              disabled={patchMut.isPending}
              onClick={() =>
                editZone &&
                patchMut.mutate({
                  id: editZone.id,
                  patch: {
                    name: editForm.name.trim(),
                    status: editForm.status,
                    country_code: editForm.country_code || undefined,
                  },
                })
              }
            >
              {patchMut.isPending ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Zone name</label>
            <input
              type="text"
              autoFocus
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={editForm.status}
              onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Country code</label>
            <input
              type="text"
              maxLength={2}
              className="w-20 rounded-md border border-gray-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={editForm.country_code}
              onChange={(e) => setEditForm((f) => ({ ...f, country_code: e.target.value.toUpperCase() }))}
            />
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
