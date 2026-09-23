import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@beautonomi/admin-access";
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminConfirmAction } from "@/hooks/useAdminConfirmAction";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { LearningArticlePicker } from "@/components/learning/LearningArticlePicker";
import { stepIsCompletable, stepStatusLabel } from "@/lib/knowledgeBaseTraining";
import type { KbArticleResult } from "@/lib/learning";
import { adminToast } from "@/lib/adminToast";

type ResolvedStep = {
  step: number;
  slug: string;
  status: string;
  title?: string;
};

type TrainingPathRow = {
  id: string;
  slug: string;
  title: string;
  role: string;
  description: string | null;
  sort_order: number;
  article_slugs: string[];
  checkpoint_quiz: Array<{
    id: string;
    prompt: string;
    choices: string[];
    answer_index: number;
  }>;
  resolved_steps: ResolvedStep[];
};

type FormState = {
  slug: string;
  title: string;
  role: string;
  description: string;
  sort_order: number;
  article_slugs: string[];
  checkpoint_quiz: TrainingPathRow["checkpoint_quiz"];
};

const emptyForm = (): FormState => ({
  slug: "",
  title: "",
  role: "",
  description: "",
  sort_order: 0,
  article_slugs: [],
  checkpoint_quiz: [],
});

export function TrainingPathsEditorPage() {
  useAdminDocumentTitle("Training paths");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_CONTENT_CATALOG,
    "Content & catalog access is required.",
  );
  const qc = useQueryClient();
  const { requestConfirm, ConfirmDialog } = useAdminConfirmAction();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [slugInput, setSlugInput] = useState("");
  const [quizJson, setQuizJson] = useState("[]");

  const q = useQuery({
    queryKey: adminQueryKeys.contentTrainingPaths(),
    queryFn: () =>
      adminApi.getJson<TrainingPathRow[]>("/api/admin/content/learning/training-paths", {
        timeoutMs: 60_000,
      }),
    enabled: allowed,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      let checkpoint_quiz = form.checkpoint_quiz;
      try {
        const parsed = JSON.parse(quizJson) as TrainingPathRow["checkpoint_quiz"];
        if (!Array.isArray(parsed)) throw new Error("Quiz must be a JSON array");
        checkpoint_quiz = parsed;
      } catch {
        throw new Error("Invalid checkpoint quiz JSON");
      }
      const body = {
        ...form,
        checkpoint_quiz,
        description: form.description.trim() || null,
      };
      if (editingId === "new") {
        return adminApi.postJson<TrainingPathRow>("/api/admin/content/learning/training-paths", body);
      }
      return adminApi.patchJson<TrainingPathRow>(
        `/api/admin/content/learning/training-paths/${editingId}`,
        body,
      );
    },
    onSuccess: () => {
      adminToast.success("Training path saved.");
      setEditingId(null);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.contentTrainingPaths() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.knowledgeBase.trainingPaths() });
    },
    onError: (err: Error) => adminToast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/content/learning/training-paths/${id}`),
    onSuccess: () => {
      adminToast.success("Training path deleted.");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.contentTrainingPaths() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.knowledgeBase.trainingPaths() });
    },
    onError: (err: Error) => adminToast.error(err.message),
  });

  const rows = q.data ?? [];
  const editingRow =
    editingId && editingId !== "new" ? rows.find((r) => r.id === editingId) : null;

  const stepStatusForSlug = (slug: string) => {
    const hit =
      editingRow?.resolved_steps.find((s) => s.slug === slug) ??
      rows.flatMap((r) => r.resolved_steps).find((s) => s.slug === slug);
    return hit?.status ?? "missing";
  };

  const startEdit = (row: TrainingPathRow) => {
    setEditingId(row.id);
    setForm({
      slug: row.slug,
      title: row.title,
      role: row.role,
      description: row.description ?? "",
      sort_order: row.sort_order,
      article_slugs: [...row.article_slugs],
      checkpoint_quiz: row.checkpoint_quiz?.length ? [...row.checkpoint_quiz] : [],
    });
    setQuizJson(JSON.stringify(row.checkpoint_quiz ?? [], null, 2));
  };

  const startNew = () => {
    setEditingId("new");
    setForm(emptyForm());
    setQuizJson("[]");
  };

  const moveSlug = (idx: number, dir: -1 | 1) => {
    setForm((f) => {
      const next = [...f.article_slugs];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return f;
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...f, article_slugs: next };
    });
  };

  const addSlug = (s: string) => {
    const slug = s.trim();
    if (!slug) return;
    setForm((f) =>
      f.article_slugs.includes(slug) ? f : { ...f, article_slugs: [...f.article_slugs, slug] },
    );
    setSlugInput("");
  };

  const onPickArticle = (a: KbArticleResult) => addSlug(a.slug);

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <AdminPanel>
        <AdminPageSkeleton rows={6} />
      </AdminPanel>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={(q.error as Error).message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Training paths"
        description="Ordered curricula for internal staff in the Knowledge Base. Staff sign off steps and pass checkpoint quizzes."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to={adminSpaTo("/admin/content/learning")}
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Learning articles
            </Link>
            <button
              type="button"
              onClick={startNew}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800"
            >
              <Plus className="h-4 w-4" aria-hidden />
              New path
            </button>
          </div>
        }
      />

      {editingId ? (
        <AdminPanel className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">
            {editingId === "new" ? "Create path" : "Edit path"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Slug</span>
              <input
                value={form.slug}
                disabled={editingId !== "new"}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Display role</span>
              <input
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-gray-700">Title</span>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-gray-700">Description</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Sort order</span>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-900">Steps (article slugs)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                placeholder="article-slug"
                className="min-w-[200px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSlug(slugInput);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => addSlug(slugInput)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Add slug
              </button>
            </div>
            <div className="mt-3">
              <LearningArticlePicker
                includeInternal
                limit={6}
                selectLabel="Add step"
                onSelect={onPickArticle}
                showOpen={false}
              />
            </div>
            <ol className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {form.article_slugs.map((s, idx) => {
                const status = stepStatusForSlug(s);
                return (
                  <li key={`${s}-${idx}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="w-6 text-xs text-gray-400">{idx + 1}</span>
                    <span className="min-w-0 flex-1 font-mono text-xs">{s}</span>
                    {!stepIsCompletable(status as "published") ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-800">
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        {stepStatusLabel(status as "published")}
                      </span>
                    ) : null}
                    <button type="button" onClick={() => moveSlug(idx, -1)} className="p-1 text-gray-500 hover:text-gray-800" aria-label="Move up">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => moveSlug(idx, 1)} className="p-1 text-gray-500 hover:text-gray-800" aria-label="Move down">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          article_slugs: f.article_slugs.filter((_, i) => i !== idx),
                        }))
                      }
                      className="p-1 text-red-600 hover:text-red-800"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-900">Checkpoint quiz (JSON)</p>
            <p className="mt-1 text-xs text-gray-500">
              Array of {"{ id, prompt, choices, answer_index }"}. Leave [] for no quiz.
            </p>
            <textarea
              value={quizJson}
              onChange={(e) => setQuizJson(e.target.value)}
              rows={8}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saveMut.isPending || !form.slug || !form.title || form.article_slugs.length === 0}
              onClick={() => saveMut.mutate()}
              className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saveMut.isPending ? "Saving…" : "Save path"}
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </AdminPanel>
      ) : null}

      <AdminPanel>
        <ul className="divide-y divide-gray-100">
          {rows.map((row) => {
            const hasIssue = row.resolved_steps.some((s) => !stepIsCompletable(s.status as "published"));
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-gray-900">{row.title}</p>
                  <p className="text-xs text-gray-500">
                    {row.slug} · {row.article_slugs.length} steps · role {row.role}
                  </p>
                  {hasIssue ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-amber-800">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      Unpublished or missing steps
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      requestConfirm({
                        title: "Delete training path",
                        consequence: `Delete "${row.title}"? Staff progress rows remain in the database.`,
                        variant: "danger",
                        confirmLabel: "Delete",
                        onConfirm: async () => deleteMut.mutate(row.id),
                      })
                    }
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </AdminPanel>
      <ConfirmDialog />
    </div>
  );
}
