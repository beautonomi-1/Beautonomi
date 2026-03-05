"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ChevronRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;
const SUGGESTIONS_LIMIT = 6;

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  rank: number;
}

interface SearchWithSuggestionsProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (e: React.FormEvent) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  size?: "sm" | "md" | "lg";
  onSelectSuggestion?: () => void;
  /** When true, show search icon and kbd hint (hero style) */
  showKbd?: boolean;
  /** Hero: no border, shadow-inner, rounded-[24px] container, pill input */
  variant?: "default" | "hero";
}

export function SearchWithSuggestions({
  value,
  onChange,
  onSubmit,
  placeholder = "Search articles...",
  className,
  inputClassName,
  size = "md",
  onSelectSuggestion,
  showKbd = false,
  variant = "default",
}: SearchWithSuggestionsProps) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/public/learn/search?q=${encodeURIComponent(query.trim())}&limit=${SUGGESTIONS_LIMIT}`
      );
      const json = await res.json();
      const results = json?.data?.results ?? [];
      setSuggestions(Array.isArray(results) ? results : []);
      setSuggestionsOpen(true);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!value.trim()) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    const t = setTimeout(() => fetchSuggestions(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, fetchSuggestions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuggestionsOpen(false);
    const q = value.trim();
    if (q) {
      onSelectSuggestion?.();
      router.push(`/learn/search?q=${encodeURIComponent(q)}`);
    }
    onSubmit?.(e);
  };

  const goToArticle = (slug: string) => {
    setSuggestionsOpen(false);
    onSelectSuggestion?.();
    router.push(`/learn/article/${slug}`);
  };

  const goToSearch = () => {
    const q = value.trim();
    if (q) {
      setSuggestionsOpen(false);
      onSelectSuggestion?.();
      router.push(`/learn/search?q=${encodeURIComponent(q)}`);
    }
  };

  const inputHeight = size === "lg" ? "min-h-[52px] md:min-h-[56px]" : size === "sm" ? "h-10" : "h-11";
  const isHero = variant === "hero";

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div
          className={cn(
            "relative flex flex-1 items-center gap-3 px-4 transition-all duration-200 ease-in-out",
            isHero
              ? "rounded-full shadow-inner bg-zinc-100/80 min-h-[56px] md:min-h-[60px] focus-within:ring-2 focus-within:ring-[#ff0077]/20"
              : cn(
                  "rounded-xl border border-zinc-200/50 bg-white",
                  size === "sm" && "bg-zinc-50/50",
                  "hover:border-zinc-300/50 focus-within:ring-2 focus-within:ring-[#ff0077]/20 focus-within:border-[#ff0077]",
                  inputHeight
                )
          )}
        >
          <Search className={cn("shrink-0 text-zinc-500", size === "lg" ? "h-5 w-5" : "h-4 w-4")} />
          <Input
            type="search"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => value.trim().length >= MIN_QUERY_LENGTH && setSuggestionsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSuggestionsOpen(false);
            }}
            className={cn(
              "flex-1 border-0 bg-transparent p-0 h-auto text-base placeholder:text-zinc-400 focus-visible:ring-0 focus-visible:ring-offset-0",
              size === "sm" && "text-sm",
              inputClassName
            )}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={suggestionsOpen && suggestions.length > 0}
          />
          {loading && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#ff0077]" aria-hidden />
          )}
          {(showKbd || isHero) && !loading && (
            <kbd className="hidden sm:inline-flex h-6 items-center rounded-md border border-zinc-200/80 bg-zinc-100 px-1.5 text-xs font-medium text-zinc-500">
              ⌘K
            </kbd>
          )}
        </div>
      </form>

      {suggestionsOpen && (suggestions.length > 0 || loading) && value.trim().length >= MIN_QUERY_LENGTH && (
        <div
          className={cn(
            "absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(320px,70vh)] overflow-y-auto py-1 shadow-lg border border-zinc-200/50 bg-white",
            isHero ? "rounded-2xl" : "rounded-xl"
          )}
          role="listbox"
        >
          {loading && suggestions.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin text-[#ff0077]" />
              Searching...
            </div>
          ) : (
            <>
              {suggestions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="option"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-all duration-200 ease-in-out hover:bg-zinc-100 active:scale-[0.99]"
                  onClick={() => goToArticle(r.slug)}
                >
                  <span className="flex-1 font-medium text-black truncate">{r.title}</span>
                  {r.summary && (
                    <span className="hidden flex-1 truncate text-xs text-zinc-500 sm:block max-w-[200px]">
                      {r.summary}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                </button>
              ))}
              <div className="border-t border-zinc-200/50 pt-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-[#ff0077] hover:bg-zinc-100 transition-all duration-200 ease-in-out active:scale-[0.99]"
                  onClick={goToSearch}
                >
                  View all results for &quot;{value.trim()}&quot;
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
