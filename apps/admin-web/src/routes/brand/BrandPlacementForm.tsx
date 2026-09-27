import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";
import {
  ALL_BRAND_CHANNELS,
  UNATTRIBUTABLE_BRAND_CHANNELS,
  channelLabel,
  lineTypeForChannelKey,
} from "@/routes/brand/brandChannels";

export type BrandPlacementRow = {
  id: string;
  channel_key: string;
  line_type: string;
  name: string | null;
  budget: number | null;
  tracking_code: string | null;
  flight_start: string | null;
  flight_end: string | null;
  promotion_id: string | null;
  coupon_id: string | null;
  referral_code: string | null;
  referral_program: boolean;
  broadcast_log_id: string | null;
  ads_campaign_id: string | null;
  waitlist_city: string | null;
  waitlist_persona: string | null;
  external_campaign_id: string | null;
  payload: Record<string, unknown>;
};

type Props = {
  campaignId: string;
  defaultTrackingCode: string;
  placement?: BrandPlacementRow;
  onSaved: () => void;
  onCancel?: () => void;
};

function emptyDraft(defaultTrackingCode: string): Partial<BrandPlacementRow> & { channel_key: string } {
  return {
    channel_key: "meta",
    line_type: "paid",
    name: "",
    budget: undefined,
    tracking_code: defaultTrackingCode,
    flight_start: "",
    flight_end: "",
    referral_program: false,
    payload: {},
  };
}

