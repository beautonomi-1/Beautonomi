import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  BrandCampaignStageColumn,
  type BoardCampaign,
} from "@/components/brand/BrandCampaignStageColumn";
import { useBrandCampaignStageChange } from "@/components/brand/BrandCampaignStageDialogs";
import { canMoveCampaignToStage } from "@/lib/brandStageMoves";
import type { BrandCampaignStage } from "@/routes/brand/brandTypes";
import { useIsDesktop } from "@/hooks/useIsDesktop";

const STAGES: BrandCampaignStage[] = ["planning", "creative", "live", "measuring", "closed"];

export function BrandBoardPage() {
  useAdminDocumentTitle("Brand board");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const isDesktop = useIsDesktop();

  const [dragOverStage, setDragOverStage] = useState<BrandCampaignStage | null>(null);
  const [draggedCampaignId, setDraggedCampaignId] = useState<string | null>(null);
  const dragPreviewNodeRef = useRef<HTMLElement | null>(null);
  const suppressCardClickRef = useRef(false);

  const q = useQuery({
    queryKey: adminQueryKeys.brandCampaigns(),
    queryFn: () => adminApi.getJson<{ items: BoardCampaign[] }>("/api/admin/brand/campaigns"),
  });

  const { requestStageChange, dialogs } = useBrandCampaignStageChange({
    onSuccess: () => void q.refetch(),
  });

  const items = q.data?.items ?? [];
  const campaignById = useMemo(() => new Map(items.map((c) => [c.id, c])), [items]);
  const draggedCampaign = draggedCampaignId ? (campaignById.get(draggedCampaignId) ?? null) : null;

  const byStage = useMemo(() => {
    const map: Record<BrandCampaignStage, BoardCampaign[]> = {
      planning: [],
      creative: [],
      live: [],
      measuring: [],
      closed: [],
    };
    for (const c of items) {
      map[c.stage].push(c);
    }
    return map;
  }, [items]);

  useEffect(() => {
    return () => {
      dragPreviewNodeRef.current?.remove();
      dragPreviewNodeRef.current = null;
    };
  }, []);

  const cleanupDragPreview = useCallback(() => {
    dragPreviewNodeRef.current?.remove();
    dragPreviewNodeRef.current = null;
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent, campaign: BoardCampaign, cardEl: HTMLElement) => {
      suppressCardClickRef.current = true;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(
        "text/plain",
        `${campaign.id}|${campaign.updated_at}|${campaign.stage}`,
      );
      setDraggedCampaignId(campaign.id);

      const clone = cardEl.cloneNode(true) as HTMLElement;
      clone.style.cssText = [
        "position:fixed",
        "left:-9999px",
        "top:0",
        "opacity:0.72",
        "pointer-events:none",
        `width:${cardEl.offsetWidth}px`,
        "box-shadow:0 14px 28px rgba(0,0,0,0.12)",
        "border-radius:0.375rem",
      ].join(";");
      document.body.appendChild(clone);
      dragPreviewNodeRef.current = clone;

      const rect = cardEl.getBoundingClientRect();
      e.dataTransfer.setDragImage(clone, e.clientX - rect.left, e.clientY - rect.top);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    cleanupDragPreview();
    setDraggedCampaignId(null);
    setDragOverStage(null);
    window.setTimeout(() => {
      suppressCardClickRef.current = false;
    }, 0);
  }, [cleanupDragPreview]);

  const handleDrop = useCallback(
    (targetStage: BrandCampaignStage, e: React.DragEvent) => {
      e.preventDefault();
      setDragOverStage(null);
      const raw = e.dataTransfer.getData("text/plain") || "";
      const parts = raw.split("|");
      const id = parts[0] || draggedCampaignId || "";
      const fromStage = parts[2] as BrandCampaignStage | undefined;
      const campaign = campaignById.get(id);
      if (!campaign) {
        setDraggedCampaignId(null);
        return;
      }
      if (fromStage === targetStage || campaign.stage === targetStage) {
        setDraggedCampaignId(null);
        return;
      }
      const gate = canMoveCampaignToStage(campaign.stage, targetStage);
      if (!gate.allowed) {
        setDraggedCampaignId(null);
        return;
      }
      setDraggedCampaignId(null);
      requestStageChange(campaign, targetStage);
    },
    [campaignById, draggedCampaignId, requestStageChange],
  );

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton rows={6} />;
  if (q.error) return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;

  const columnProps = {
    onStageChange: requestStageChange,
    dragOverStage,
    draggedCampaign,
    onDragOverStage: setDragOverStage,
    onDrop: handleDrop,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    suppressCardClickRef,
  };

  return (
    <div className="space-y-4">
      {dialogs}
      <AdminPageHeader
        title="Board"
        description="Drag campaigns between stages or use the stage menu. Go-live and close-out use the same checks as campaign detail."
      />
      {!isDesktop ? (
        <div className="space-y-4">
          {STAGES.map((stage) => (
            <BrandCampaignStageColumn
              key={stage}
              stage={stage}
              campaigns={byStage[stage]}
              {...columnProps}
            />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <BrandCampaignStageColumn
              key={stage}
              stage={stage}
              campaigns={byStage[stage]}
              {...columnProps}
            />
          ))}
        </div>
      )}
    </div>
  );
}
