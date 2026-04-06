import { useState } from "react";
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
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

interface ProviderDistanceRow {
  id: string;
  business_name?: string;
  name?: string;
  max_service_distance_km?: number | null;
  is_distance_filter_enabled?: boolean | null;
}

export function ProviderDistanceSettingsPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );
  const qc = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [editing, setEditing] = useState<ProviderDistanceRow | null>(null);
  const [form, setForm] = useState({ max_service_distance_km: 10, is_distance_filter_enabled: false });

  const q = useQuery({
    queryKey: adminQueryKeys.providers.distanceList(),
    queryFn: () => adminApi.getJson<ProviderDistanceRow[]>("/api/admin/providers", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      await adminApi.patchJson(`/api/admin/providers/${editing.id}/distance-settings`, {
        max_service_distance_km: form.max_service_distance_km,
        is_distance_filter_enabled: form.is_distance_filter_enabled,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.distanceList() });
      setEditing(null);
    },
  });

  const rows = q.data ?? [];
  const label = (p: ProviderDistanceRow) => p.business_name || p.name || p.id;

  const filtered = searchQuery
    ? rows.filter((p) => label(p).toLowerCase().includes(searchQuery.toLowerCase()))
    : rows;

  function openEdit(p: ProviderDistanceRow) {
    setEditing(p);
    setForm({
      max_service_distance_km: p.max_service_distance_km ?? 10,
      is_distance_filter_enabled: Boolean(p.is_distance_filter_enabled),
    });
  }

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Provider distance settings" description="CRUD via PATCH per provider" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Provider distance settings" />
        <AdminPanel>
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
        </AdminPanel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Provider distance settings"
        description="Per-provider PATCH /api/admin/providers/:id/distance-settings. Full providers grid is still legacy until that list migrates."
      />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/providers")} className="font-medium text-gray-900 underline">
          Open providers list in legacy admin →
        </a>
      </p>

      <AdminPanel>
        <input
          type="search"
          placeholder="Search providers…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </AdminPanel>

      {filtered.length === 0 ? (
        <EmptyState title="No providers" description={searchQuery ? "No name matches." : "No providers returned for this tenant."} />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Distance filter</AdminTh>
              <AdminTh>Max km</AdminTh>
              <AdminTh className="text-right">Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <AdminTd className="font-medium">{label(p)}</AdminTd>
                <AdminTd>{p.is_distance_filter_enabled ? <span className="text-green-700">Enabled</span> : <span className="text-gray-500">Off</span>}</AdminTd>
                <AdminTd>{p.max_service_distance_km != null ? `${p.max_service_distance_km} km` : "—"}</AdminTd>
                <AdminTd className="text-right">
                  <button type="button" className="text-sm font-medium text-gray-900 underline" onClick={() => openEdit(p)}>
                    Edit
                  </button>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}

      <AdminModal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit distance · ${label(editing)}` : "Edit distance"}
        labelledBy="distance-modal-title"
        footer={
          <>
            <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-[#FF0077] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Save
            </button>
          </>
        }
      >
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Enable distance filter</span>
          <input
            type="checkbox"
            checked={form.is_distance_filter_enabled}
            onChange={(e) => setForm((f) => ({ ...f, is_distance_filter_enabled: e.target.checked }))}
            className="h-5 w-5"
          />
        </label>
        {form.is_distance_filter_enabled ? (
          <label className="mt-4 block text-sm">
            Max distance (km)
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={form.max_service_distance_km}
              onChange={(e) => setForm((f) => ({ ...f, max_service_distance_km: parseFloat(e.target.value) || 1 }))}
              className="mt-1 w-full rounded border border-gray-300 p-2"
            />
          </label>
        ) : null}
        <AdminMutationAlert errors={[saveMutation.error]} />
      </AdminModal>
    </div>
  );
}
