import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { BrandCalendarGantt } from "@/components/brand/BrandCalendarGantt";
export function BrandCalendarPage() {
  useAdminDocumentTitle("Brand calendar");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");

  const q = useQuery({
    queryKey: adminQueryKeys.brandCampaigns(),
    queryFn: () =>
      adminApi.getJson<{
        items: Array<{
          id: string;
          name: string;
          flight_start: string | null;
          flight_end: string | null;
          stage: string;
        }>;
      }>("/api/admin/brand/campaigns"),
  });

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton rows={6} />;

  const items = q.data?.items ?? [];

  return (
    <div className="space-y-4">
      <AdminPageHeader title="Calendar" description="Campaign flights at a glance. Open a campaign for placement-level dates." />
      <BrandCalendarGantt items={items} />
    </div>
  );
}
