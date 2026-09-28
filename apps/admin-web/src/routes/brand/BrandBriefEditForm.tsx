import { useState, type Dispatch, type SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";
import { ALL_BRAND_CHANNELS, channelLabel } from "@/routes/brand/brandChannels";
import { BrandBriefStrategyPickers } from "@/components/brand/BrandBriefStrategyPickers";

const CAMPAIGN_TYPES = [
  { key: "brand_awareness", label: "Brand awareness" },
  { key: "product_launch", label: "Product launch" },
  { key: "seasonal_offer", label: "Seasonal offer" },
  { key: "city_launch", label: "City launch" },
  { key: "provider_acquisition", label: "Provider acquisition" },
  { key: "always_on_performance", label: "Always-on performance" },
  { key: "influencer", label: "Influencer" },
  { key: "event_sponsorship", label: "Event / sponsorship" },
  { key: "partnership", label: "Partnership" },
  { key: "crm_lifecycle", label: "CRM / lifecycle" },
  { key: "pr_content", label: "PR / content" },
] as const;

export type BrandBriefFormValues = {
  name: string;
  campaign_type: string;
  business_problem: string;
  proposition: string;
  objective: string;
  market_notes: string;
  budget_envelope: string;
  flight_start: string;
  flight_end: string;
  success_metric: "demand" | "supply";
  success_target: string;
  channels_requested: string[];
  notes: string;
  /** Channel-specific keys persisted in brand_briefs.fields */
  extra_fields: Record<string, string>;
  pillar_id: string;
  plan_id: string;
};

const PODCAST_FIELD_KEYS = ["podcast_show", "podcast_host_read", "podcast_promo_code", "podcast_measurement"] as const;

export function briefToFormValues(brief: Record<string, unknown>): BrandBriefFormValues {
  const channels = brief.channels_requested;
  const rawFields = brief.fields;
  const extra_fields: Record<string, string> = {};
  if (rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)) {
    for (const [k, v] of Object.entries(rawFields as Record<string, unknown>)) {
      if (v != null) extra_fields[k] = String(v);
    }
  }
  return {
    name: String(brief.name ?? ""),
    campaign_type: String(brief.campaign_type ?? "brand_awareness"),
    business_problem: String(brief.business_problem ?? ""),
    proposition: String(brief.proposition ?? ""),
    objective: String(brief.objective ?? ""),
    market_notes: String(brief.market_notes ?? ""),
    budget_envelope: brief.budget_envelope != null ? String(brief.budget_envelope) : "",
    flight_start: brief.flight_start ? String(brief.flight_start).slice(0, 10) : "",
    flight_end: brief.flight_end ? String(brief.flight_end).slice(0, 10) : "",
    success_metric: (brief.success_metric === "supply" ? "supply" : "demand") as "demand" | "supply",
    success_target: brief.success_target != null ? String(brief.success_target) : "",
    channels_requested: Array.isArray(channels) ? (channels as string[]) : [],
    notes: String(brief.notes ?? ""),
    extra_fields,
    pillar_id: brief.pillar_id ? String(brief.pillar_id) : "",
    plan_id: brief.plan_id ? String(brief.plan_id) : "",
  };
}

function strategyIdsPayload(form: BrandBriefFormValues) {
  return {
    pillar_id: form.pillar_id || null,
    plan_id: form.plan_id || null,
  };
}

function setExtraField(
  setForm: Dispatch<SetStateAction<BrandBriefFormValues>>,
  key: string,
  value: string,
) {
  setForm((f) => ({
    ...f,
    extra_fields: { ...f.extra_fields, [key]: value },
  }));
}

type Props = {
  briefId: string;
  initial: BrandBriefFormValues;
  readOnly?: boolean;
  onSaved: () => void;
  formState?: {
    form: BrandBriefFormValues;
    setForm: Dispatch<SetStateAction<BrandBriefFormValues>>;
  };
  hideManualSave?: boolean;
};

