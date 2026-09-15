import type { SelectableModel } from "./types";

function groupByProvider(models: SelectableModel[]): Map<string, SelectableModel[]> {
  const map = new Map<string, SelectableModel[]>();
  for (const m of models) {
    const list = map.get(m.provider) ?? [];
    list.push(m);
    map.set(m.provider, list);
  }
  return map;
}

export function ModelCatalogPicker(props: {
  models: SelectableModel[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
  className?: string;
}) {
  const grouped = groupByProvider(props.models);
  return (
    <select
      className={props.className ?? "w-full rounded-lg border border-gray-200 px-2 py-1 font-mono text-xs"}
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {props.allowEmpty ? <option value="">{props.placeholder ?? "Default routing"}</option> : null}
      {[...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([provider, models]) => (
          <optgroup key={provider} label={provider}>
            {models.map((m) => (
              <option key={m.model_id} value={m.model_id}>
                {m.model_id} ({m.tier})
                {m.catalog_enabled === false ? " — enable in catalog" : ""}
              </option>
            ))}
          </optgroup>
        ))}
      {props.value && !props.models.some((m) => m.model_id === props.value) ? (
        <option value={props.value}>{props.value} (custom)</option>
      ) : null}
    </select>
  );
}
