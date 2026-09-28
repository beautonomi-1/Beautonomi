import { useRef } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { BrandCalendarGantt, type BrandCalendarGanttHandle } from "@/components/brand/BrandCalendarGantt";
import { adminToast } from "@/lib/adminToast";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { BRAND_CAMPAIGN_STAGES, STAGE_META, brandButtonSecondaryClass, brandSelectClass } from "@/routes/brand/brandTypes";
import { downloadAdminBlob } from "@/lib/adminCsvDownload";

type OwnedClash = {
  placement_id?: string;
  channel_key: string;
  campaign_id: string;
  campaign_name: string;
  flight_start: string;
  flight_end: string;
};

type Zoom = "month" | "quarter" | "year";

export function BrandCalendarPage() {
  useAdminDocumentTitle("Brand calendar");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [searchParams, setSearchParams] = useSearchParams();
  const groupBy = searchParams.get("group") === "none" ? "none" : "pillar";
  const zoom = (searchParams.get("zoom") as Zoom | null) ?? "quarter";
  const ganttRef = useRef<BrandCalendarGanttHandle>(null);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["brand-calendar"],
    queryFn: () =>
      adminApi.getJson<{
        campaigns: Array<{
          id: string;
          name: string;
          flight_start: string | null;
          flight_end: string | null;
          stage: string;
          pillar_name: string | null;
          out_of_plan: boolean;
          unlinked: boolean;
        }>;
        plan_bands: Array<{ pillar_name: string; year: number; quarter: number; gap: boolean }>;
        clashes: OwnedClash[];
      }>("/api/admin/brand/calendar"),
  });

  const rescheduleMut = useMutation({
    mutationFn: (input: { id: string; flight_start: string; flight_end: string }) =>
      adminApi.patchJson(`/api/admin/brand/campaigns/${input.id}`, {
        flight_start: input.flight_start,
        flight_end: input.flight_end,
      }),
    onSuccess: () => {
      adminToast.success("Campaign rescheduled");
      void qc.invalidateQueries({ queryKey: ["brand-calendar"] });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const patchParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set(key, value);
      return p;
    });
  };

  const exportIcs = async () => {
    try {
      await downloadAdminBlob("/api/admin/brand/calendar.ics", "brand-calendar.ics");
    } catch (e) {
      adminToast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton rows={6} />;
  if (q.error) return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;

  const items = q.data?.campaigns ?? [];
  const clashes = q.data?.clashes ?? [];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Calendar"
        description="Campaign flights with strategy context, quarter bands and clash warnings."
        actions={
          <div className="flex flex-wrap gap-2">
            <select
              className={brandSelectClass}
              value={groupBy}
              onChange={(e) => patchParam("group", e.target.value)}
              aria-label="Group campaigns"
            >
              <option value="pillar">Group by pillar</option>
              <option value="none">Flat list</option>
            </select>
            <select
              className={brandSelectClass}
              value={zoom}
              onChange={(e) => patchParam("zoom", e.target.value)}
              aria-label="Timeline zoom"
            >
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
              <option value="year">Year</option>
            </select>
            <button type="button" className={brandButtonSecondaryClass} onClick={() => ganttRef.current?.scrollToToday()}>
              Jump to today
            </button>
            <button type="button" className={brandButtonSecondaryClass} onClick={() => void exportIcs()}>
              Export ICS
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
        {BRAND_CAMPAIGN_STAGES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STAGE_META[s].dotClass}`} aria-hidden />
            {STAGE_META[s].label}
          </span>
        ))}
      </div>

      {(q.data?.plan_bands ?? []).some((b) => b.gap) ? (
        <p className="text-sm text-amber-800">Some quarters have plan budget but no linked campaign yet.</p>
      ) : null}

      {clashes.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Owned channel clashes</p>
          <ul className="mt-2 space-y-1">
            {clashes.map((c, i) => (
              <li key={`${c.campaign_id}-${c.channel_key}-${i}`}>
                <Link
                  to={adminSpaTo(`/admin/brand/campaigns/${c.campaign_id}`)}
                  className="font-medium text-violet-800 hover:underline"
                >
                  {c.campaign_name}
                </Link>
                {" · "}
                {c.channel_key} ({c.flight_start.slice(0, 10)} → {c.flight_end.slice(0, 10)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-zinc-500">Drag planning campaign bars to shift flight dates. Live and later stages are locked.</p>

      {items.length === 0 ? (
        <EmptyState
          title="No campaigns on the calendar"
          description="Create a brief or campaign with flight dates to see it here."
          action={
            <Link to={adminSpaTo("/admin/brand/briefs")} className={brandButtonSecondaryClass}>
              Go to Briefs
            </Link>
          }
        />
      ) : (
        <BrandCalendarGantt
          ref={ganttRef}
          items={items}
          groupBy={groupBy}
          planBands={q.data?.plan_bands}
          zoom={zoom}
          reschedulingId={rescheduleMut.isPending ? rescheduleMut.variables?.id : null}
          onReschedule={async (input) => {
            await rescheduleMut.mutateAsync(input);
          }}
        />
      )}
    </div>
  );
}
