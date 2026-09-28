const AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55+"];
const LIFECYCLES = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "lapsed", label: "Lapsed" },
  { value: "loyal", label: "Loyal" },
] as const;

export type AudienceFormValue = {
  segment: "customer" | "provider";
  personas: string;
  cities: string;
  age_bands: string[];
  gender: string;
  service_categories: string;
  lifecycle: "new" | "lapsed" | "loyal" | "all";
  insight: string;
};

export function audienceFromApi(raw: Record<string, unknown>): AudienceFormValue {
  const personas = raw.personas ?? raw.persona;
  const cities = raw.cities ?? raw.city;
  return {
    segment: raw.segment === "provider" ? "provider" : "customer",
    personas: Array.isArray(personas) ? personas.join(", ") : String(personas ?? ""),
    cities: Array.isArray(cities) ? cities.join(", ") : String(cities ?? ""),
    age_bands: Array.isArray(raw.age_bands) ? (raw.age_bands as string[]) : [],
    gender: Array.isArray(raw.gender) ? (raw.gender as string[]).join(", ") : String(raw.gender ?? ""),
    service_categories: Array.isArray(raw.service_categories)
      ? (raw.service_categories as string[]).join(", ")
      : String(raw.service_categories ?? ""),
    lifecycle: (["new", "lapsed", "loyal", "all"].includes(String(raw.lifecycle))
      ? raw.lifecycle
      : "all") as AudienceFormValue["lifecycle"],
    insight: String(raw.insight ?? ""),
  };
}

export function audienceToApi(form: AudienceFormValue): Record<string, unknown> {
  const split = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  return {
    segment: form.segment,
    personas: split(form.personas),
    cities: split(form.cities),
    age_bands: form.age_bands,
    gender: split(form.gender),
    service_categories: split(form.service_categories),
    lifecycle: form.lifecycle,
    insight: form.insight || undefined,
  };
}

type Props = {
  value: AudienceFormValue;
  onChange: (v: AudienceFormValue) => void;
  disabled?: boolean;
};

export function AudienceBuilder({ value, onChange, disabled }: Props) {
  const set = (patch: Partial<AudienceFormValue>) => onChange({ ...value, ...patch });

  return (
    <div className="grid gap-3 md:grid-cols-2 text-sm">
      <label className="block">
        <span className="text-zinc-600">Segment</span>
        <select
          className="mt-1 w-full rounded border px-2 py-1.5"
          disabled={disabled}
          value={value.segment}
          onChange={(e) => set({ segment: e.target.value as "customer" | "provider" })}
        >
          <option value="customer">Customer (demand)</option>
          <option value="provider">Provider (supply)</option>
        </select>
      </label>
      <label className="block">
        <span className="text-zinc-600">Lifecycle</span>
        <select
          className="mt-1 w-full rounded border px-2 py-1.5"
          disabled={disabled}
          value={value.lifecycle}
          onChange={(e) => set({ lifecycle: e.target.value as AudienceFormValue["lifecycle"] })}
        >
          {LIFECYCLES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block md:col-span-2">
        <span className="text-zinc-600">Personas (comma-separated)</span>
        <input
          className="mt-1 w-full rounded border px-2 py-1.5"
          disabled={disabled}
          value={value.personas}
          onChange={(e) => set({ personas: e.target.value })}
        />
      </label>
      <label className="block md:col-span-2">
        <span className="text-zinc-600">Cities</span>
        <input
          className="mt-1 w-full rounded border px-2 py-1.5"
          disabled={disabled}
          value={value.cities}
          onChange={(e) => set({ cities: e.target.value })}
        />
      </label>
      <fieldset className="md:col-span-2">
        <legend className="text-zinc-600">Age bands</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {AGE_BANDS.map((band) => {
            const on = value.age_bands.includes(band);
            return (
              <button
                key={band}
                type="button"
                disabled={disabled}
                className={`rounded-full border px-2 py-1 text-xs ${on ? "border-violet-600 bg-violet-50" : "border-zinc-200"}`}
                onClick={() =>
                  set({
                    age_bands: on ? value.age_bands.filter((b) => b !== band) : [...value.age_bands, band],
                  })
                }
              >
                {band}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="block">
        <span className="text-zinc-600">Gender (optional)</span>
        <input
          className="mt-1 w-full rounded border px-2 py-1.5"
          disabled={disabled}
          value={value.gender}
          onChange={(e) => set({ gender: e.target.value })}
          placeholder="e.g. women, men, all"
        />
      </label>
      <label className="block">
        <span className="text-zinc-600">Service categories</span>
        <input
          className="mt-1 w-full rounded border px-2 py-1.5"
          disabled={disabled}
          value={value.service_categories}
          onChange={(e) => set({ service_categories: e.target.value })}
        />
      </label>
      <label className="block md:col-span-2">
        <span className="text-zinc-600">Insight</span>
        <textarea
          className="mt-1 w-full rounded border px-2 py-1.5"
          rows={2}
          disabled={disabled}
          value={value.insight}
          onChange={(e) => set({ insight: e.target.value })}
          placeholder="What they think/feel today and what we want them to do"
        />
      </label>
    </div>
  );
}

export function AudienceAgeChart({
  market,
  attributed,
}: {
  market: Array<{ bracket?: string; label?: string; count?: number; pct?: number }> | null;
  attributed: number;
}) {
  const rows = Array.isArray(market) ? market : [];
  const max = Math.max(...rows.map((r) => Number(r.count ?? r.pct ?? 0)), attributed, 1);

  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-zinc-500">Market age mix vs attributed signups ({attributed})</p>
      {rows.length === 0 ? (
        <p className="text-zinc-500">No market age data.</p>
      ) : (
        rows.map((r, i) => {
          const label = String(r.bracket ?? r.label ?? `Band ${i + 1}`);
          const val = Number(r.count ?? r.pct ?? 0);
          return (
            <div key={label}>
              <div className="flex justify-between text-xs">
                <span>{label}</span>
                <span className="tabular-nums">{val}</span>
              </div>
              <div className="mt-0.5 h-2 rounded bg-zinc-100">
                <div className="h-2 rounded bg-violet-600" style={{ width: `${(val / max) * 100}%` }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
