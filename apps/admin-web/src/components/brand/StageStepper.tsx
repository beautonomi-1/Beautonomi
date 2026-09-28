import type { BrandCampaignStage } from "@/routes/brand/brandTypes";

const STEPS: BrandCampaignStage[] = ["planning", "creative", "live", "measuring", "closed"];

export function StageStepper({ current }: { current: BrandCampaignStage }) {
  const idx = STEPS.indexOf(current);
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li
          key={s}
          className={`rounded-full px-3 py-1 capitalize ${
            i === idx ? "bg-zinc-900 text-white" : i < idx ? "bg-violet-100 text-violet-900" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {s}
        </li>
      ))}
    </ol>
  );
}
