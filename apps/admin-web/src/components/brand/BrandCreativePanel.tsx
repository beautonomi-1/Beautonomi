import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { BrandAssetUpload } from "@/components/brand/BrandAssetUpload";
import { ProofViewer } from "@/components/brand/ProofViewer";

type AssetRow = {
  id: string;
  name: string;
  status: string;
  rights_expires_at: string | null;
  brand_asset_versions: Array<{ id: string; version_number: number; mime_type: string }>;
};

type Props = {
  campaignId: string;
};

export function BrandCreativePanel({ campaignId }: Props) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["brand-campaign-assets", campaignId],
    queryFn: () =>
      adminApi.getJson<{ items: AssetRow[] }>(`/api/admin/brand/campaigns/${campaignId}/assets`),
  });

  const items = q.data?.items ?? [];

  return (
    <div className="space-y-4">
      <AdminPanel title="Upload creative">
        <BrandAssetUpload campaignId={campaignId} onDone={() => void q.refetch()} />
      </AdminPanel>
      <AdminPanel title="Deliverables">
        {q.isLoading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
        <ul className="divide-y text-sm">
          {items.map((a) => {
            const versions = a.brand_asset_versions ?? [];
            const rightsWarn =
              a.rights_expires_at && new Date(a.rights_expires_at) < new Date(Date.now() + 30 * 86400000);
            const versionIds = new Set(versions.map((v) => v.id));
            const selectedForAsset = selectedVersionId && versionIds.has(selectedVersionId) ? selectedVersionId : "";
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium">{a.name}</span>
                <span className="text-xs capitalize text-zinc-500">{a.status}</span>
                {rightsWarn ? <span className="text-xs text-amber-700">Rights expiring soon</span> : null}
                <select
                  className="ml-auto rounded border px-2 py-1 text-xs"
                  value={selectedForAsset}
                  onChange={(e) => {
                    setSelectedVersionId(e.target.value || null);
                    setCompareVersionId(null);
                  }}
                >
                  <option value="">Review version…</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version_number}
                    </option>
                  ))}
                </select>
                {versions.length > 1 && selectedVersionId ? (
                  <select
                    className="rounded border px-2 py-1 text-xs"
                    value={compareVersionId ?? ""}
                    onChange={(e) => setCompareVersionId(e.target.value || null)}
                  >
                    <option value="">Compare with…</option>
                    {versions.filter((v) => v.id !== selectedVersionId).map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version_number}
                      </option>
                    ))}
                  </select>
                ) : null}
              </li>
            );
          })}
        </ul>
      </AdminPanel>
      {selectedVersionId ? (
        <AdminPanel title="Proof review">
          <ProofViewer versionId={selectedVersionId} compareVersionId={compareVersionId} />
        </AdminPanel>
      ) : null}
    </div>
  );
}
