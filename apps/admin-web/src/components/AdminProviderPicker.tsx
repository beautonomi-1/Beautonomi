import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminProviderSearchResult = {
  id: string;
  business_name?: string | null;
  name?: string | null;
  slug?: string | null;
  status?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
};

type ProvidersSearchPayload =
  | AdminProviderSearchResult[]
  | { data: AdminProviderSearchResult[] }
  | { providers?: AdminProviderSearchResult[] };

type Props = {
  value: string;
  onChange: (providerId: string, provider?: AdminProviderSearchResult) => void;
  /** Optional known label when value is set externally (e.g. reassign prefill). */
  selectedLabel?: string | null;
  placeholder?: string;
  label?: string;
  labelClassName?: string;
  enabled?: boolean;
  limit?: number;
};

function extractProviders(data: ProvidersSearchPayload | undefined): AdminProviderSearchResult[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if ("data" in data && Array.isArray(data.data)) return data.data;
  if ("providers" in data && Array.isArray(data.providers)) return data.providers;
  return [];
}

function providerLabel(p: AdminProviderSearchResult): string {
  return p.business_name || p.name || p.slug || p.id;
}

function providerSubline(p: AdminProviderSearchResult): string {
  const parts: string[] = [];
  if (p.owner_name && p.owner_name !== "—") parts.push(p.owner_name);
  if (p.owner_email && p.owner_email !== "—") parts.push(p.owner_email);
  if (p.owner_phone) parts.push(p.owner_phone);
  parts.push(p.id.slice(0, 8) + "…");
  return parts.join(" · ");
}

export function AdminProviderPicker({
  value,
  onChange,
  selectedLabel,
  placeholder = "Search by name, email, phone, or UUID…",
  label,
  labelClassName = "block text-sm font-medium text-gray-700",
  enabled = true,
  limit = 20,
}: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<AdminProviderSearchResult | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const canSearch = debounced.length >= 2 || UUID_REGEX.test(debounced);

  const signature = useMemo(
    () => JSON.stringify({ q: debounced, limit }),
    [debounced, limit],
  );

  const searchQ = useQuery({
    queryKey: adminQueryKeys.providers.search(signature),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("search", debounced);
      params.set("limit", String(limit));
      params.set("page", "1");
      return adminApi.getJson<ProvidersSearchPayload>(`/api/admin/providers?${params.toString()}`, {
        timeoutMs: 30_000,
      });
    },
    enabled: enabled && canSearch && open,
    staleTime: 30_000,
  });

  const results = useMemo(() => extractProviders(searchQ.data), [searchQ.data]);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    if (selected?.id === value) {
      if (
        selectedLabel &&
        (!selected.business_name || selected.business_name === value) &&
        selected.business_name !== selectedLabel
      ) {
        setSelected((prev) => (prev ? { ...prev, business_name: selectedLabel } : prev));
      }
      return;
    }

    const fromResults = results.find((r) => r.id === value);
    if (fromResults) {
      setSelected(fromResults);
      return;
    }

    if (selectedLabel) {
      setSelected({ id: value, business_name: selectedLabel });
    }

    if (UUID_REGEX.test(value)) {
      const params = new URLSearchParams();
      params.set("search", value);
      params.set("limit", "1");
      params.set("page", "1");
      void adminApi
        .getJson<ProvidersSearchPayload>(`/api/admin/providers?${params.toString()}`, {
          timeoutMs: 30_000,
        })
        .then((data) => {
          const match = extractProviders(data)[0];
          if (match?.id === value) setSelected(match);
        })
        .catch(() => {
          setSelected({ id: value, business_name: selectedLabel || value });
        });
    }
  }, [value, results, selected?.id, selected?.business_name, selectedLabel]);

  function selectProvider(provider: AdminProviderSearchResult) {
    setSelected(provider);
    onChange(provider.id, provider);
    setQuery("");
    setDebounced("");
    setOpen(false);
  }

  function clearSelection() {
    setSelected(null);
    onChange("");
    setQuery("");
    setDebounced("");
    setOpen(false);
  }

  return (
    <div>
      {label ? <label className={labelClassName}>{label}</label> : null}
      {selected ? (
        <div className="mt-1 flex items-start justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{providerLabel(selected)}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">{providerSubline(selected)}</p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={clearSelection}
            aria-label="Clear provider"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative mt-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 150);
            }}
            placeholder={placeholder}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-gray-500 focus:outline-none"
          />
          {open && canSearch ? (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {searchQ.isLoading ? (
                <p className="px-3 py-2 text-xs text-gray-500">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-500">No matching providers.</p>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="block w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectProvider(p)}
                  >
                    <p className="truncate text-sm font-medium text-gray-900">{providerLabel(p)}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{providerSubline(p)}</p>
                    {p.status ? (
                      <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                        {p.status}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
