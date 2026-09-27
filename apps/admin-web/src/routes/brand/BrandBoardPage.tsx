import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { BrandCampaignStageColumn, type BoardCampaign } from "@/components/brand/BrandCampaignStageColumn";
import { useBrandCampaignStageChange } from "@/components/brand/BrandCampaignStageDialogs";
import type { BrandCampaignStage } from "@/routes/brand/brandTypes";
import { useIsDesktop } from "@/hooks/useIsDesktop";

const STAGES: BrandCampaignStage[] = ["planning", "creative", "live", "measuring", "closed"];

export function BrandBoardPage() {
  useAdminDocumentTitle("Brand board");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const isDesktop = useIsDesktop();

  const q = useQuery({
    queryKey: adminQueryKeys.brandCampaigns(),
    queryFn: () => adminApi.getJson<{ items: BoardCampaign[] }>("/api/admin/brand/campaigns"),
  });

  const { requestStageChange, dialogs } = useBrandCampaignStageChange({
    onSuccess: () => void q.refetch(),
  });

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton rows={6} />;
  if (q.error) return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;

  const items = q.data?.items ?? [];

  const body = STAGES.map((stage) => (
    <BrandCampaignStageColumn
      key={stage}
      stage={stage}
      campaigns={items.filter((c) => c.stage === stage)}
      onStageChange={requestStageChange}
    />
  ));

  return (
    <div className="space-y-4">
      {dialogs}
      <AdminPageHeader
        title="Board"
        description="Drag campaigns between stages or use the stage dropdown. Go-live and close-out use the same confirmation as campaign detail."
      />
      {!isDesktop ? (
        <div className="space-y-4">{body}</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">{body}</div>
      )}
    </div>
  );
}
