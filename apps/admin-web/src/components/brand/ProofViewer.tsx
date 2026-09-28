import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";

export type ProofComment = {
  id: string;
  body: string;
  pos_x: number | null;
  pos_y: number | null;
  resolved: boolean;
  created_at: string;
};

type Props = {
  versionId: string;
  compareVersionId?: string | null;
  label?: string;
};

export function ProofViewer({ versionId, compareVersionId, label }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);

  const urlQ = useQuery({
    queryKey: ["brand-asset-version-url", versionId],
    queryFn: () =>
      adminApi.getJson<{ signed_url: string | null; mime_type: string }>(
        `/api/admin/brand/asset-versions/${versionId}/signed-url`,
      ),
  });

  const compareQ = useQuery({
    queryKey: ["brand-asset-version-url", compareVersionId],
    queryFn: () =>
      adminApi.getJson<{ signed_url: string | null; mime_type: string }>(
        `/api/admin/brand/asset-versions/${compareVersionId!}/signed-url`,
      ),
    enabled: !!compareVersionId,
  });

  const commentsQ = useQuery({
    queryKey: ["brand-proof-comments", versionId],
    queryFn: () =>
      adminApi.getJson<{ items: ProofComment[] }>(
        `/api/admin/brand/asset-versions/${versionId}/proof-comments`,
      ),
  });

  const addMut = useMutation({
    mutationFn: () =>
      adminApi.postJson(`/api/admin/brand/asset-versions/${versionId}/proof-comments`, {
        body: draft.trim(),
        pos_x: pendingPin?.x,
        pos_y: pendingPin?.y,
      }),
    onSuccess: () => {
      setDraft("");
      setPendingPin(null);
      void qc.invalidateQueries({ queryKey: ["brand-proof-comments", versionId] });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const pins = useMemo(
    () => (commentsQ.data?.items ?? []).filter((c) => c.pos_x != null && c.pos_y != null),
    [commentsQ.data?.items],
  );

  const primaryUrl = urlQ.data?.signed_url;
  const compareUrl = compareQ.data?.signed_url;
  const isImage = (urlQ.data?.mime_type ?? "").startsWith("image/");

  return (
    <div className="space-y-3">
      {label ? <p className="text-sm font-medium text-zinc-700">{label}</p> : null}
      <div className={compareVersionId ? "grid gap-3 md:grid-cols-2" : ""}>
        <ProofPane
          title={compareVersionId ? "Version A" : undefined}
          url={primaryUrl}
          isImage={isImage}
          pins={pins}
          onImageClick={(x, y) => {
            setPendingPin({ x, y });
            adminToast.info("Pin set — add your comment below");
          }}
        />
        {compareVersionId ? (
          <ProofPane title="Version B" url={compareUrl} isImage={(compareQ.data?.mime_type ?? "").startsWith("image/")} />
        ) : null}
      </div>
      <ul className="space-y-2 text-sm">
        {(commentsQ.data?.items ?? []).map((c) => (
          <li key={c.id} className="rounded border border-zinc-100 p-2">
            {c.pos_x != null ? (
              <span className="mr-2 text-xs text-violet-600">
                pin {Math.round(Number(c.pos_x) * 100)}%, {Math.round(Number(c.pos_y) * 100)}%
              </span>
            ) : null}
            {c.body}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
          placeholder={pendingPin ? "Comment for pinned spot…" : "Add proof comment…"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={!draft.trim() || addMut.isPending}
          onClick={() => addMut.mutate()}
        >
          Post
        </button>
      </div>
    </div>
  );
}

function ProofPane({
  title,
  url,
  isImage,
  pins,
  onImageClick,
}: {
  title?: string;
  url?: string | null;
  isImage: boolean;
  pins?: ProofComment[];
  onImageClick?: (x: number, y: number) => void;
}) {
  if (!url) return <div className="h-48 animate-pulse rounded bg-zinc-100" />;
  if (!isImage) {
    return (
      <div className="rounded border p-4 text-sm">
        {title ? <p className="mb-2 font-medium">{title}</p> : null}
        <a href={url} target="_blank" rel="noreferrer" className="text-violet-600 underline">
          Open asset
        </a>
      </div>
    );
  }
  return (
    <div className="relative">
      {title ? <p className="mb-1 text-xs font-medium text-zinc-500">{title}</p> : null}
      <button
        type="button"
        className="relative block w-full overflow-hidden rounded border"
        onClick={(e) => {
          if (!onImageClick) return;
          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          const y = (e.clientY - rect.top) / rect.height;
          onImageClick(x, y);
        }}
      >
        <img src={url} alt="" className="max-h-[420px] w-full object-contain" />
        {(pins ?? []).map((p) => (
          <span
            key={p.id}
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-violet-600 shadow"
            style={{ left: `${Number(p.pos_x) * 100}%`, top: `${Number(p.pos_y) * 100}%` }}
          />
        ))}
      </button>
      {onImageClick ? <p className="mt-1 text-xs text-zinc-500">Click image to drop a pin</p> : null}
    </div>
  );
}
