import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  BrandCampaignStageColumn,
  type BoardCampaign,
} from "@/components/brand/BrandCampaignStageColumn";
import { useBrandCampaignStageChange } from "@/components/brand/BrandCampaignStageDialogs";
import { canMoveCampaignToStage } from "@/lib/brandStageMoves";
import { BRAND_CAMPAIGN_STAGES, STAGE_META, brandSelectClass, type BrandCampaignStage } from "@/routes/brand/brandTypes";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { cn } from "@/lib/cn";

export function BrandBoardPage() {
  useAdminDocumentTitle("Brand board");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const { bootstrap } = useAdminSession();
  const isDesktop = useIsDesktop();
  const [searchParams, setSearchParams] = useSearchParams();

  const searchQ = (searchParams.get("q") ?? "").trim().toLowerCase();
  const ownerFilter = searchParams.get("owner") === "mine" ? "mine" : "all";
  const hideClosed = searchParams.get("hideClosed") !== "0";
  const mobileStage = (searchParams.get("stage") as BrandCampaignStage | null) ?? "planning";

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
  const filtered = useMemo(() => {
    let list = items;
    if (ownerFilter === "mine") {
      if (bootstrap?.userId) {
        list = list.filter((c) => c.owner_id === bootstrap.userId);
      }
    }
    if (searchQ) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQ) ||
          c.tracking_code.toLowerCase().includes(searchQ),
      );
    }
    return list;
  }, [items, ownerFilter, bootstrap?.userId, searchQ]);

  const visibleStages = useMemo(
    () => (hideClosed ? BRAND_CAMPAIGN_STAGES.filter((s) => s !== "closed") : [...BRAND_CAMPAIGN_STAGES]),
    [hideClosed],
  );

  const campaignById = useMemo(() => new Map(filtered.map((c) => [c.id, c])), [filtered]);
  const draggedCampaign = draggedCampaignId ? (campaignById.get(draggedCampaignId) ?? null) : null;

  const byStage = useMemo(() => {
    const map: Record<BrandCampaignStage, BoardCampaign[]> = {
      planning: [],
      creative: [],
      live: [],
      measuring: [],
      closed: [],
    };
    for (const c of filtered) {
      map[c.stage].push(c);
    }
    return map;
  }, [filtered]);

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

  const patchParams = (patch: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") p.delete(k);
        else p.set(k, v);
      }
      return p;
    });
  };

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
    dragEnabled: isDesktop,
  };

  const activeMobileStage = visibleStages.includes(mobileStage) ? mobileStage : visibleStages[0]!;

  return (
    <div className="space-y-4">
      {dialogs}
      <AdminPageHeader
        title="Board"
        description="Drag campaigns between stages or use Move to…. Go-live and close-out use the same checks as campaign detail."
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search name or code…"
          className={cn(brandSelectClass, "min-w-[12rem] flex-1")}
          value={searchParams.get("q") ?? ""}
          onChange={(e) => patchParams({ q: e.target.value || null })}
        />
        <select
          className={brandSelectClass}
          value={ownerFilter}
          onChange={(e) => patchParams({ owner: e.target.value === "mine" ? "mine" : null })}
          aria-label="Owner filter"
        >
          <option value="all">All owners</option>
          <option value="mine">Mine</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={hideClosed}
            onChange={(e) => patchParams({ hideClosed: e.target.checked ? null : "0" })}
          />
          Hide closed
        </label>
      </div>

      {!isDesktop ? (
        <>
          <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Board stage">
            {visibleStages.map((stage) => (
              <button
                key={stage}
                type="button"
                role="tab"
                aria-selected={activeMobileStage === stage}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
                  activeMobileStage === stage ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600",
                )}
                onClick={() => patchParams({ stage })}
              >
                {STAGE_META[stage].label} ({byStage[stage].length})
              </button>
            ))}
          </div>
          <BrandCampaignStageColumn
            stage={activeMobileStage}
            campaigns={byStage[activeMobileStage]}
            {...columnProps}
          />
        </>
      ) : (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4">
          {visibleStages.map((stage) => (
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
