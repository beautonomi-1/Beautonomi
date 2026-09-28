import { canMoveCampaignToStage } from "@/lib/brandStageMoves";
import { BRAND_CAMPAIGN_STAGES, STAGE_META, type BrandCampaignStage } from "@/routes/brand/brandTypes";
import { cn } from "@/lib/cn";

export function StageStepper({
  current,
  onStageSelect,
}: {
  current: BrandCampaignStage;
  onStageSelect?: (stage: BrandCampaignStage) => void;
}) {
  const idx = BRAND_CAMPAIGN_STAGES.indexOf(current);

  return (
    <ol className="flex flex-wrap gap-2 text-xs" role={onStageSelect ? "list" : undefined}>
      {BRAND_CAMPAIGN_STAGES.map((s, i) => {
        const meta = STAGE_META[s];
        const isCurrent = i === idx;
        const isPast = i < idx;
        const gate = onStageSelect ? canMoveCampaignToStage(current, s) : { allowed: true };
        const disabled = Boolean(onStageSelect && !gate.allowed && !isCurrent);

        const className = cn(
          "rounded-full px-3 py-1 capitalize transition-colors",
          isCurrent && "bg-zinc-900 text-white",
          !isCurrent && isPast && "bg-violet-100 text-violet-900",
          !isCurrent && !isPast && "bg-zinc-100 text-zinc-500",
          onStageSelect && !disabled && !isCurrent && "hover:bg-zinc-200 cursor-pointer",
          disabled && "cursor-not-allowed opacity-50",
        );

        if (onStageSelect) {
          return (
            <li key={s}>
              <button
                type="button"
                className={className}
                disabled={disabled}
                title={disabled ? gate.reason : meta.description}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => {
                  if (s !== current && gate.allowed) onStageSelect(s);
                }}
              >
                {meta.label}
              </button>
            </li>
          );
        }

        return (
          <li key={s} className={className} title={meta.description}>
            {meta.label}
          </li>
        );
      })}
    </ol>
  );
}
