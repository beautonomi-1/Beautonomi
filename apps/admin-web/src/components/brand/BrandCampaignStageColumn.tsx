import { Link } from "react-router";
import { cn } from "@/lib/cn";
import { adminSpaTo } from "@/lib/adminSpaPath";
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

const STAGE_OPTIONS: BrandCampaignStage[] = ["planning", "creative", "live", "measuring", "closed"];

export function BrandCampaignStageColumn({
  stage,
  campaigns,
  onStageChange,
}: {
  stage: BrandCampaignStage;
  campaigns: BoardCampaign[];
  onStageChange: (campaign: BoardCampaign, next: BrandCampaignStage) => void;
}) {
  return (
    <div
      className="flex min-w-[240px] flex-1 flex-col rounded-lg border bg-zinc-50/80"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/campaign-id");
        const camp = campaigns.find((c) => c.id === id);
        if (camp) onStageChange(camp, stage);
      }}
    >
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
        {stage} ({campaigns.length})
      </div>
      <div className="flex flex-col gap-2 p-2">
        {campaigns.map((c) => (
          <div
            key={c.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/campaign-id", c.id);
              e.dataTransfer.setData("text/updated-at", c.updated_at);
            }}
            className={cn("rounded-md border bg-white p-2 shadow-sm")}
          >
            <Link to={adminSpaTo(`/admin/brand/campaigns/${c.id}`)} className="text-sm font-medium text-violet-700">
              {c.name}
            </Link>
            <p className="mt-1 text-[11px] text-zinc-500">{c.tracking_code}</p>
            <select
              className="mt-2 w-full rounded border px-1 py-0.5 text-xs"
              value={c.stage}
              onChange={(e) => onStageChange(c, e.target.value as BrandCampaignStage)}
            >
              {STAGE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
