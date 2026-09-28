import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";

type Props = {
  campaignId: string;
  campaignName: string;
};

export function BrandEvidencePackPanel({ campaignId, campaignName }: Props) {
  const [packId, setPackId] = useState<string | null>(null);
  const [packReady, setPackReady] = useState(false);

  const buildMut = useMutation({
    mutationFn: (id: string) => adminApi.postJson(`/api/admin/brand/evidence-pack/${id}/build`, {}),
    onSuccess: () => {
      setPackReady(true);
      adminToast.success("Pack assembled — download when ready");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const queueMut = useMutation({
    mutationFn: () =>
      adminApi.postJson<{ id: string }>("/api/admin/brand/evidence-pack", {
        label: `${campaignName} evidence`,
        campaign_id: campaignId,
      }),
    onSuccess: (row) => {
      setPackId(row.id);
      setPackReady(false);
      adminToast.success("Evidence pack queued");
      buildMut.mutate(row.id);
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const downloadMut = useMutation({
    mutationFn: async (id: string) => {
      const { signed_url } = await adminApi.getJson<{ signed_url: string | null }>(
        `/api/admin/brand/evidence-pack/${id}/download-url`,
      );
      if (!signed_url) throw new Error("Download not ready");
      window.open(signed_url, "_blank", "noopener,noreferrer");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <button
        type="button"
        className="rounded border px-3 py-1.5"
        disabled={queueMut.isPending || buildMut.isPending}
        onClick={() => queueMut.mutate()}
      >
        Build evidence ZIP
      </button>
      {packId && packReady ? (
        <button
          type="button"
          className="rounded bg-zinc-900 px-3 py-1.5 text-white disabled:opacity-50"
          disabled={downloadMut.isPending}
          onClick={() => downloadMut.mutate(packId)}
        >
          Download pack
        </button>
      ) : null}
    </div>
  );
}
