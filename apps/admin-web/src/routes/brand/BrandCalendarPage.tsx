import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { BrandCalendarGantt } from "@/components/brand/BrandCalendarGantt";
import { adminToast } from "@/lib/adminToast";

export function BrandCalendarPage() {
  useAdminDocumentTitle("Brand calendar");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [groupBy, setGroupBy] = useState<"none" | "pillar">("pillar");
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
        clashes: unknown[];
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

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton rows={6} />;

  const items = q.data?.campaigns ?? [];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Calendar"
        description="Campaign flights with strategy context, quarter bands and clash warnings."
        actions={
          <div className="flex gap-2">
            <select className="rounded border px-2 py-1 text-sm" value={groupBy} onChange={(e) => setGroupBy(e.target.value as "none" | "pillar")}>
              <option value="pillar">Group by pillar</option>
              <option value="none">Flat list</option>
            </select>
            <a href="/api/admin/brand/calendar.ics" className="rounded border px-3 py-1 text-sm hover:bg-zinc-50">
              Export ICS
            </a>
          </div>
        }
      />
      {(q.data?.plan_bands ?? []).some((b) => b.gap) ? (
        <p className="text-sm text-amber-800">Some quarters have plan budget but no linked campaign yet.</p>
      ) : null}
      <p className="text-xs text-zinc-500">Drag planning campaign bars to shift flight dates. Live and later stages are locked.</p>
      <BrandCalendarGantt
        items={items}
        groupBy={groupBy}
        reschedulingId={rescheduleMut.isPending ? rescheduleMut.variables?.id : null}
        onReschedule={async (input) => {
          await rescheduleMut.mutateAsync(input);
        }}
      />
    </div>
  );
}
