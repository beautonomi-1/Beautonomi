import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminToast } from "@/lib/adminToast";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { channelLabel } from "@/routes/brand/brandChannels";

type WeeklyRow = {
  id: string;
  name: string | null;
  channel_key: string;
  campaign_id: string;
  campaign_name: string;
  last_metric_at: string | null;
};

type RowDraft = {
  placement_id: string;
  as_of: string;
  spend: string;
  impressions: string;
  clicks: string;
  reach: string;
};

export function BrandWeeklyUpdatePage() {
  useAdminDocumentTitle("Brand — Weekly update");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const q = useQuery({
    queryKey: adminQueryKeys.brandWeeklyUpdate(),
    queryFn: () => adminApi.getJson<{ rows: WeeklyRow[] }>("/api/admin/brand/weekly-update"),
  });

  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [csvPlacementId, setCsvPlacementId] = useState("");
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<
    Array<{ placement_id: string; as_of: string; spend?: number; impressions?: number; clicks?: number }>
  >([]);

  const rows = q.data?.rows ?? [];

  const getDraft = (row: WeeklyRow): RowDraft =>
    drafts[row.id] ?? {
      placement_id: row.id,
      as_of: today,
      spend: "",
      impressions: "",
      clicks: "",
      reach: "",
    };

  const saveMut = useMutation({
    mutationFn: (): Promise<{ saved?: number }> => {
      const payload = rows
        .map((r) => getDraft(r))
        .map((d) => ({
          placement_id: d.placement_id,
          as_of: d.as_of,
          spend: d.spend ? Number(d.spend) : undefined,
          impressions: d.impressions ? Number(d.impressions) : undefined,
          clicks: d.clicks ? Number(d.clicks) : undefined,
          reach: d.reach ? Number(d.reach) : undefined,
        }))
        .filter(
          (r) =>
            r.spend != null || r.impressions != null || r.clicks != null || r.reach != null,
        );
      return adminApi.postJson<{ saved?: number }>("/api/admin/brand/weekly-update", { rows: payload });
    },
    onSuccess: (res) => {
      adminToast.success(`Saved ${res?.saved ?? 0} metric entries`);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandWeeklyUpdate() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandMyWork() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const parseMut = useMutation({
    mutationFn: () =>
      adminApi.postJson<{ preview: typeof csvPreview }>("/api/admin/brand/metrics/parse-csv", {
        csv: csvText,
        placement_id: csvPlacementId,
      }),
    onSuccess: (data) => {
      setCsvPreview(data.preview ?? []);
      adminToast.success(`Parsed ${data.preview?.length ?? 0} rows`);
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const applyCsvMut = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/brand/weekly-update", {
        rows: csvPreview.map((p) => ({
          placement_id: p.placement_id,
          as_of: p.as_of,
          spend: p.spend,
          impressions: p.impressions,
          clicks: p.clicks,
        })),
      }),
    onSuccess: () => {
      adminToast.success("CSV rows applied");
      setCsvPreview([]);
      setCsvText("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandWeeklyUpdate() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const placementOptions = useMemo(
    () => rows.map((r) => ({ id: r.id, label: `${r.campaign_name} · ${r.name ?? channelLabel(r.channel_key)}` })),
    [rows],
  );

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton rows={8} />;
  if (q.error) return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Weekly update"
        description="Enter paid and offline line metrics for live campaigns. Dates are UTC."
        actions={
          <Link to={adminSpaTo("/admin/brand")} className="text-sm text-violet-700 hover:underline">
            Back to My work
          </Link>
        }
      />

      <AdminPanel title="Inline grid">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No paid placements on live campaigns.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-zinc-500">
                  <th className="py-2 pr-2">Campaign / line</th>
                  <th className="py-2 pr-2">As of</th>
                  <th className="py-2 pr-2">Spend</th>
                  <th className="py-2 pr-2">Impressions</th>
                  <th className="py-2 pr-2">Clicks</th>
                  <th className="py-2 pr-2">Reach (est.)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const d = getDraft(row);
                  const set = (patch: Partial<RowDraft>) =>
                    setDrafts((prev) => ({ ...prev, [row.id]: { ...getDraft(row), ...patch } }));
                  return (
                    <tr key={row.id} className="border-b border-zinc-100">
                      <td className="py-2 pr-2">
                        <div className="font-medium">{row.campaign_name}</div>
                        <div className="text-xs text-zinc-500">
                          {row.name ?? channelLabel(row.channel_key)}
                          {row.last_metric_at ? (
                            <span> · last {row.last_metric_at.slice(0, 10)}</span>
                          ) : (
                            <span className="text-amber-700"> · never updated</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="date"
                          className="w-full rounded border px-1 py-1 text-xs"
                          value={d.as_of}
                          onChange={(e) => set({ as_of: e.target.value })}
                        />
                      </td>
                      {(["spend", "impressions", "clicks", "reach"] as const).map((k) => (
                        <td key={k} className="py-2 pr-2">
                          <input
                            type="number"
                            className="w-full rounded border px-1 py-1 text-xs"
                            value={d[k]}
                            onChange={(e) => set({ [k]: e.target.value })}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <button
          type="button"
          className="mt-3 rounded bg-violet-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={saveMut.isPending || rows.length === 0}
          onClick={() => saveMut.mutate()}
        >
          Save all rows
        </button>
      </AdminPanel>

      <AdminPanel title="Paste CSV">
        <p className="mb-2 text-xs text-zinc-500">
          Header row: date, spend, impressions, clicks (or as_of). Applies to one placement at a time.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="block text-sm">
            Placement
            <select
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={csvPlacementId}
              onChange={(e) => setCsvPlacementId(e.target.value)}
            >
              <option value="">Select…</option>
              {placementOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          className="mt-2 w-full rounded border p-2 font-mono text-xs"
          rows={5}
          placeholder="date,spend,impressions,clicks&#10;2026-03-01,1200,50000,800"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            disabled={!csvPlacementId || !csvText.trim() || parseMut.isPending}
            onClick={() => parseMut.mutate()}
          >
            Preview
          </button>
          <button
            type="button"
            className="rounded bg-violet-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={csvPreview.length === 0 || applyCsvMut.isPending}
            onClick={() => applyCsvMut.mutate()}
          >
            Apply preview ({csvPreview.length})
          </button>
        </div>
        {csvPreview.length > 0 && (
          <pre className="mt-3 overflow-auto rounded bg-zinc-50 p-2 text-xs">{JSON.stringify(csvPreview, null, 2)}</pre>
        )}
      </AdminPanel>
    </div>
  );
}
