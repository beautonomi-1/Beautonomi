import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminModal } from "@/components/admin/AdminModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { Loader2, Plus, Pencil, Trash2, Eye } from "lucide-react";
import { cn } from "@/lib/cn";

interface Template {
  id: string;
  name: string;
  category: string;
  body: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

const CATEGORIES = [
  { value: "cold_intro", label: "Cold Intro", color: "bg-blue-100 text-blue-700" },
  { value: "follow_up", label: "Follow-up", color: "bg-indigo-100 text-indigo-700" },
  { value: "hot_lead", label: "Hot Lead", color: "bg-amber-100 text-amber-700" },
  { value: "pricing_info", label: "Pricing Info", color: "bg-emerald-100 text-emerald-700" },
  { value: "re_engagement", label: "Re-engagement", color: "bg-violet-100 text-violet-700" },
  { value: "custom", label: "Custom", color: "bg-gray-100 text-gray-700" },
];

const PLACEHOLDERS = ["first_name", "last_name", "full_name", "business_name", "email", "phone"];
const SAMPLE_DATA: Record<string, string> = {
  first_name: "Jane",
  last_name: "Doe",
  full_name: "Jane Doe",
  business_name: "Glow Studio",
  email: "jane@glow.co",
  phone: "+27 82 123 4567",
};

function CategoryBadge({ category }: { category: string }) {
  const cat = CATEGORIES.find((c) => c.value === category) || CATEGORIES[5];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", cat.color)}>
      {cat.label}
    </span>
  );
}

function resolvePreview(body: string): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => SAMPLE_DATA[key.toLowerCase()] ?? `{{${key}}}`);
}

export function WhatsAppTemplatesPage() {
  const qc = useQueryClient();
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [form, setForm] = useState({ name: "", category: "custom", body: "", sort_order: 0 });

  const templatesQuery = useQuery({
    queryKey: adminQueryKeys.whatsapp.templates(),
    queryFn: () => adminApi.getJson<Template[]>("/api/admin/whatsapp/templates"),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: { name: string; category: string; body: string; sort_order: number }) => {
      if (editing) {
        return adminApi.putJson(`/api/admin/whatsapp/templates/${editing.id}`, payload);
      }
      return adminApi.postJson("/api/admin/whatsapp/templates", payload);
    },
    onSuccess: () => {
      adminToast.success(editing ? "Template updated." : "Template created.");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsapp.templates() });
      closeEditor();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/whatsapp/templates/${id}`),
    onSuccess: () => {
      adminToast.success("Template archived.");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsapp.templates() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const openEditor = (tpl?: Template) => {
    if (tpl) {
      setEditing(tpl);
      setForm({ name: tpl.name, category: tpl.category, body: tpl.body, sort_order: tpl.sort_order });
    } else {
      setEditing(null);
      setForm({ name: "", category: "custom", body: "", sort_order: 0 });
    }
    setShowEditor(true);
    setShowPreview(false);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditing(null);
    setShowPreview(false);
  };

  const insertPlaceholder = (p: string) => {
    setForm((f) => ({ ...f, body: f.body + `{{${p}}}` }));
  };

  const templates = templatesQuery.data || [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Message Templates"
        description="Predefined WhatsApp message templates with placeholder support."
        actions={
          <button
            className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white"
            onClick={() => openEditor()}
          >
            <Plus className="h-4 w-4" /> New Template
          </button>
        }
      />

      {templatesQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create your first message template to speed up lead outreach."
          action={
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white"
              onClick={() => openEditor()}
            >
              <Plus className="h-4 w-4" /> Create Template
            </button>
          }
        />
      ) : (
        <AdminPanel>
          <div className="divide-y divide-gray-100">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{tpl.name}</span>
                    <CategoryBadge category={tpl.category} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">{tpl.body.slice(0, 100)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    onClick={() => openEditor(tpl)}
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => {
                      if (window.confirm(`Archive "${tpl.name}"?`)) deleteMutation.mutate(tpl.id);
                    }}
                    title="Archive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </AdminPanel>
      )}

      {/* Template Editor Modal */}
      <AdminModal
        open={showEditor}
        onClose={closeEditor}
        title={editing ? "Edit Template" : "New Template"}
        size="xl"
        footer={
          <div className="flex gap-3">
            <button className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm" onClick={closeEditor}>
              Cancel
            </button>
            <button
              className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              disabled={!form.name.trim() || !form.body.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate(form)}
            >
              {saveMutation.isPending ? "Saving…" : editing ? "Update" : "Create"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Name</label>
              <input
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400/30"
                placeholder="Template name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Category</label>
              <select
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Message Body</label>
              <button
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                onClick={() => setShowPreview(!showPreview)}
              >
                <Eye className="h-3 w-3" /> {showPreview ? "Edit" : "Preview"}
              </button>
            </div>

            {/* Placeholder chips */}
            <div className="flex flex-wrap gap-1">
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 hover:bg-green-100"
                  onClick={() => insertPlaceholder(p)}
                >
                  {`{{${p}}}`}
                </button>
              ))}
            </div>

            {showPreview ? (
              <div className="min-h-[120px] whitespace-pre-wrap rounded-xl border border-green-200 bg-green-50/30 p-3 text-sm text-gray-800">
                {resolvePreview(form.body) || "Preview will appear here…"}
              </div>
            ) : (
              <textarea
                className="min-h-[120px] w-full resize-y rounded-xl border border-gray-200 p-3 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400/30"
                placeholder="Type your message… Use {{first_name}} for placeholders."
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            )}
            <p className="text-right text-[11px] text-gray-400">{form.body.length} chars</p>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