export function BrandPlacementForm({ campaignId, defaultTrackingCode, placement, onSaved, onCancel }: Props) {
  const isNew = !placement;
  const [draft, setDraft] = useState(() =>
    placement
      ? { ...placement, payload: placement.payload ?? {} }
      : emptyDraft(defaultTrackingCode),
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const line_type = lineTypeForChannelKey(draft.channel_key);
      const body = {
        channel_key: draft.channel_key,
        line_type,
        name: draft.name || undefined,
        budget:
          draft.budget != null && String(draft.budget).trim() !== ""
            ? Number(draft.budget)
            : undefined,
        tracking_code: draft.tracking_code || defaultTrackingCode,
        flight_start: draft.flight_start || undefined,
        flight_end: draft.flight_end || undefined,
        promotion_id: draft.promotion_id || null,
        coupon_id: draft.coupon_id || null,
        referral_code: draft.referral_code || null,
        referral_program: draft.referral_program ?? false,
        broadcast_log_id: draft.broadcast_log_id || null,
        ads_campaign_id: draft.ads_campaign_id || null,
        waitlist_city: draft.waitlist_city || null,
        external_campaign_id: draft.external_campaign_id || null,
        payload: {
          ...(draft.payload ?? {}),
          vendor: (draft.payload as { vendor?: string })?.vendor ?? "",
          creative_notes: (draft.payload as { creative_notes?: string })?.creative_notes ?? "",
        },
      };
      if (isNew) {
        return adminApi.postJson(`/api/admin/brand/campaigns/${campaignId}/placements`, body);
      }
      return adminApi.patchJson(`/api/admin/brand/placements/${placement!.id}`, body);
    },
    onSuccess: () => {
      adminToast.success(isNew ? "Placement added" : "Placement saved");
      onSaved();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const lineType = lineTypeForChannelKey(draft.channel_key);
  const owned = lineType === "owned";
  const paid = lineType === "paid";
  const unattributable = UNATTRIBUTABLE_BRAND_CHANNELS.has(draft.channel_key);
  const unattributableReason = String(
    (draft.payload as { unattributable_reason?: string })?.unattributable_reason ?? "",
  );

  return (
    <form
      className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        saveMut.mutate();
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-zinc-600">Channel</span>
          <select
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={draft.channel_key}
            onChange={(e) => setDraft((d) => ({ ...d, channel_key: e.target.value }))}
          >
            {ALL_BRAND_CHANNELS.map((k) => (
              <option key={k} value={k}>
                {channelLabel(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-zinc-600">Line name</span>
          <input
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={draft.name ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Joburg Meta prospecting"
          />
        </label>
        <label className="block">
          <span className="text-zinc-600">Budget (local)</span>
          <input
            type="number"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={draft.budget ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, budget: e.target.value as unknown as number }))}
          />
        </label>
        <label className="block">
          <span className="text-zinc-600">Tracking sub-code</span>
          <input
            className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs"
            value={draft.tracking_code ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, tracking_code: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="text-zinc-600">Flight start</span>
          <input
            type="date"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={(draft.flight_start ?? "").slice(0, 10)}
            onChange={(e) => setDraft((d) => ({ ...d, flight_start: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="text-zinc-600">Flight end</span>
          <input
            type="date"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={(draft.flight_end ?? "").slice(0, 10)}
            onChange={(e) => setDraft((d) => ({ ...d, flight_end: e.target.value }))}
          />
        </label>
      </div>

      {paid && (
        <div className="grid gap-3 md:grid-cols-2 border-t pt-3">
          <label className="block">
            <span className="text-zinc-600">Ads campaign ID</span>
            <input
              className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs"
              value={draft.ads_campaign_id ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, ads_campaign_id: e.target.value || null }))}
            />
          </label>
          <label className="block">
            <span className="text-zinc-600">External platform ID</span>
            <input
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={draft.external_campaign_id ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, external_campaign_id: e.target.value || null }))}
            />
          </label>
        </div>
      )}

      {owned && (
        <div className="grid gap-3 md:grid-cols-2 border-t pt-3">
          <label className="block">
            <span className="text-zinc-600">Promotion ID</span>
            <input
              className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs"
              value={draft.promotion_id ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, promotion_id: e.target.value || null }))}
            />
          </label>
          <label className="block">
            <span className="text-zinc-600">Coupon ID</span>
            <input
              className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs"
              value={draft.coupon_id ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, coupon_id: e.target.value || null }))}
            />
          </label>
          <label className="block">
            <span className="text-zinc-600">Referral code</span>
            <input
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={draft.referral_code ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, referral_code: e.target.value || null }))}
            />
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={draft.referral_program ?? false}
              onChange={(e) => setDraft((d) => ({ ...d, referral_program: e.target.checked }))}
            />
            <span>Whole referral program</span>
          </label>
          <label className="block md:col-span-2">
            <span className="text-zinc-600">Broadcast log ID</span>
            <input
              className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs"
              value={draft.broadcast_log_id ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, broadcast_log_id: e.target.value || null }))}
            />
          </label>
        </div>
      )}

      {unattributable && (
        <label className="block border-t pt-3">
          <span className="text-zinc-600">Why this can't carry a code (required to go live)</span>
          <input
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={unattributableReason}
            placeholder="e.g. Radio spot, no link or code on air"
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                payload: { ...(d.payload ?? {}), unattributable_reason: e.target.value },
              }))
            }
          />
        </label>
      )}

      {draft.channel_key === "owned_email" || draft.channel_key === "waitlist" ? (
        <div className="grid gap-3 md:grid-cols-2 border-t pt-3">
          <label className="block">
            <span className="text-zinc-600">Waitlist city</span>
            <input
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={draft.waitlist_city ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, waitlist_city: e.target.value || null }))}
            />
          </label>
        </div>
      ) : null}

      <label className="block border-t pt-3">
        <span className="text-zinc-600">Creative / vendor notes</span>
        <textarea
          className="mt-1 w-full rounded border px-2 py-1.5"
          rows={2}
          value={String((draft.payload as { creative_notes?: string })?.creative_notes ?? "")}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              payload: { ...(d.payload ?? {}), creative_notes: e.target.value },
            }))
          }
        />
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saveMut.isPending}
          className="rounded bg-violet-700 px-3 py-1.5 text-white disabled:opacity-50"
        >
          {isNew ? "Add placement" : "Save"}
        </button>
        {onCancel ? (
          <button type="button" className="rounded border px-3 py-1.5" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
