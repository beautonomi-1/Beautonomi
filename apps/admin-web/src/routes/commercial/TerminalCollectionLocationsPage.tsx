import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { ADMIN_SECTION_COMMERCIAL } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { EmptyState } from "@/components/ui/EmptyState";

type CollectionLocation = {
  id: string;
  name: string;
  address: Record<string, unknown>;
  active: boolean;
  display_order: number;
  created_at: string;
};

type FormState = {
  name: string;
  line1: string;
  city: string;
  postal_code: string;
  hours: string;
  active: boolean;
  display_order: number;
};

const EMPTY_FORM: FormState = {
  name: "",
  line1: "",
  city: "",
  postal_code: "",
  hours: "",
  active: true,
  display_order: 0,
};

function formatAddress(addr: Record<string, unknown> | undefined): string {
  if (!addr) return "—";
  const parts = [addr.line1, addr.city, addr.postal_code].filter(Boolean).map(String);
  return parts.length ? parts.join(", ") : "—";
}

export function TerminalCollectionLocationsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_COMMERCIAL, "Commercial section access required");
  useAdminDocumentTitle("Terminal Pickup Locations");
  const qc = useQueryClient();

  const [editLocation, setEditLocation] = useState<CollectionLocation | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading, isError, refetch } = useQuery<{ items: CollectionLocation[] }>({
    queryKey: adminQueryKeys.commercialTerminalCollectionLocations,
    queryFn: () => adminApi.getJson("/api/admin/commercial/terminal-collection-locations"),
    enabled: allowed,
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        active: form.active,
        display_order: form.display_order,
        address: {
          line1: form.line1.trim(),
          city: form.city.trim(),
          postal_code: form.postal_code.trim(),
          hours: form.hours.trim() || undefined,
          country: "ZA",
        },
      };
      if (editLocation) {
        return adminApi.patchJson(`/api/admin/commercial/terminal-collection-locations/${editLocation.id}`, body);
      }
      return adminApi.postJson("/api/admin/commercial/terminal-collection-locations", body);
    },
    onSuccess: () => {
      adminToast.success(editLocation ? "Location updated" : "Location created");
      qc.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalCollectionLocations });
      setEditLocation(null);
      setCreating(false);
    },
    onError: (e: Error) => adminToast.error(e.message || "Failed to save location"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      adminApi.deleteJson(`/api/admin/commercial/terminal-collection-locations/${id}`),
    onSuccess: () => {
      adminToast.success("Location deleted");
      qc.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalCollectionLocations });
    },
    onError: (e: Error) => adminToast.error(e.message || "Failed to delete location"),
  });

  function openCreate() {
    setCreating(true);
    setEditLocation(null);
    setForm(EMPTY_FORM);
  }

  function openEdit(loc: CollectionLocation) {
    setCreating(false);
    setEditLocation(loc);
    const addr = loc.address ?? {};
    setForm({
      name: loc.name,
      line1: String(addr.line1 ?? ""),
      city: String(addr.city ?? ""),
      postal_code: String(addr.postal_code ?? ""),
      hours: String(addr.hours ?? ""),
      active: loc.active,
      display_order: loc.display_order,
    });
  }

  const modalOpen = creating || !!editLocation;
  const items = data?.items ?? [];

  if (denied) return denied;
  if (isLoading) return <AdminPageSkeleton />;
  if (isError) return <AdminRetryBlock message="Failed to load pickup locations" onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Terminal Pickup Locations"
        description="Configure warehouse and hub locations for collection fulfillment on terminal orders."
        actions={
          <button type="button" className={adminToolbarButtonClass()} onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add location
          </button>
        }
      />

      <AdminPanel>
        {items.length === 0 ? (
          <EmptyState
            title="No pickup locations"
            description="Add a location so providers can select pickup during terminal checkout."
            action={
              <button
                type="button"
                onClick={openCreate}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Add location
              </button>
            }
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <AdminTh>Name</AdminTh>
              <AdminTh>Address</AdminTh>
              <AdminTh>Order</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh className="text-right">Actions</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((loc) => (
                <tr key={loc.id}>
                  <AdminTd className="font-medium">{loc.name}</AdminTd>
                  <AdminTd className="text-sm text-gray-600">{formatAddress(loc.address)}</AdminTd>
                  <AdminTd>{loc.display_order}</AdminTd>
                  <AdminTd>
                    <span className={loc.active ? "text-green-700" : "text-gray-500"}>
                      {loc.active ? "Active" : "Inactive"}
                    </span>
                  </AdminTd>
                  <AdminTd className="text-right">
                    <button type="button" className="mr-2 text-sm text-gray-700 underline" onClick={() => openEdit(loc)}>
                      <Settings2 className="inline h-3.5 w-3.5 mr-1" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-sm text-red-600 underline"
                      onClick={() => {
                        if (window.confirm(`Delete "${loc.name}"?`)) deleteMut.mutate(loc.id);
                      }}
                    >
                      <Trash2 className="inline h-3.5 w-3.5 mr-1" />
                      Delete
                    </button>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      <AdminModal
        open={modalOpen}
        onClose={() => {
          setEditLocation(null);
          setCreating(false);
        }}
        title={editLocation ? "Edit pickup location" : "Add pickup location"}
        footer={
          <>
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm"
              onClick={() => {
                setEditLocation(null);
                setCreating(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={!form.name.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Address line 1</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.line1}
              onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium">City</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Postal code</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={form.postal_code}
                onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium">Hours / notes</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.hours}
              onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
              placeholder="Mon–Fri 9:00–17:00"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium">Display order</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={form.display_order}
                onChange={(e) => setForm((f) => ({ ...f, display_order: Number(e.target.value) || 0 }))}
              />
            </label>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Active
            </label>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
