import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { MapPin, Loader2 } from "lucide-react";
import { adminApi } from "@/lib/adminClient";

interface AddressSuggestion {
  id: string;
  place_name: string;
  center: [number, number];
  context?: Array<{ id: string; text: string; short_code?: string }>;
}

export type PickedAddress = {
  place_name: string;
  latitude: number;
  longitude: number;
  city: string;
  country: string;
};

interface AddressSearchInputProps {
  value?: string;
  onSelect: (address: PickedAddress) => void;
  onInputChange?: (value: string) => void;
  placeholder?: string;
  /** ISO 3166-1 alpha-2 (e.g. "ZA") */
  country?: string;
  disabled?: boolean;
  className?: string;
}

function parseAddressParts(suggestion: AddressSuggestion): PickedAddress {
  let city = "";
  let country = "";
  for (const ctx of suggestion.context ?? []) {
    if (ctx.id.startsWith("place")) city = ctx.text;
    else if (ctx.id.startsWith("country")) country = ctx.text;
  }
  return {
    place_name: suggestion.place_name,
    latitude: suggestion.center[1],
    longitude: suggestion.center[0],
    city,
    country,
  };
}

export function AddressSearchInput({
  value = "",
  onSelect,
  onInputChange,
  placeholder = "Search for an address…",
  country,
  disabled = false,
  className = "",
}: AddressSearchInputProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didSelectRef = useRef(false);

  useEffect(() => { setQuery(value); }, [value]);

  const countryIso = country && /^[a-zA-Z]{2}$/.test(country.trim()) ? country.trim().toUpperCase() : undefined;

  const updateRect = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setDropdownRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!showDropdown || suggestions.length === 0) { setDropdownRect(null); return; }
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [showDropdown, suggestions.length, updateRect, query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = async (q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); setShowDropdown(false); return; }
    try {
      setLoading(true);
      const payload: { query: string; limit: number; country?: string } = { query: q, limit: 8 };
      if (countryIso) payload.country = countryIso;
      const res = await adminApi.postJson<{ data: AddressSuggestion[] | null }>("/api/mapbox/geocode", payload);
      const items = Array.isArray(res?.data) ? res.data : [];
      setSuggestions(items);
      if (items.length > 0) { setShowDropdown(true); setSelectedIdx(-1); }
      else setShowDropdown(false);
    } catch {
      setSuggestions([]);
      setShowDropdown(false);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    onInputChange?.(v);
    if (v.trim().length < 2) { setSuggestions([]); setShowDropdown(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void search(v); }, 250);
  };

  const selectSuggestion = (s: AddressSuggestion) => {
    didSelectRef.current = true;
    setQuery(s.place_name);
    setShowDropdown(false);
    setSuggestions([]);
    setSelectedIdx(-1);
    onSelect(parseAddressParts(s));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((p) => Math.min(p + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((p) => Math.max(p - 1, -1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const idx = selectedIdx >= 0 ? selectedIdx : 0;
      if (suggestions[idx]) selectSuggestion(suggestions[idx]);
    } else if (e.key === "Escape") { setShowDropdown(false); setSelectedIdx(-1); }
  };

  const handleBlur = () => {
    if (didSelectRef.current) { didSelectRef.current = false; return; }
    setTimeout(() => setShowDropdown(false), 150);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
      </div>

      {showDropdown && suggestions.length > 0 && dropdownRect &&
        createPortal(
          <div
            ref={dropdownRef}
            role="listbox"
            className="max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl"
            style={{ position: "fixed", top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, zIndex: 200000 }}
          >
            {suggestions.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={idx === selectedIdx}
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                onMouseEnter={() => setSelectedIdx(idx)}
                className={`flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-indigo-50 ${idx === selectedIdx ? "bg-indigo-50" : "bg-white"}`}
              >
                <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${idx === selectedIdx ? "text-indigo-600" : "text-gray-400"}`} />
                <span className={`min-w-0 truncate text-sm font-medium ${idx === selectedIdx ? "text-indigo-700" : "text-gray-900"}`}>
                  {s.place_name}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )
      }
    </div>
  );
}
