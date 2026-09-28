import { type MouseEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { allowedStageTargets, canMoveCampaignToStage } from "@/lib/brandStageMoves";
import { STAGE_META, type BrandCampaignStage } from "@/routes/brand/brandTypes";

export type BoardCampaign = {
  id: string;
  name: string;
  stage: BrandCampaignStage;
  tracking_code: string;
  budget_envelope: number | null;
  updated_at: string;
  owner_id: string | null;
};

function ownerInitials(ownerId: string | null): string {
  if (!ownerId) return "—";
  return ownerId.replace(/-/g, "").slice(-2).toUpperCase();
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 14) return `${days}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function BoardCard({
  campaign,
  onStageChange,
  isDragging,
  onDragStart,
  onDragEnd,
  suppressCardClickRef,
  dragEnabled,
}: {
  campaign: BoardCampaign;
  onStageChange: (campaign: BoardCampaign, next: BrandCampaignStage) => void;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, cardEl: HTMLElement) => void;
  onDragEnd: () => void;
  suppressCardClickRef: React.MutableRefObject<boolean>;
  dragEnabled: boolean;
}) {
  const options = allowedStageTargets(campaign.stage).filter((s) => s !== campaign.stage);
  const cardRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

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
      <div
        ref={cardRef}
        draggable={dragEnabled}
        onDragStart={(e) => {
          if (!dragEnabled || !cardRef.current) return;
          onDragStart(e, cardRef.current);
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "relative z-10 rounded-md border bg-white p-2 shadow-sm",
          isDragging && "opacity-0",
          dragEnabled && "cursor-grab active:cursor-grabbing",
        )}
      >
        <div className="flex items-start gap-2">
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <Link
              to={adminSpaTo(`/admin/brand/campaigns/${campaign.id}`)}
              className="text-sm font-medium text-violet-700 hover:underline"
              onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                if (suppressCardClickRef.current) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              {campaign.name}
            </Link>
            <p className="mt-0.5 text-[11px] text-zinc-500">{campaign.tracking_code}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
              {campaign.budget_envelope != null ? (
                <span>Budget {campaign.budget_envelope.toLocaleString()}</span>
              ) : null}
              <span title={campaign.owner_id ?? undefined}>Owner {ownerInitials(campaign.owner_id)}</span>
              <span>{formatRelative(campaign.updated_at)}</span>
            </div>
            {options.length > 0 ? (
              <div className="relative mt-2" ref={menuRef}>
                <button
                  type="button"
                  className="text-xs font-medium text-violet-700 hover:underline"
                  aria-expanded={menuOpen}
                  aria-haspopup="listbox"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  Move to…
                </button>
                {menuOpen ? (
                  <ul
                    role="listbox"
                    className="absolute left-0 top-full z-20 mt-1 min-w-[8rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                  >
                    {options.map((s) => {
                      const gate = canMoveCampaignToStage(campaign.stage, s);
                      return (
                        <li key={s}>
                          <button
                            type="button"
                            role="option"
                            disabled={!gate.allowed}
                            title={gate.reason}
                            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              setMenuOpen(false);
                              if (gate.allowed) onStageChange(campaign, s);
                            }}
                          >
                            {STAGE_META[s].label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ) : null}
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
  dragEnabled = true,
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
  dragEnabled?: boolean;
}) {
  const meta = STAGE_META[stage];
  const isOver = dragOverStage === stage;
  const dropGate =
    draggedCampaign != null ? canMoveCampaignToStage(draggedCampaign.stage, stage) : { allowed: true };
  const dimmed = draggedCampaign != null && !dropGate.allowed;
  const budgetTotal = campaigns.reduce((sum, c) => sum + (c.budget_envelope ?? 0), 0);

  return (
    <div
      title={dimmed ? dropGate.reason : undefined}
      className={cn(
        "flex w-72 shrink-0 snap-center flex-col rounded-lg border bg-zinc-50/80 transition-all duration-150",
        isOver && !dimmed && "border-violet-400 bg-violet-50/50 ring-2 ring-violet-200/60",
        dimmed && "opacity-50",
      )}
      onDragOver={(e) => {
        if (!dragEnabled) return;
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
        if (!dragEnabled || !dropGate.allowed) return;
        onDrop(stage, ev);
      }}
    >
      <div className="sticky top-0 z-10 shrink-0 border-b bg-zinc-50/95 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-700">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dotClass)} aria-hidden />
          {meta.label}
          <span className="font-normal normal-case text-zinc-500">({campaigns.length})</span>
        </div>
        {budgetTotal > 0 ? (
          <p className="mt-0.5 text-[10px] tabular-nums text-zinc-500">Budget {budgetTotal.toLocaleString()}</p>
        ) : null}
      </div>
      <div className="flex max-h-[calc(100dvh-14rem)] min-h-[120px] flex-col gap-2 overflow-y-auto overscroll-contain p-2">
        {campaigns.length === 0 ? (
          <div className="flex min-h-[6rem] flex-1 items-center justify-center rounded-md border-2 border-dashed border-zinc-200 px-2 text-center text-[11px] text-zinc-400">
            No campaigns in {meta.label.toLowerCase()}
          </div>
        ) : (
          campaigns.map((c) => (
            <BoardCard
              key={c.id}
              campaign={c}
              onStageChange={onStageChange}
              isDragging={draggedCampaign?.id === c.id}
              onDragStart={(e, cardEl) => onDragStart(e, c, cardEl)}
              onDragEnd={onDragEnd}
              suppressCardClickRef={suppressCardClickRef}
              dragEnabled={dragEnabled}
            />
          ))
        )}
      </div>
    </div>
  );
}
