import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { AdminPanel } from "@/components/ui/AdminPanel";
import {
  AudienceBuilder,
  AudienceAgeChart,
  audienceFromApi,
  audienceToApi,
  type AudienceFormValue,
} from "@/components/brand/AudienceBuilder";

type Props = {
  campaignId: string;
  period: string;
  audienceDefinition: Record<string, unknown>;
  marketAgeBrackets: unknown;
  attributedSignupCount: number;
  sampleNote: string;
};

export function BrandCampaignAudiencePanel({
  campaignId,
  period,
  audienceDefinition,
  marketAgeBrackets,
  attributedSignupCount,
  sampleNote,
}: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AudienceFormValue>(() => audienceFromApi(audienceDefinition));

  useEffect(() => {
    setDraft(audienceFromApi(audienceDefinition));
  }, [audienceDefinition]);

  const saveMut = useMutation({
    mutationFn: () =>
      adminApi.patchJson(`/api/admin/brand/campaigns/${campaignId}`, {
        audience_definition: audienceToApi(draft),
      }),
    onSuccess: () => {
      adminToast.success("Audience saved");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandCampaign(campaignId, period) });
      void qc.invalidateQueries({ queryKey: [...adminQueryKeys.brandCampaign(campaignId, period), "audience"] });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  return (
    <>
      <AdminPanel title="Audience definition">
        <AudienceBuilder value={draft} onChange={setDraft} />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="rounded bg-violet-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending ? "Saving…" : "Save audience"}
          </button>
        </div>
      </AdminPanel>
      <AdminPanel title="Market vs attributed">
        <p className="mb-2 text-xs text-zinc-500">{sampleNote}</p>
        <p className="mb-2 text-sm tabular-nums">Attributed signups (all time): {attributedSignupCount}</p>
        <AudienceAgeChart
          market={
            Array.isArray(marketAgeBrackets)
              ? (marketAgeBrackets as Array<{
                  bracket?: string;
                  label?: string;
                  count?: number;
                  pct?: number;
                }>)
              : null
          }
          attributed={attributedSignupCount}
        />
      </AdminPanel>
    </>
  );
}