export function BrandBriefEditForm({ briefId, initial, readOnly, onSaved, formState, hideManualSave }: Props) {
  const [localForm, setLocalForm] = useState(initial);
  const form = formState?.form ?? localForm;
  const setForm = formState?.setForm ?? setLocalForm;

  const saveMut = useMutation({
    mutationFn: () =>
      adminApi.patchJson(`/api/admin/brand/briefs/${briefId}`, {
        name: form.name.trim() || "Untitled brief",
        campaign_type: form.campaign_type,
        business_problem: form.business_problem || undefined,
        proposition: form.proposition || undefined,
        objective: form.objective || undefined,
        market_notes: form.market_notes || undefined,
        budget_envelope: form.budget_envelope ? Number(form.budget_envelope) : undefined,
        flight_start: form.flight_start || undefined,
        flight_end: form.flight_end || undefined,
        success_metric: form.success_metric,
        success_target: form.success_target ? Number(form.success_target) : undefined,
        channels_requested: form.channels_requested,
        notes: form.notes || undefined,
        ...strategyIdsPayload(form),
      }),
    onSuccess: () => {
      adminToast.success("Brief saved");
      onSaved();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const toggleChannel = (key: string) => {
    setForm((f) => ({
      ...f,
      channels_requested: f.channels_requested.includes(key)
        ? f.channels_requested.filter((c) => c !== key)
        : [...f.channels_requested, key],
    }));
  };

  if (readOnly) {
    return (
      <div className="space-y-4 text-sm">
        <BrandBriefStrategyPickers
          pillarId={form.pillar_id}
          planId={form.plan_id}
          onPillarChange={() => {}}
          onPlanChange={() => {}}
          disabled
        />
      <dl className="grid gap-3 md:grid-cols-2">
        {Object.entries(form)
          .filter(([k]) => k !== "extra_fields" && k !== "pillar_id" && k !== "plan_id")
          .map(([k, v]) => (
            <div key={k} className={k === "channels_requested" ? "md:col-span-2" : ""}>
              <dt className="text-zinc-500 capitalize">{k.replace(/_/g, " ")}</dt>
              <dd>{Array.isArray(v) ? v.map(channelLabel).join(", ") || "—" : String(v || "—")}</dd>
            </div>
          ))}
        {Object.entries(form.extra_fields ?? {}).map(([k, v]) => (
          <div key={k}>
            <dt className="text-zinc-500 capitalize">{k.replace(/_/g, " ")}</dt>
            <dd>{v || "—"}</dd>
          </div>
        ))}
      </dl>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        saveMut.mutate();
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <p className="mb-2 text-zinc-600">Strategy link</p>
          <BrandBriefStrategyPickers
            pillarId={form.pillar_id}
            planId={form.plan_id}
            onPillarChange={(pillar_id) => setForm((f) => ({ ...f, pillar_id, plan_id: "" }))}
            onPlanChange={(plan_id) => setForm((f) => ({ ...f, plan_id }))}
          />
        </div>
        <label className="block md:col-span-2">
          <span className="text-zinc-600">Campaign type</span>
          <select
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.campaign_type}
            onChange={(e) => setForm((f) => ({ ...f, campaign_type: e.target.value }))}
          >
            {CAMPAIGN_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="text-zinc-600">Name</span>
          <input
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label className="block md:col-span-2">
          <span className="text-zinc-600">Business problem</span>
          <textarea
            className="mt-1 w-full rounded border px-2 py-1.5"
            rows={2}
            value={form.business_problem}
            onChange={(e) => setForm((f) => ({ ...f, business_problem: e.target.value }))}
          />
        </label>
        <label className="block md:col-span-2">
          <span className="text-zinc-600">Single-minded proposition</span>
          <input
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.proposition}
            onChange={(e) => setForm((f) => ({ ...f, proposition: e.target.value }))}
          />
        </label>
        <label className="block md:col-span-2">
          <span className="text-zinc-600">Objective</span>
          <textarea
            className="mt-1 w-full rounded border px-2 py-1.5"
            rows={2}
            value={form.objective}
            onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
          />
        </label>
        <label className="block md:col-span-2">
          <span className="text-zinc-600">Market notes</span>
          <textarea
            className="mt-1 w-full rounded border px-2 py-1.5"
            rows={2}
            value={form.market_notes}
            onChange={(e) => setForm((f) => ({ ...f, market_notes: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="text-zinc-600">Budget envelope</span>
          <input
            type="number"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.budget_envelope}
            onChange={(e) => setForm((f) => ({ ...f, budget_envelope: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="text-zinc-600">Success target</span>
          <input
            type="number"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.success_target}
            onChange={(e) => setForm((f) => ({ ...f, success_target: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="text-zinc-600">Success metric</span>
          <select
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.success_metric}
            onChange={(e) =>
              setForm((f) => ({ ...f, success_metric: e.target.value as "demand" | "supply" }))
            }
          >
            <option value="demand">Demand (customers)</option>
            <option value="supply">Supply (providers)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-zinc-600">Flight start</span>
          <input
            type="date"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.flight_start}
            onChange={(e) => setForm((f) => ({ ...f, flight_start: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="text-zinc-600">Flight end</span>
          <input
            type="date"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.flight_end}
            onChange={(e) => setForm((f) => ({ ...f, flight_end: e.target.value }))}
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-zinc-600">Channels requested</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_BRAND_CHANNELS.map((key) => {
            const on = form.channels_requested.includes(key);
            return (
              <button
                key={key}
                type="button"
                className={`rounded-full border px-2 py-1 text-xs ${on ? "border-violet-600 bg-violet-50 text-violet-800" : "border-zinc-200"}`}
                onClick={() => toggleChannel(key)}
              >
                {channelLabel(key)}
              </button>
            );
          })}
        </div>
      </fieldset>

      {form.channels_requested.includes("podcast") ? (
        <fieldset className="space-y-2 rounded border border-zinc-200 p-3">
          <legend className="px-1 text-sm font-medium text-zinc-700">Podcast placement</legend>
          {PODCAST_FIELD_KEYS.map((key) => (
            <label key={key} className="block">
              <span className="text-zinc-600 capitalize">{key.replace(/_/g, " ")}</span>
              <input
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={form.extra_fields[key] ?? ""}
                onChange={(e) => setExtraField(setForm, key, e.target.value)}
              />
            </label>
          ))}
        </fieldset>
      ) : null}

      <label className="block">
        <span className="text-zinc-600">Internal notes</span>
        <textarea
          className="mt-1 w-full rounded border px-2 py-1.5"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </label>

      {!hideManualSave ? (
        <button
          type="submit"
          disabled={saveMut.isPending}
          className="rounded bg-violet-700 px-3 py-1.5 text-white disabled:opacity-50"
        >
          Save brief
        </button>
      ) : null}
    </form>
  );
}
