"use client";

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useId,
} from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

export interface ChipComboboxSuggestion {
  value: string;
  label: string;
  category?: string;
}

export interface ChipComboboxBaseProps {
  staticSuggestions?: ChipComboboxSuggestion[];
  fetchSuggestions?: (
    query: string,
    selected: string[],
    context?: Record<string, unknown>
  ) => Promise<ChipComboboxSuggestion[]>;
  context?: Record<string, unknown>;
  maxSuggestions?: number;
  debounceMs?: number;
  normalizeValue?: (raw: string) => string;
  placeholder?: string;
  className?: string;
  allowFreeForm?: boolean;
  onCreateNew?: (
    raw: string
  ) => Promise<{ value: string; label: string } | null>;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

export interface ChipComboboxSingleProps extends ChipComboboxBaseProps {
  singleSelect: true;
  value: string | null;
  onChange: (v: string | null) => void;
}

export interface ChipComboboxMultiProps extends ChipComboboxBaseProps {
  singleSelect?: false;
  value: string[];
  onChange: (v: string[]) => void;
  maxChips?: number;
}

export type ChipComboboxProps =
  | ChipComboboxSingleProps
  | ChipComboboxMultiProps;

const defaultNormalize = (raw: string) => raw.trim().toLowerCase();

function rankScore(
  item: ChipComboboxSuggestion,
  queryNorm: string,
  normalize: (s: string) => string
): number {
  if (!queryNorm) return 10;
  const labelNorm = normalize(item.label);
  const valueNorm = normalize(item.value);
  if (labelNorm === queryNorm || valueNorm === queryNorm) return 100;
  if (labelNorm.startsWith(queryNorm) || valueNorm.startsWith(queryNorm))
    return 50;
  if (labelNorm.includes(queryNorm) || valueNorm.includes(queryNorm))
    return 25;
  return 0;
}

export function ChipCombobox(props: ChipComboboxProps) {
  const {
    staticSuggestions = [],
    fetchSuggestions,
    context,
    maxSuggestions = 5,
    debounceMs = 250,
    normalizeValue = defaultNormalize,
    placeholder = "Type or select…",
    className,
    allowFreeForm = true,
    onCreateNew,
  } = props;

  const isSingle = props.singleSelect === true;
  const value = props.value;
  const onChange = props.onChange;
  const selectedList: string[] = isSingle
    ? value != null && value !== ""
      ? [String(value)]
      : []
    : Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string")
      : [];
  const maxChips =
    !isSingle ? (props as ChipComboboxMultiProps).maxChips ?? 0 : 1;

  const [inputValue, setInputValue] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asyncSuggestions, setAsyncSuggestions] = useState<
    ChipComboboxSuggestion[]
  >([]);
  const requestIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-option-${i}`;

  const normalize = useCallback(
    (raw: string) => normalizeValue(raw.trim()),
    [normalizeValue]
  );

  const selectedSet = useMemo(
    () => new Set(selectedList.map(normalize).filter(Boolean)),
    [selectedList, normalize]
  );

  const fetchAsync = useCallback(
    async (query: string) => {
      if (!fetchSuggestions) return;
      const id = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const list = await fetchSuggestions(query, selectedList, context);
        if (id === requestIdRef.current) setAsyncSuggestions(list ?? []);
      } catch (e) {
        if (id === requestIdRef.current)
          setError(
            e instanceof Error ? e.message : "Failed to load suggestions"
          );
      } finally {
        if (id === requestIdRef.current) setLoading(false);
      }
    },
    [fetchSuggestions, selectedList, context]
  );

  useEffect(() => {
    if (!fetchSuggestions) return;
    const t = setTimeout(() => fetchAsync(inputValue), debounceMs);
    return () => clearTimeout(t);
  }, [inputValue, debounceMs, fetchSuggestions, fetchAsync]);

  const candidates = useMemo(() => {
    const merged = new Map<string, ChipComboboxSuggestion>();
    [...staticSuggestions, ...asyncSuggestions].forEach((item) => {
      const key = normalize(item.value);
      if (!key) return;
      if (selectedSet.has(key)) return;
      merged.set(key, item);
    });
    return Array.from(merged.values());
  }, [staticSuggestions, asyncSuggestions, selectedSet, normalize]);

  const queryNorm = normalize(inputValue);
  const filteredAndRanked = useMemo(() => {
    let list = candidates;
    if (queryNorm) {
      list = candidates
        .map((item) => ({
          item,
          score: rankScore(item, queryNorm, normalize),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.item);
    }
    return list.slice(0, maxSuggestions);
  }, [candidates, queryNorm, maxSuggestions, normalize]);

  const canAddFreeForm =
    allowFreeForm &&
    inputValue.trim() !== "" &&
    !selectedSet.has(normalize(inputValue));

  const options = useMemo(() => {
    const rows: Array<
      | { type: "suggestion"; value: string; label: string; isFreeForm: false }
      | { type: "freeform"; value: string; label: string; isFreeForm: true }
    > = filteredAndRanked.map((item) => ({
      type: "suggestion" as const,
      value: item.value,
      label: item.label,
      isFreeForm: false as const,
    }));
    if (canAddFreeForm) {
      rows.push({
        type: "freeform" as const,
        value: inputValue.trim(),
        label: `Add "${inputValue.trim()}"`,
        isFreeForm: true as const,
      });
    }
    return rows;
  }, [filteredAndRanked, canAddFreeForm, inputValue]);

  const getLabelForValue = useCallback(
    (v: string): string => {
      const fromStatic = staticSuggestions.find(
        (s) => normalize(s.value) === normalize(v)
      );
      if (fromStatic) return fromStatic.label;
      const fromAsync = asyncSuggestions.find(
        (s) => normalize(s.value) === normalize(v)
      );
      if (fromAsync) return fromAsync.label;
      return v;
    },
    [staticSuggestions, asyncSuggestions, normalize]
  );

  const addValue = useCallback(
    (rawValue: string, isFreeFormEntry?: boolean) => {
      const trimmed = rawValue.trim();
      if (!trimmed) return;
      const norm = normalize(trimmed);
      if (selectedSet.has(norm)) return;

      if (isSingle) {
        if (isFreeFormEntry && onCreateNew) {
          onCreateNew(trimmed).then((res) => {
            if (res) (onChange as (v: string | null) => void)(res.value);
          });
        } else {
          (onChange as (v: string | null) => void)(trimmed);
        }
        setInputValue("");
        setDropdownOpen(false);
        setHighlightedIndex(-1);
        return;
      }
      const next = [...(value as string[]), trimmed];
      (onChange as (v: string[]) => void)(next);
      setInputValue("");
      setHighlightedIndex(-1);
    },
    [isSingle, selectedSet, normalize, value, onChange, onCreateNew]
  );

  const removeValue = useCallback(
    (toRemove: string) => {
      if (isSingle) {
        (onChange as (v: string | null) => void)(null);
        return;
      }
      const next = (value as string[]).filter(
        (v) => normalize(v) !== normalize(toRemove)
      );
      (onChange as (v: string[]) => void)(next);
    },
    [isSingle, value, onChange, normalize]
  );

  const removeLastChip = useCallback(() => {
    if (isSingle) {
      if (value) (onChange as (v: string | null) => void)(null);
      return;
    }
    const arr = value as string[];
    if (arr.length > 0) (onChange as (v: string[]) => void)(arr.slice(0, -1));
  }, [isSingle, value, onChange]);

  const displayValues: string[] = isSingle
    ? value != null && value !== ""
      ? [String(value)]
      : []
    : Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string")
      : [];
  const atMaxChips =
    maxChips > 0 && displayValues.length >= maxChips && !isSingle;
  const showDropdown = dropdownOpen;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && inputValue === "" && selectedList.length > 0) {
        removeLastChip();
        return;
      }
      if (e.key === "Enter" && options.length > 0) {
        e.preventDefault();
        const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
        const opt = options[idx];
        addValue(opt.value, opt.type === "freeform");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => (i < options.length - 1 ? i + 1 : i));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => (i > 0 ? i - 1 : -1));
        return;
      }
      if (e.key === "Escape") {
        setDropdownOpen(false);
        setHighlightedIndex(-1);
      }
    },
    [
      inputValue,
      selectedList.length,
      options,
      highlightedIndex,
      removeLastChip,
      addValue,
    ]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex min-h-10 flex-wrap items-center gap-2 rounded-md border border-input bg-muted/30 px-3 py-2",
          showDropdown && "rounded-b-none border-b-0"
        )}
      >
        {displayValues.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-sm"
          >
            <span className="max-w-[160px] truncate">
              {getLabelForValue(v)}
            </span>
            <button
              type="button"
              onClick={() => removeValue(v)}
              className="rounded p-0.5 hover:bg-muted-foreground/20"
              aria-label={`Remove ${getLabelForValue(v)}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {!atMaxChips && (
          <input
            ref={inputRef}
            type="text"
            className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => {
              setDropdownOpen(true);
              setHighlightedIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={props["aria-label"]}
            aria-describedby={props["aria-describedby"]}
            aria-expanded={showDropdown}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              highlightedIndex >= 0
                ? optionId(highlightedIndex)
                : undefined
            }
          />
        )}
      </div>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 max-h-[220px] overflow-auto rounded-b-md border border-t-0 border-input bg-popover shadow-md"
        >
          {loading && !error && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <span className="animate-pulse">Loading…</span>
            </div>
          )}
          {error && (
            <div className="px-3 py-2 text-sm text-destructive">{error}</div>
          )}
          {!loading && !error && options.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {inputValue.trim() ? (
                <>
                  No matches
                  {canAddFreeForm && (
                    <button
                      type="button"
                      className="ml-2 text-primary hover:underline"
                      onClick={() => addValue(inputValue.trim(), true)}
                    >
                      Add &quot;{inputValue.trim()}&quot;
                    </button>
                  )}
                </>
              ) : (
                "Type to search or select from suggestions"
              )}
            </div>
          )}
          {!loading && !error && options.length > 0 && (
            <ul className="py-1">
              {options.map((opt, idx) => (
                <li key={opt.type === "freeform" ? "freeform" : opt.value}>
                  <button
                    type="button"
                    id={optionId(idx)}
                    role="option"
                    aria-selected={idx === highlightedIndex}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm",
                      idx === highlightedIndex && "bg-accent",
                      opt.type === "freeform" && "text-primary font-medium"
                    )}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => addValue(opt.value, opt.type === "freeform")}
                  >
                    {opt.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
