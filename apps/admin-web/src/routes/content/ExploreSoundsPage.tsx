import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eye, EyeOff, Upload } from "lucide-react";

type SoundRow = {
  id: string;
  title: string;
  storage_path: string;
  duration_ms: number | null;
  is_hidden: boolean;
  created_at: string;
  public_url?: string;
};

export function ExploreSoundsPage() {
  useAdminDocumentTitle("Explore sounds");
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [uploading, setUploading] = useState(false);

  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_CONTENT_CATALOG,
    "Content and catalog access is required for Explore sounds.",
  );

  const query = useQuery({
    queryKey: ["admin", "explore", "sounds", "platform"],
    enabled: allowed,
    queryFn: () =>
      adminApi.getJson<{ data: SoundRow[] }>("/api/admin/explore/sounds?owner=platform", {
        timeoutMs: 60_000,
      }),
  });

  const patchMutation = useMutation({
    mutationFn: (body: { id: string; is_hidden?: boolean; title?: string }) =>
      adminApi.patchJson("/api/admin/explore/sounds", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "explore", "sounds"] });
      adminToast.success("Sound updated");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const sounds = query.data?.data ?? [];

  const onUpload = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (titleDraft.trim()) fd.append("title", titleDraft.trim());
      const res = await fetch("/api/admin/explore/sounds/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: SoundRow;
        error?: string | { message?: string };
      };
      if (!res.ok) {
        const msg =
          typeof json.error === "string"
            ? json.error
            : json.error && typeof json.error === "object" && json.error.message
              ? String(json.error.message)
              : `Upload failed (${res.status})`;
        throw new Error(msg);
      }
      adminToast.success("Sound uploaded");
      setTitleDraft("");
      if (fileRef.current) fileRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["admin", "explore", "sounds"] });
    } catch (e) {
      adminToast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [qc, titleDraft]);

  if (denied) return denied;

  const authFailed = isAdminApiAuthFailure(query.error);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Explore sounds"
        description="Platform music for provider Explore video posts. v1: Hide/show only (no delete or storage cleanup). Customers hear selected tracks on the mobile full-screen video player—not mixed into Rendobar encode."
      />

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Upload sound</h2>
        <p className="mt-1 text-sm text-gray-600">MP3 or M4A, up to 15 MB. Title defaults to the file name.</p>
        <div className="mt-4 flex flex-col gap-3 max-w-lg">
          <label className="block text-sm">
            <span className="text-gray-700">Title (optional)</span>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              maxLength={120}
              placeholder="e.g. Upbeat salon vibe"
            />
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/m4a,.mp3,.m4a"
            className="hidden"
            onChange={(e) => void onUpload(e.target.files)}
          />
          <button
            type="button"
            className={adminToolbarButtonClass(uploading)}
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-2 inline h-4 w-4" aria-hidden />
            {uploading ? "Uploading…" : "Choose file & upload"}
          </button>
        </div>
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Catalog</h2>
        <p className="mt-1 text-sm text-gray-500">
          Hide removes a track from provider pickers; files stay in storage. Posts that already used a hidden track play without the music bed.
        </p>
        {query.isLoading ? (
          <AdminPageSkeleton rows={4} />
        ) : authFailed ? (
          <AdminRetryBlock
            message={query.error instanceof Error ? query.error.message : "Failed to load"}
            onRetry={() => void query.refetch()}
          />
        ) : sounds.length === 0 ? (
          <EmptyState title="No sounds yet" description="Upload a track above to show it in provider post composers." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Title</AdminTh>
                <AdminTh>Created</AdminTh>
                <AdminTh>Duration</AdminTh>
                <AdminTh>Preview</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Actions</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {sounds.map((s) => (
                <tr key={s.id}>
                  <AdminTd>
                    <input
                      type="text"
                      className="w-full max-w-xs rounded border border-gray-200 px-2 py-1 text-sm"
                      defaultValue={s.title}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next && next !== s.title) {
                          patchMutation.mutate({ id: s.id, title: next });
                        }
                      }}
                    />
                  </AdminTd>
                  <AdminTd>
                    <span className="text-xs text-gray-600">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    <span className="text-xs text-gray-600">
                      {s.duration_ms != null ? `${Math.round(s.duration_ms / 1000)}s` : "—"}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    {s.public_url ? (
                      <audio controls preload="none" src={s.public_url} className="max-w-[220px] h-8" />
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </AdminTd>
                  <AdminTd>{s.is_hidden ? "Hidden" : "Visible"}</AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      className={adminToolbarButtonClass(patchMutation.isPending)}
                      onClick={() =>
                        patchMutation.mutate({ id: s.id, is_hidden: !s.is_hidden })
                      }
                    >
                      {s.is_hidden ? (
                        <>
                          <Eye className="mr-1 inline h-4 w-4" aria-hidden /> Show
                        </>
                      ) : (
                        <>
                          <EyeOff className="mr-1 inline h-4 w-4" aria-hidden /> Hide
                        </>
                      )}
                    </button>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>
    </div>
  );
}
