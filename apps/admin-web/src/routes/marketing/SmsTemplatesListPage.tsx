import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
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
import { adminToolbarButtonClass } from "@/lib/adminUi";

interface SmsTemplate {
  id: string;
  name: string;
  message_template: string;
  category?: string | null;
  variables?: string[];
  enabled: boolean;
  tenant_id?: string | null;
  created_at?: string;
}

const CATEGORIES = ["booking", "payment", "onboarding", "support", "marketing", "system"];

function defaultForm(): { name: string; message_template: string; category: string; enabled: boolean } {
  return { name: "", message_template: "", category: "", enabled: true };
}

export function SmsTemplatesListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_MARKETING_COMMS,
    "Marketing & comms access is required."
  );
  useAdminDocumentTitle("SMS Templates");
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<SmsTemplate | null>(null);
  const [form, setForm] = useState(defaultForm());

  const qk = adminQueryKeys.smsTemplates(`${categoryFilter}`);

  const q = useQuery({
    queryKey: qk,
    queryFn: () => {
      const p = new URLSearchParams();
      if (categoryFilter !== "all") p.set("category", categoryFilter);
      return adminApi.getJson<{ templates: SmsTemplate[] }>(
        `/api/admin/sms-templates${p.toString() ? `?${p}` : ""}`,
        { timeoutMs: 30_000 }
      );
    },
    enabled: allowed,
  });

  const rows = (q.data?.templates ?? []).filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.message_template.toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: qk });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.postJson<{ template: SmsTemplate }>("/api/admin/sms-templates", body),
    onSuccess: () => {
      adminToast.success("SMS template created");
      setShowCreate(false);
      setForm(defaultForm());
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to create template"),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/sms-templates/${id}`, body),
    onSuccess: () => {
      adminToast.success("Template updated");
      setEditTemplate(null);
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/sms-templates/${id}`),
    onSuccess: () => {
      adminToast.success("Template deleted");
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to delete"),
  });

  const charCount = form.message_template.length;
  const overLimit = charCount > 160;

  if (denied) return denied;
  if (q.isLoading)
    return (
      <div className="space-y-6">
        <AdminPageHeader title="SMS Templates" />
        <AdminPanel><AdminPageSkeleton rows={4} /></AdminPanel>
      </div>
    );
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="SMS Templates"
        description="Manage reusable SMS templates. Max 160 characters per template."
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
              + New template
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Create modal */}
      <AdminModal open={showCreate} title="Create SMS template" onClose={() => setShowCreate(false)} footer={null}>
        <TemplateForm
          form={form} setForm={setForm}
          isPending={createMut.isPending}
          charCount={charCount} overLimit={overLimit}
          onCancel={() => setShowCreate(false)}
          onSave={() => createMut.mutate({ name: form.name.trim(), message_template: form.message_template, category: form.category || null, enabled: form.enabled })}
          saveLabel="Create template"
        />
      </AdminModal>

      {/* Edit modal */}
      <AdminModal open={!!editTemplate} title={`Edit: ${editTemplate?.name ?? ""}`} onClose={() => setEditTemplate(null)} footer={null}>
        {editTemplate && (
          <TemplateForm
            form={form} setForm={setForm}
            isPending={patchMut.isPending}
            charCount={charCount} overLimit={overLimit}
            onCancel={() => setEditTemplate(null)}
            onSave={() => patchMut.mutate({ id: editTemplate.id, body: { name: form.name.trim(), message_template: form.message_template, category: form.category || null, enabled: form.enabled } })}
            saveLabel="Save changes"
          />
        )}
      </AdminModal>

      {rows.length === 0 ? (
        <EmptyState
          title="No SMS templates"
          description="Create reusable SMS templates for your notification workflows."
          action={
            <button type="button" onClick={() => { setForm(defaultForm()); setShowCreate(true); }} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
              + New template
            </button>
          }
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Category</AdminTh>
              <AdminTh>Preview</AdminTh>
              <AdminTh>Chars</AdminTh>
              <AdminTh>Scope</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((t) => (
              <tr key={t.id}>
                <AdminTd className="font-medium">{t.name}</AdminTd>
                <AdminTd>
                  {t.category ? (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{t.category}</span>
                  ) : "—"}
                </AdminTd>
                <AdminTd className="max-w-xs">
                  <p className="truncate text-xs text-gray-500">{t.message_template}</p>
                </AdminTd>
                <AdminTd className="text-xs">
                  <span className={t.message_template.length > 160 ? "text-red-600 font-medium" : "text-gray-500"}>
                    {t.message_template.length}
                  </span>
                </AdminTd>
                <AdminTd className="text-xs text-gray-500">{t.tenant_id ? "Tenant" : "Global"}</AdminTd>
                <AdminTd>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                    {t.enabled ? "Enabled" : "Disabled"}
                  </span>
                </AdminTd>
                <AdminTd>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setForm({ name: t.name, message_template: t.message_template, category: t.category ?? "", enabled: t.enabled });
                        setEditTemplate(t);
                      }}
                      className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deleteMut.isPending}
                      onClick={() => { if (confirm(`Delete template "${t.name}"?`)) deleteMut.mutate(t.id); }}
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

function TemplateForm({
  form, setForm, isPending, charCount, overLimit, onCancel, onSave, saveLabel,
}: {
  form: { name: string; message_template: string; category: string; enabled: boolean };
  setForm: React.Dispatch<React.SetStateAction<{ name: string; message_template: string; category: string; enabled: boolean }>>;
  isPending: boolean; charCount: number; overLimit: boolean;
  onCancel: () => void; onSave: () => void; saveLabel: string;
}) {
  const isValid = form.name.trim().length > 0 && form.message_template.trim().length > 0 && !overLimit;
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Template name *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. booking_confirmation"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
        <select
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        >
          <option value="">No category</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-700">Message *</label>
          <span className={`text-xs ${overLimit ? "text-red-600 font-semibold" : "text-gray-400"}`}>{charCount}/160</span>
        </div>
        <textarea
          rows={4}
          value={form.message_template}
          onChange={(e) => setForm((f) => ({ ...f, message_template: e.target.value }))}
          placeholder="Use {{variable_name}} for dynamic content…"
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none resize-none ${overLimit ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:border-gray-500"}`}
        />
        {overLimit && <p className="mt-1 text-xs text-red-600">Message exceeds 160 character limit.</p>}
        <p className="mt-1 text-xs text-gray-400">Available variables: {"{{first_name}}"}, {"{{booking_date}}"}, {"{{provider_name}}"}, {"{{amount}}"}</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
          className="accent-gray-900"
        />
        Enabled
      </label>
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
        <button
          type="button"
          disabled={isPending || !isValid}
          onClick={onSave}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}
