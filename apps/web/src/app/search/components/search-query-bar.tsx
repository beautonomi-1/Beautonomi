"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";
import { useUserLocation } from "@/hooks/useUserLocation";
import { translatePublicCategory } from "@/lib/i18n/translate-public-category";

export type SearchSuggestion = {
  type: "service" | "provider" | "category";
  id: string;
  name: string;
  url: string;
  category?: string;
  slug?: string;
  image_url?: string | null;
  distance_km?: number;
  place_label?: string;
};

type SearchQueryBarProps = {
  queryInput: string;
  onQueryChange: (value: string) => void;
  onApply: () => void;
};

const DEBOUNCE_MS = 220;
// Customer app starts fetching suggestions from the first character.
const MIN_CHARS = 1;

export function SearchQueryBarWithSuggestions({
  queryInput,
  onQueryChange,
  onApply,
}: SearchQueryBarProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { location: userLocation } = useUserLocation();
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // -1 means "no active highlight" so Enter keeps behaving like the app (search),
  // unless the user explicitly arrows to a suggestion.
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_CHARS) {
      setSuggestions([]);
      setSuggestionsError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSuggestionsError(null);
    try {
      const sp = new URLSearchParams();
      sp.set("q", trimmed);
      // Keep the same defaults as customer app.
      sp.set("limit", "10");

      const latFromUrl = searchParams?.get("lat");
      const lngFromUrl = searchParams?.get("lng");
      const lat =
        latFromUrl ??
        (userLocation?.latitude != null ? String(userLocation.latitude) : null);
      const lng =
        lngFromUrl ??
        (userLocation?.longitude != null ? String(userLocation.longitude) : null);
      if (lat) sp.set("lat", lat);
      if (lng) sp.set("lng", lng);

      const res = await fetcher.get<{
        data?: { suggestions?: SearchSuggestion[] };
        suggestions?: SearchSuggestion[];
      }>(`/api/public/search/suggestions?${sp.toString()}`);
      const raw = res as { data?: { suggestions?: SearchSuggestion[] }; suggestions?: SearchSuggestion[] };
      const list = raw?.data?.suggestions ?? raw?.suggestions ?? [];
      setSuggestions(Array.isArray(list) ? list : []);
      setHighlight(-1);
    } catch {
      setSuggestions([]);
      setSuggestionsError(t("web.search.failedProviders"));
    } finally {
      setLoading(false);
    }
  }, [searchParams, t, userLocation?.latitude, userLocation?.longitude]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = queryInput.trim();
    if (q.length < MIN_CHARS) {
      setSuggestions([]);
      setSuggestionsError(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(queryInput);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [queryInput, fetchSuggestions]);

  const applySuggestion = useCallback(
    (s: SearchSuggestion) => {
      setOpen(false);
      if (s.url?.startsWith("/")) {
        router.push(s.url);
        return;
      }
      onQueryChange(s.name);
      router.push(`/search?q=${encodeURIComponent(s.name)}`);
    },
    [onQueryChange, router]
  );

  const trimmed = queryInput.trim();
  const showDropdown =
    open &&
    trimmed.length >= MIN_CHARS &&
    (loading || Boolean(suggestionsError) || suggestions.length > 0 || (!loading && suggestions.length === 0));

  return (
    <div ref={rootRef} className="mb-6 flex flex-col sm:flex-row gap-2 sm:items-start">
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
        <Input
          type="search"
          value={queryInput}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (queryInput.trim().length >= MIN_CHARS) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (open && highlight >= 0 && highlight < suggestions.length) {
                applySuggestion(suggestions[highlight]);
                return;
              }
              setOpen(false);
              onApply();
              return;
            }
            if (!open || suggestions.length === 0) {
              if (e.key === "Escape") setOpen(false);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => {
                if (suggestions.length === 0) return -1;
                if (h < 0) return 0;
                return (h + 1) % suggestions.length;
              });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => {
                if (suggestions.length === 0) return -1;
                if (h < 0) return suggestions.length - 1;
                return (h - 1 + suggestions.length) % suggestions.length;
              });
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={t("web.search.placeholder")}
          className="ps-10 h-11 bg-white border-gray-200"
          aria-label={t("web.search.providersAriaLabel")}
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="search-suggestions-list"
          autoComplete="off"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
        ) : null}

        {showDropdown ? (
          <ul
            id="search-suggestions-list"
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            {loading && suggestions.length === 0 ? (
              <li className="px-3 py-3 text-sm text-gray-500">{t("web.search.searching")}</li>
            ) : suggestionsError ? (
              <li className="px-3 py-3 text-sm text-red-600">{suggestionsError}</li>
            ) : suggestions.length === 0 ? (
              <li className="px-3 py-3 text-sm text-gray-500">
                {t("customer.searchScreen.noMatchesForQuery", { query: trimmed })}
              </li>
            ) : (
              suggestions.map((s, i) => (
                <li key={`${s.type}-${s.id}`} role="option" aria-selected={i === highlight}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-start text-sm hover:bg-gray-50",
                      i === highlight && "bg-gray-50"
                    )}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySuggestion(s)}
                  >
                    {s.type === "provider" ? (
                      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-50 text-sm font-semibold text-primary ring-1 ring-pink-100">
                        {s.image_url ? (
                          <Image src={s.image_url} alt="" fill sizes="40px" className="object-cover" />
                        ) : (
                          s.name.slice(0, 1).toUpperCase()
                        )}
                      </span>
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 ring-1 ring-gray-200">
                        <Search className="h-4 w-4 text-gray-500" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-900">
                        {s.type === "category"
                          ? translatePublicCategory(t, s.slug ?? s.name, s.name, { language: i18n.language })
                          : s.name}
                      </span>
                      {s.type === "provider" && s.place_label ? (
                        <span className="block text-xs text-gray-500 mt-0.5 truncate">{s.place_label}</span>
                      ) : null}
                      {s.type === "service" && s.category ? (
                        <span className="block text-xs text-gray-500 mt-0.5 truncate">
                          {translatePublicCategory(t, s.category, s.category, { language: i18n.language })}
                        </span>
                      ) : null}
                      <span className="block text-xs text-gray-500 capitalize mt-0.5">
                        {s.type === "service"
                          ? t("web.search.suggestion.service")
                          : s.type === "provider"
                            ? t("web.search.suggestion.provider")
                            : t("web.search.suggestion.category")}
                      </span>
                      {s.type === "provider" && s.distance_km != null ? (
                        <span className="block text-xs text-gray-500 mt-0.5">
                          {s.distance_km < 1 ? t("web.search.distanceUnder1km") : t("web.search.distanceAway", { km: s.distance_km.toFixed(1) })}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
      <Button type="button" onClick={() => { setOpen(false); onApply(); }} className="shrink-0 h-11 px-6">
        {t("web.search.searchCta")}
      </Button>
    </div>
  );
}
