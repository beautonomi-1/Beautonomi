import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";
import { ALL_BRAND_CHANNELS, channelLabel } from "@/routes/brand/brandChannels";

export type BrandBriefFormValues = {
  name: string;
  objective: string;
  market_notes: string;
  budget_envelope: string;
  flight_start: string;
  flight_end: string;
  success_metric: "demand" | "supply";
  success_target: string;
  channels_requested: string[];
  notes: string;
};

export function briefToFormValues(brief: Record<string, unknown>): BrandBriefFormValues {
  const channels = brief.channels_requested;
  return {
    name: String(brief.name ?? ""),
    objective: String(brief.objective ?? ""),
    market_notes: String(brief.market_notes ?? ""),
    budget_envelope: brief.budget_envelope != null ? String(brief.budget_envelope) : "",
    flight_start: brief.flight_start ? String(brief.flight_start).slice(0, 10) : "",
    flight_end: brief.flight_end ? String(brief.flight_end).slice(0, 10) : "",
    success_metric: (brief.success_metric === "supply" ? "supply" : "demand") as "demand" | "supply",
    success_target: brief.success_target != null ? String(brief.success_target) : "",
    channels_requested: Array.isArray(channels) ? (channels as string[]) : [],
    notes: String(brief.notes ?? ""),
  };
}

type Props = {
  briefId: string;
  initial: BrandBriefFormValues;
  readOnly?: boolean;
  onSaved: () => void;
};

export function BrandBriefEditForm({ briefId, initial, readOnly, onSaved }: Props) {
  const [form, setForm] = useState(initial);

  const saveMut = useMutation({
    mutationFn: () =>
      adminApi.patchJson(`/api/admin/brand/briefs/${briefId}`, {
        name: form.name.trim() || "Untitled brief",
        objective: form.objective || undefined,
        market_notes: form.market_notes || undefined,
        budget_envelope: form.budget_envelope ? Number(form.budget_envelope) : undefined,
        flight_start: form.flight_start || undefined,
        flight_end: form.flight_end || undefined,
        success_metric: form.success_metric,
        success_target: form.success_target ? Number(form.success_target) : undefined,
        channels_requested: form.channels_requested,
        notes: form.notes || undefined,
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
      <dl className="grid gap-3 text-sm md:grid-cols-2">
        {Object.entries(form).map(([k, v]) => (
          <div key={k} className={k === "channels_requested" ? "md:col-span-2" : ""}>
            <dt className="text-zinc-500 capitalize">{k.replace(/_/g, " ")}</dt>
            <dd>{Array.isArray(v) ? v.map(channelLabel).join(", ") || "—" : v || "—"}</dd>
          </div>
        ))}
      </dl>
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

      <label className="block">
        <span className="text-zinc-600">Internal notes</span>
        <textarea
          className="mt-1 w-full rounded border px-2 py-1.5"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </label>

      <button
        type="submit"
        disabled={saveMut.isPending}
        className="rounded bg-violet-700 px-3 py-1.5 text-white disabled:opacity-50"
      >
        Save brief
      </button>
    </form>
  );
}
