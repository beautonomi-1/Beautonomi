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
import { useAdminConfirmAction } from "@/hooks/useAdminConfirmAction";

/** Keys rendered on the public /about page — must match apps/web/src/app/about/page.tsx */
const PUBLIC_ABOUT_SECTION_KEYS = [
  { value: "mission", label: "Mission" },
  { value: "what_we_do", label: "What we do" },
  { value: "for_professionals", label: "For professionals" },
  { value: "safety_trust", label: "Safety & trust" },
  { value: "contact_intro", label: "Contact intro" },
  { value: "contact_email", label: "Contact email" },
  { value: "contact_phone", label: "Contact phone" },
  { value: "contact_help_center", label: "Help centre link" },
] as const;

type AboutSection = {
  id: string;
  section_key?: string;
  title: string;
  content: string;
  display_order?: number;
  is_active?: boolean;
  updated_at?: string;
  created_at?: string;
};

type AboutUsPayload = { data?: AboutSection[] };

function AboutSectionForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  initial: Partial<AboutSection>;
  onSave: (d: Partial<AboutSection>) => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const isCreate = !initial.id;
  const [sectionKey, setSectionKey] = useState(initial.section_key ?? "mission");
  const [title, setTitle] = useState(initial.title ?? "");
  const [content, setContent] = useState(initial.content ?? "");
  const [displayOrder, setDisplayOrder] = useState(initial.display_order ?? 0);
  const [isActive, setIsActive] = useState(initial.is_active !== false);

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {isCreate ? (
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Section key *</label>
            <select
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={sectionKey}
              onChange={(e) => setSectionKey(e.target.value)}
            >
              {PUBLIC_ABOUT_SECTION_KEYS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label} ({k.value})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Section key</label>
            <input
              className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-600"
              value={initial.section_key ?? ""}
              readOnly
            />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Our Mission"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Display order</label>
          <input
            type="number"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-gray-500">
            Among active sections, the lowest display order is shown as the public /about hero (not section key).
          </p>
        </div>
        <div className="flex items-center gap-2 self-end">
          <input
            type="checkbox"
            id="aboutActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="accent-indigo-600"
          />
          <label htmlFor="aboutActive" className="text-sm text-gray-700">
            Active on public /about
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Content * (HTML allowed)</label>
          <textarea
            rows={8}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono text-xs"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isSaving || !title.trim() || !content.trim() || (isCreate && !sectionKey.trim())}
          onClick={() =>
            onSave({
              ...(initial.id ? { id: initial.id } : {}),
              ...(isCreate ? { section_key: sectionKey.trim() } : {}),
              title: title.trim(),
              content: content.trim(),
              display_order: displayOrder,
              is_active: isActive,
            })
          }
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : initial.id ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ContentAboutUsPage() {
  const { requestConfirm, ConfirmDialog } = useAdminConfirmAction();
  useAdminDocumentTitle("About Us");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.contentAboutUs(),
    queryFn: () => adminApi.getRawJson<AboutUsPayload>("/api/admin/content/about-us", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [mutError, setMutError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.contentAboutUs() });

  const createMut = useMutation({
    mutationFn: (d: Partial<AboutSection>) => adminApi.postJson("/api/admin/content/about-us", d),
    onSuccess: () => {
      invalidate();
      setCreating(false);
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<AboutSection> & { id: string }) =>
      adminApi.patchJson(`/api/admin/content/about-us/${id}`, d),
    onSuccess: () => {
      invalidate();
      setEditId(null);
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/content/about-us/${id}`),
    onSuccess: () => {
      invalidate();
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to delete"),
  });

  const rows = (q.data?.data ?? []) as AboutSection[];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="About Us sections" />
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
      <AdminPageHeader
        title="About Us sections"
        description="Content for the public /about page (about_us_content). Only the listed section keys appear on the site."
      />

      <AdminPanel>
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setEditId(null);
              setMutError(null);
            }}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            + New section
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
            <AboutSectionForm
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
            <AboutSectionForm
              initial={editRow}
              onSave={(d) => updateMut.mutate(d as Partial<AboutSection> & { id: string })}
              onCancel={() => setEditId(null)}
              isSaving={updateMut.isPending}
              error={mutError}
            />
          </div>
        )}
      </AdminPanel>

      {mutError && !creating && !editId && <p className="text-sm text-red-600 px-1">{mutError}</p>}

      {rows.length === 0 ? (
        <EmptyState title="No sections" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Section key</AdminTh>
              <AdminTh>Title</AdminTh>
              <AdminTh>Order</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Updated</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={r.id}>
                <AdminTd className="text-xs font-mono">{r.section_key ?? "—"}</AdminTd>
                <AdminTd className="font-medium">{r.title}</AdminTd>
                <AdminTd className="text-xs">{r.display_order ?? 0}</AdminTd>
                <AdminTd>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.is_active !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {r.is_active !== false ? "Active" : "Hidden"}
                  </span>
                </AdminTd>
                <AdminTd className="text-xs text-gray-500">{(r.updated_at ?? r.created_at ?? "").slice(0, 10)}</AdminTd>
                <AdminTd>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditId(r.id);
                        setCreating(false);
                        setMutError(null);
                      }}
                      className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        requestConfirm({
                          title: "Confirm action",
                          consequence: `Delete "${r.title}"?`,
                          variant: "danger",
                          confirmLabel: "Confirm",
                          onConfirm: async () => deleteMut.mutate(r.id),
                        });
                      }}
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
      <ConfirmDialog />
    </div>
  );
}
