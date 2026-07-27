import { useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
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

type Field = {
  id: string;
  name: string;
  label: string;
  field_type: string;
  entity_type: string;
  is_required: boolean;
  is_active: boolean;
  placeholder?: string | null;
  help_text?: string | null;
  default_value?: string | null;
  display_order: number;
};

const ENTITY_TYPES = ["user", "provider", "booking", "service"] as const;
const FIELD_TYPES = ["text", "textarea", "number", "email", "phone", "date", "select", "checkbox", "radio"] as const;

type FieldForm = Omit<Field, "id">;
const emptyForm = (): FieldForm => ({
  name: "",
  label: "",
  field_type: "text",
  entity_type: "booking",
  is_required: false,
  is_active: true,
  placeholder: "",
  help_text: "",
  default_value: "",
  display_order: 0,
});

function FieldFormUI({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  error,
}: {
  value: FieldForm;
  onChange: (v: FieldForm) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  error?: string | null;
}) {
  const inp = (label: string, key: keyof FieldForm, type = "text") => (
    <div key={key}>
      <label className="mb-0.5 block text-xs font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={(value[key] as string | number | undefined) ?? ""}
        onChange={(e) =>
          onChange({ ...value, [key]: type === "number" ? Number(e.target.value) : e.target.value })
        }
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );

  return (
    <div className="space-y-3 rounded border border-gray-200 bg-gray-50 p-4">
      <div className="grid grid-cols-2 gap-3">
        {inp("Internal name (snake_case)", "name")}
        {inp("Display label", "label")}
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-700">Field type</label>
          <select
            value={value.field_type}
            onChange={(e) => onChange({ ...value, field_type: e.target.value })}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-700">Entity type</label>
          <select
            value={value.entity_type}
            onChange={(e) => onChange({ ...value, entity_type: e.target.value })}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        {inp("Placeholder", "placeholder")}
        {inp("Help text", "help_text")}
        {inp("Default value", "default_value")}
        {inp("Display order", "display_order", "number")}
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.is_required}
            onChange={(e) => onChange({ ...value, is_required: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          Required
        </label>
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

export function CustomFieldsListPage() {
  useAdminDocumentTitle("Custom Fields");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const entity = sp.get("entity_type") || "";
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState<FieldForm>(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FieldForm>(emptyForm());
  const [mutError, setMutError] = useState<string | null>(null);

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: adminQueryKeys.customFields(entity || "all") });

  const q = useQuery({
    queryKey: adminQueryKeys.customFields(entity || "all"),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (entity) p.set("entity_type", entity);
      return adminApi.getJson<{ fields: Field[] }>(`/api/admin/custom-fields?${p}`, { timeoutMs: 30_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.fields ?? [];

  const createMut = useMutation({
    mutationFn: (body: FieldForm) => adminApi.postJson("/api/admin/custom-fields", body),
    onSuccess: () => { invalidate(); setCreating(false); setNewForm(emptyForm()); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to create"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<FieldForm> }) =>
      adminApi.patchJson(`/api/admin/custom-fields/${id}`, body),
    onSuccess: () => { invalidate(); setEditId(null); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/custom-fields/${id}`),
    onSuccess: () => { invalidate(); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to delete"),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Custom fields" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
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
        title="Custom fields"
        description="Add or manage custom data fields attached to entity records."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className={adminToolbarButtonClass(q.isFetching)}
              onClick={() => void q.refetch()}
              disabled={q.isFetching}
            >
              Refresh
            </button>
            {!creating && (
              <button
                type="button"
                onClick={() => { setCreating(true); setEditId(null); setMutError(null); }}
                className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
              >
                + Add field
              </button>
            )}
          </div>
        }
      />

      <AdminPanel>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">Entity</label>
          <select
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={entity}
            onChange={(e) => {
              const n = new URLSearchParams(sp);
              if (e.target.value) n.set("entity_type", e.target.value);
              else n.delete("entity_type");
              setSp(n, { replace: true });
            }}
          >
            <option value="">All</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </AdminPanel>

      {creating && (
        <FieldFormUI
          value={newForm}
          onChange={setNewForm}
          onSubmit={() => createMut.mutate(newForm)}
          onCancel={() => { setCreating(false); setMutError(null); }}
          submitLabel="Create field"
          error={mutError}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState title="No custom fields" description="Add the first custom field above." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Label</AdminTh>
              <AdminTh>Entity</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Required</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <>
                <tr key={r.id}>
                  <AdminTd className="font-mono text-xs font-medium">{r.name}</AdminTd>
                  <AdminTd>{r.label}</AdminTd>
                  <AdminTd>{r.entity_type}</AdminTd>
                  <AdminTd>{r.field_type}</AdminTd>
                  <AdminTd>{r.is_required ? "yes" : "no"}</AdminTd>
                  <AdminTd>{r.is_active ? "yes" : "no"}</AdminTd>
                  <AdminTd>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(r.id);
                          setEditForm({
                            name: r.name,
                            label: r.label,
                            field_type: r.field_type,
                            entity_type: r.entity_type,
                            is_required: r.is_required,
                            is_active: r.is_active,
                            placeholder: r.placeholder ?? "",
                            help_text: r.help_text ?? "",
                            default_value: r.default_value ?? "",
                            display_order: r.display_order,
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
                          if (confirm(`Delete field "${r.name}"?`)) deleteMut.mutate(r.id);
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
                    <td colSpan={7} className="bg-gray-50 p-4">
                      <FieldFormUI
                        value={editForm}
                        onChange={setEditForm}
                        onSubmit={() => updateMut.mutate({ id: r.id, body: editForm })}
                        onCancel={() => { setEditId(null); setMutError(null); }}
                        submitLabel="Update field"
                        error={mutError}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
