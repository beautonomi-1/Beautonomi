import { type MouseEvent, useRef } from "react";
import { Link } from "react-router";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { allowedStageTargets, canMoveCampaignToStage } from "@/lib/brandStageMoves";
import type { BrandCampaignStage } from "@/routes/brand/brandTypes";

export type BoardCampaign = {
  id: string;
  name: string;
  stage: BrandCampaignStage;
  tracking_code: string;
  budget_envelope: number | null;
  updated_at: string;
  owner_id: string | null;
};

function BoardCard({
  campaign,
  onStageChange,
  isDragging,
  onDragStart,
  onDragEnd,
  suppressCardClickRef,
}: {
  campaign: BoardCampaign;
  onStageChange: (campaign: BoardCampaign, next: BrandCampaignStage) => void;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, cardEl: HTMLElement) => void;
  onDragEnd: () => void;
  suppressCardClickRef: React.MutableRefObject<boolean>;
}) {
  const options = allowedStageTargets(campaign.stage);
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative">
      {isDragging && (
        <div
          className="absolute inset-0 z-0 flex min-h-[4.5rem] items-center justify-center rounded-md border-2 border-dashed border-zinc-300 bg-zinc-100/90 text-[10px] font-medium text-zinc-400"
          aria-hidden
        >
          Drop in another stage
        </div>
      )}
      <div className={cn("relative z-10 rounded-md border bg-white p-2 shadow-sm", isDragging && "opacity-0")}>
        <div className="flex items-start gap-2">
          <div
            draggable
            onDragStart={(e) => {
              const el = cardRef.current;
              if (el) onDragStart(e, el);
            }}
            onDragEnd={onDragEnd}
            className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-zinc-400 hover:bg-zinc-100 active:cursor-grabbing"
            aria-label="Drag campaign"
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </div>
          <div ref={cardRef} className="min-w-0 flex-1">
            <Link
              to={adminSpaTo(`/admin/brand/campaigns/${campaign.id}`)}
              className="text-sm font-medium text-violet-700"
              onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                if (suppressCardClickRef.current) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              {campaign.name}
            </Link>
            <p className="mt-1 text-[11px] text-zinc-500">{campaign.tracking_code}</p>
            <select
              className="mt-2 w-full rounded border px-1 py-0.5 text-xs"
              value={campaign.stage}
              onChange={(e) => onStageChange(campaign, e.target.value as BrandCampaignStage)}
            >
              {options.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandCampaignStageColumn({
  stage,
  campaigns,
  onStageChange,
  dragOverStage,
  draggedCampaign,
  onDragOverStage,
  onDrop,
  onDragStart,
  onDragEnd,
  suppressCardClickRef,
}: {
  stage: BrandCampaignStage;
  campaigns: BoardCampaign[];
  onStageChange: (campaign: BoardCampaign, next: BrandCampaignStage) => void;
  dragOverStage: BrandCampaignStage | null;
  draggedCampaign: BoardCampaign | null;
  onDragOverStage: (stage: BrandCampaignStage | null) => void;
  onDrop: (targetStage: BrandCampaignStage, e: React.DragEvent) => void;
  onDragStart: (e: React.DragEvent, campaign: BoardCampaign, cardEl: HTMLElement) => void;
  onDragEnd: () => void;
  suppressCardClickRef: React.MutableRefObject<boolean>;
}) {
  const isOver = dragOverStage === stage;
  const dropGate =
    draggedCampaign != null ? canMoveCampaignToStage(draggedCampaign.stage, stage) : { allowed: true };
  const dimmed = draggedCampaign != null && !dropGate.allowed;

  return (
    <div
      title={dimmed ? dropGate.reason : undefined}
      className={cn(
        "flex min-w-[240px] flex-1 flex-col rounded-lg border bg-zinc-50/80 transition-all duration-150",
        isOver && !dimmed && "border-violet-400 bg-violet-50/50 ring-2 ring-violet-200/60",
        dimmed && "opacity-50",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = dropGate.allowed ? "move" : "none";
        if (dropGate.allowed) onDragOverStage(stage);
      }}
      onDragLeave={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        onDragOverStage(null);
      }}
      onDrop={(ev) => {
        if (!dropGate.allowed) return;
        onDrop(stage, ev);
      }}
    >
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
        {stage} ({campaigns.length})
      </div>
      <div className="flex min-h-[120px] flex-col gap-2 p-2">
        {campaigns.map((c) => (
          <BoardCard
            key={c.id}
            campaign={c}
            onStageChange={onStageChange}
            isDragging={draggedCampaign?.id === c.id}
            onDragStart={(e, cardEl) => onDragStart(e, c, cardEl)}
            onDragEnd={onDragEnd}
            suppressCardClickRef={suppressCardClickRef}
          />
        ))}
      </div>
    </div>
  );
}
