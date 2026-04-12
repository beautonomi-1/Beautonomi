import { useSearchParams } from "react-router-dom";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
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

type Template = {
  id: string;
  key?: string;
  name?: string;
  title?: string;
  title_template?: string;
  body?: string;
  message_template?: string;
  email_subject?: string;
  email_body?: string;
  sms_body?: string;
  channels?: string[];
  enabled?: boolean;
  description?: string;
  url?: string;
  variables?: string[];
};

type Payload = { templates: Template[] };

const CHANNEL_OPTIONS = ["push", "email", "sms"];

function TemplateForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  initial: Partial<Template>;
  onSave: (d: Partial<Template>) => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const [key, setKey] = useState(initial.key ?? initial.name ?? "");
  const [title, setTitle] = useState(initial.title ?? initial.title_template ?? "");
  const [body, setBody] = useState(initial.body ?? initial.message_template ?? "");
  const [emailSubject, setEmailSubject] = useState(initial.email_subject ?? "");
  const [emailBody, setEmailBody] = useState(initial.email_body ?? "");
  const [smsBody, setSmsBody] = useState(initial.sms_body ?? "");
  const [channels, setChannels] = useState<string[]>(initial.channels ?? ["push"]);
  const [enabled, setEnabled] = useState(initial.enabled !== false);
  const [description, setDescription] = useState(initial.description ?? "");
  const [url, setUrl] = useState(initial.url ?? "");

  const toggleChannel = (ch: string) => {
    setChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);
  };

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Key * (unique identifier)</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
            placeholder="booking_confirmed"
            disabled={!!initial.id}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Your booking is confirmed!"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Push body</label>
          <textarea
            rows={2}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hi {{client_name}}, your booking for {{service}} is confirmed for {{date}}."
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Email subject</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Email body</label>
          <textarea
            rows={3}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">SMS body</label>
          <textarea
            rows={2}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={smsBody}
            onChange={(e) => setSmsBody(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Channels</label>
          <div className="flex gap-3">
            {CHANNEL_OPTIONS.map((ch) => (
              <label key={ch} className="flex items-center gap-1 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={channels.includes(ch)}
                  onChange={() => toggleChannel(ch)}
                  className="accent-indigo-600"
                />
                {ch}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Deep-link URL</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/bookings/{{booking_id}}"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="tEnabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-indigo-600" />
          <label htmlFor="tEnabled" className="text-sm text-gray-700">Enabled</label>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isSaving || !key.trim() || !title.trim()}
          onClick={() => onSave({
            ...(initial.id ? { id: initial.id } : {}),
            key: key.trim(),
            title,
            body,
            email_subject: emailSubject || undefined,
            email_body: emailBody || undefined,
            sms_body: smsBody || undefined,
            channels,
            enabled,
            description: description || undefined,
            url: url || undefined,
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

export function NotificationTemplatesListPage() {
  useAdminDocumentTitle("Notification Templates");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [sp, setSp] = useSearchParams();
  const channel = sp.get("channel") || "";
  const enabledFilter = sp.get("enabled") || "";
  const qc = useQueryClient();

  const setFilter = useCallback(
    (key: "channel" | "enabled", value: string) => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (!value) n.delete(key);
          else n.set(key, value);
          return n;
        },
        { replace: true }
      );
    },
    [setSp]
  );

  const hasFilters = Boolean(channel) || enabledFilter === "true" || enabledFilter === "false";

  const qk = useMemo(() => adminQueryKeys.notificationTemplates(`c=${channel}|e=${enabledFilter}`), [channel, enabledFilter]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (channel) p.set("channel", channel);
      if (enabledFilter === "true" || enabledFilter === "false") p.set("enabled", enabledFilter);
      const qs = p.toString();
      return adminApi.getJson<Payload>(`/api/admin/notification-templates${qs ? `?${qs}` : ""}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [mutError, setMutError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: qk });

  const createMut = useMutation({
    mutationFn: (d: Partial<Template>) => adminApi.postJson("/api/admin/notification-templates", d),
    onSuccess: () => { invalidate(); setCreating(false); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<Template> & { id: string }) =>
      adminApi.patchJson(`/api/admin/notification-templates/${id}`, d),
    onSuccess: () => { invalidate(); setEditId(null); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/notification-templates/${id}`),
    onSuccess: () => { invalidate(); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to delete"),
  });

  const rows = q.data?.templates ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Notification templates" />
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
      <AdminPageHeader title="Notification templates" description="Manage push, email, and SMS notification templates." />

      <AdminPanel>
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => { setCreating(true); setEditId(null); setMutError(null); }}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            + New template
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
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <select
            value={channel}
            onChange={(e) => setFilter("channel", e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm lg:w-44"
            aria-label="Channel"
          >
            <option value="">All channels</option>
            <option value="push">push</option>
            <option value="email">email</option>
            <option value="sms">sms</option>
          </select>
          <select
            value={enabledFilter === "true" || enabledFilter === "false" ? enabledFilter : ""}
            onChange={(e) => setFilter("enabled", e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm lg:w-44"
            aria-label="Enabled"
          >
            <option value="">All</option>
            <option value="true">Enabled only</option>
            <option value="false">Disabled only</option>
          </select>
          {hasFilters ? (
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800"
              onClick={() => {
                setSp(
                  (prev) => {
                    const n = new URLSearchParams(prev);
                    n.delete("channel");
                    n.delete("enabled");
                    return n;
                  },
                  { replace: true }
                );
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
        {creating && (
          <div className="mb-4">
            <TemplateForm
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
            <TemplateForm
              initial={editRow}
              onSave={(d) => updateMut.mutate(d as Partial<Template> & { id: string })}
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
        <EmptyState title="No templates" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Key</AdminTh>
              <AdminTh>Title</AdminTh>
              <AdminTh>Channels</AdminTh>
              <AdminTh>Enabled</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={r.id}>
                <AdminTd className="font-mono text-xs">{r.key ?? r.name ?? ""}</AdminTd>
                <AdminTd className="max-w-xs truncate text-xs">{r.title ?? r.title_template ?? ""}</AdminTd>
                <AdminTd className="text-xs">{Array.isArray(r.channels) ? r.channels.join(", ") : ""}</AdminTd>
                <AdminTd>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${r.enabled !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {r.enabled !== false ? "Enabled" : "Disabled"}
                  </span>
                </AdminTd>
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
                      onClick={() => { if (confirm(`Delete template "${r.key ?? r.name}"?`)) deleteMut.mutate(r.id); }}
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
