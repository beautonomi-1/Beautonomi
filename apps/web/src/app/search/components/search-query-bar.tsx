"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";

export type SearchSuggestion = {
  type: "service" | "provider" | "category";
  id: string;
  name: string;
  url: string;
  category?: string;
  slug?: string;
  image_url?: string | null;
  distance_km?: number;
};

type SearchQueryBarProps = {
  queryInput: string;
  onQueryChange: (value: string) => void;
  onApply: () => void;
};

const DEBOUNCE_MS = 220;
const MIN_CHARS = 2;

export function SearchQueryBarWithSuggestions({
  queryInput,
  onQueryChange,
  onApply,
}: SearchQueryBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
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
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set("q", trimmed);
      sp.set("limit", "12");
      const lat = searchParams?.get("lat");
      const lng = searchParams?.get("lng");
      if (lat) sp.set("lat", lat);
      if (lng) sp.set("lng", lng);

      const res = await fetcher.get<{
        data?: { suggestions?: SearchSuggestion[] };
        suggestions?: SearchSuggestion[];
      }>(`/api/public/search/suggestions?${sp.toString()}`);
      const raw = res as { data?: { suggestions?: SearchSuggestion[] }; suggestions?: SearchSuggestion[] };
      const list = raw?.data?.suggestions ?? raw?.suggestions ?? [];
      setSuggestions(Array.isArray(list) ? list : []);
      setHighlight(0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = queryInput.trim();
    if (q.length < MIN_CHARS) {
      setSuggestions([]);
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
              setOpen(false);
              onApply();
              return;
            }
            if (!open || suggestions.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Search providers, services, or categories…"
          className="pl-10 h-11 bg-white border-gray-200"
          aria-label="Search providers"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="search-suggestions-list"
          autoComplete="off"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
        ) : null}

        {open && suggestions.length > 0 ? (
          <ul
            id="search-suggestions-list"
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            {suggestions.map((s, i) => (
              <li key={`${s.type}-${s.id}`} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-gray-50",
                    i === highlight && "bg-gray-50"
                  )}
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
                    <span className="block truncate font-medium text-gray-900">{s.name}</span>
                    <span className="block text-xs text-gray-500 capitalize mt-0.5">
                      {s.type === "service" && s.category ? `${s.category} · ` : ""}
                      {s.type === "service" ? "Service" : s.type === "provider" ? "Provider" : "Category"}
                    </span>
                    {s.type === "provider" && s.distance_km != null ? (
                      <span className="block text-xs text-gray-500 mt-0.5">
                        {s.distance_km < 1 ? "< 1 km away" : `${s.distance_km.toFixed(1)} km away`}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button type="button" onClick={() => { setOpen(false); onApply(); }} className="shrink-0 h-11 px-6">
        Search
      </Button>
    </div>
  );
}
