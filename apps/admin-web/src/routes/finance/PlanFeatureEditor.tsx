import { useMemo, useState } from "react";
import {
  FEATURE_REGISTRY,
  getFreePlanFeatures,
  normalizeFeatures,
  type PlanFeaturesMap,
} from "@beautonomi/subscription-features";

type Props = {
  value: PlanFeaturesMap;
  onChange: (next: PlanFeaturesMap) => void;
};

const GROUP_LABELS: Record<string, string> = {
  core: "Core booking",
  marketing: "Marketing",
  payments: "Payments & POS",
  operations: "Operations",
  analytics: "Reports & analytics",
  integrations: "Integrations",
};

function setCategoryField(
  prev: PlanFeaturesMap,
  categoryKey: string,
  fieldKey: string,
  fieldValue: unknown,
): PlanFeaturesMap {
  const cat = { ...(prev[categoryKey] ?? {}) };
  cat[fieldKey] = fieldValue;
  return { ...prev, [categoryKey]: cat };
}

export function PlanFeatureEditor({ value, onChange }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedJson, setAdvancedJson] = useState(() => JSON.stringify(value, null, 2));
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof FEATURE_REGISTRY>();
    for (const cat of FEATURE_REGISTRY) {
      const list = map.get(cat.group) ?? [];
      list.push(cat);
      map.set(cat.group, list);
    }
    return map;
  }, []);

  const applyAdvancedJson = () => {
    try {
      const parsed = JSON.parse(advancedJson) as unknown;
      const normalized = normalizeFeatures(parsed);
      onChange(normalized);
      setAdvancedError(null);
      setAdvancedJson(JSON.stringify(normalized, null, 2));
    } catch (e) {
      setAdvancedError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <div className="space-y-4 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-900">Feature permissions</p>
          <p className="text-xs text-gray-600">
            Controls provider app gating via <code className="rounded bg-gray-100 px-1">subscription_plans.features</code>
          </p>
        </div>
        <button
          type="button"
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          onClick={() => onChange(getFreePlanFeatures())}
        >
          Apply generous defaults
        </button>
      </div>

      {Array.from(grouped.entries()).map(([group, categories]) => (
        <div key={group} className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {GROUP_LABELS[group] ?? group}
          </p>
          <div className="space-y-3">
            {categories.map((category) => {
              const catValue = value[category.key] ?? {};
              const enabled = catValue.enabled === true;
              return (
                <div key={category.key} className="rounded border border-gray-100 p-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{category.label}</p>
                      <p className="text-xs text-gray-500">{category.description}</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) =>
                          onChange(
                            setCategoryField(value, category.key, "enabled", e.target.checked),
                          )
                        }
                      />
                      Enabled
                    </label>
                  </div>
                  {enabled ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {category.fields
                        .filter((f) => f.key !== "enabled")
                        .map((field) => {
                          const raw = catValue[field.key];
                          if (field.type === "toggle") {
                            return (
                              <label key={field.key} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={raw === true}
                                  onChange={(e) =>
                                    onChange(
                                      setCategoryField(
                                        value,
                                        category.key,
                                        field.key,
                                        e.target.checked,
                                      ),
                                    )
                                  }
                                />
                                {field.label}
                              </label>
                            );
                          }
                          if (field.type === "limit") {
                            const unlimited = raw === null || raw === undefined;
                            return (
                              <div key={field.key} className="text-sm sm:col-span-2">
                                <p className="mb-1 text-gray-700">{field.label}</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    type="number"
                                    className="w-28 rounded border border-gray-300 px-2 py-1"
                                    disabled={unlimited}
                                    value={unlimited ? "" : String(raw ?? "")}
                                    onChange={(e) => {
                                      const n = e.target.value.trim();
                                      onChange(
                                        setCategoryField(
                                          value,
                                          category.key,
                                          field.key,
                                          n === "" ? null : Number(n),
                                        ),
                                      );
                                    }}
                                  />
                                  <label className="flex items-center gap-1 text-xs text-gray-600">
                                    <input
                                      type="checkbox"
                                      checked={unlimited}
                                      onChange={(e) =>
                                        onChange(
                                          setCategoryField(
                                            value,
                                            category.key,
                                            field.key,
                                            e.target.checked ? null : 0,
                                          ),
                                        )
                                      }
                                    />
                                    Unlimited
                                  </label>
                                </div>
                              </div>
                            );
                          }
                          if (field.type === "multiselect" && field.options) {
                            const selected = Array.isArray(raw) ? (raw as string[]) : [];
                            return (
                              <div key={field.key} className="text-sm sm:col-span-2">
                                <p className="mb-1 text-gray-700">{field.label}</p>
                                <div className="flex flex-wrap gap-2">
                                  {field.options.map((opt) => {
                                    const on = selected.includes(opt.value);
                                    return (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        className={`rounded-full border px-2 py-0.5 text-xs ${
                                          on
                                            ? "border-gray-900 bg-gray-900 text-white"
                                            : "border-gray-300 bg-white text-gray-700"
                                        }`}
                                        onClick={() => {
                                          const next = on
                                            ? selected.filter((v) => v !== opt.value)
                                            : [...selected, opt.value];
                                          onChange(
                                            setCategoryField(value, category.key, field.key, next),
                                          );
                                        }}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }
                          if (field.type === "text") {
                            return (
                              <label key={field.key} className="text-sm sm:col-span-2">
                                {field.label}
                                <input
                                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                                  value={typeof raw === "string" ? raw : ""}
                                  onChange={(e) =>
                                    onChange(
                                      setCategoryField(
                                        value,
                                        category.key,
                                        field.key,
                                        e.target.value,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            );
                          }
                          return null;
                        })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="rounded-lg border border-dashed border-gray-300 p-3">
        <button
          type="button"
          className="text-sm font-medium text-gray-800"
          onClick={() => {
            setAdvancedOpen((o) => !o);
            setAdvancedJson(JSON.stringify(value, null, 2));
            setAdvancedError(null);
          }}
        >
          {advancedOpen ? "Hide" : "Show"} advanced JSON
        </button>
        {advancedOpen ? (
          <div className="mt-2 space-y-2">
            <textarea
              className="min-h-[160px] w-full rounded border border-gray-300 px-2 py-2 font-mono text-xs"
              value={advancedJson}
              onChange={(e) => setAdvancedJson(e.target.value)}
              spellCheck={false}
            />
            {advancedError ? <p className="text-xs text-red-600">{advancedError}</p> : null}
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-xs"
              onClick={applyAdvancedJson}
            >
              Apply JSON
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
