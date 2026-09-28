import { Link } from "react-router";
import { adminSpaTo } from "@/lib/adminSpaPath";
import type { BrandCampaignStage } from "@/routes/brand/brandTypes";

export type StageBlocker =
  | { kind: "placement"; placement_id: string; name: string; missing: string[]; href?: string }
  | { kind: "campaign"; field: string; message: string; href?: string }
  | { kind: "approval"; approval_id?: string; message: string }
  | { kind: "checklist"; item_id?: string; message: string };

type Props = {
  campaignId: string;
  targetStage: BrandCampaignStage;
  blockers: StageBlocker[];
  onClose: () => void;
};

export function ReadinessDrawer({ campaignId, targetStage, blockers, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="font-semibold">Not ready for {targetStage}</h3>
            <p className="text-xs text-zinc-500">{blockers.length} item(s) to fix</p>
          </div>
          <button type="button" className="rounded border px-2 py-1 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <ul className="flex-1 overflow-auto p-4 space-y-3 text-sm">
          {blockers.map((b, i) => (
            <li key={i} className="rounded border border-amber-100 bg-amber-50/80 p-3">
              {b.kind === "placement" && (
                <>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-zinc-600">Missing: {b.missing.join(", ")}</p>
                </>
              )}
              {b.kind === "campaign" && <p>{b.message}</p>}
              {b.kind === "approval" && <p>{b.message}</p>}
              {b.kind === "checklist" && <p>{b.message}</p>}
              {"href" in b && b.href ? (
                <Link
                  to={adminSpaTo(`/admin/brand/campaigns/${campaignId}?tab=${b.href}`)}
                  className="mt-2 inline-block text-violet-700 text-xs font-medium"
                  onClick={onClose}
                >
                  Fix in campaign →
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
