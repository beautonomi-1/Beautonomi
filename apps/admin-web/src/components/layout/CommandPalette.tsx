import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { CornerDownLeft, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminSearchResultSpaPath } from "@/lib/adminSearchSpaPaths";
import { adminApi } from "@/lib/adminClient";

const RECENT_SEARCHES_KEY = "admin_recent_searches";
const RECENT_MAX = 8;

export type CommandPaletteNavMatch = {
  title: string;
  href: string;
  group: string;
  icon: LucideIcon;
};

type RecentSearch = {
  query: string;
  label: string;
  to: string;
  at: number;
};

type SearchPayload = {
  users: Array<{ id: string; email: string; full_name: string | null; phone?: string | null }>;
  bookings: Array<{ id: string; booking_number: string; created_at?: string }>;
  providers: Array<{ id: string; business_name: string; owner_name?: string | null; owner_email?: string | null }>;
  leads?: Array<{ id: string; business_name: string | null; lead_name: string | null; email: string | null }>;
  onboarding_drafts?: Array<{ user_id: string; business_name: string | null; owner_email: string | null; owner_name: string | null }>;
};

function loadRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentSearch[];
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(entry: Omit<RecentSearch, "at">) {
  if (typeof window === "undefined") return;
  const trimmed = entry.query.trim();
  if (!trimmed) return;
  const next: RecentSearch[] = [
    { ...entry, query: trimmed, at: Date.now() },
    ...loadRecentSearches().filter((r) => r.to !== entry.to || r.query !== trimmed),
  ].slice(0, RECENT_MAX);
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
}

type FlatTarget = { key: string; to: string; label: string; group: string; icon?: LucideIcon };

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  navMatches: CommandPaletteNavMatch[];
};

export function CommandPalette({ open, onClose, navMatches }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchPayload | null>(null);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSearchResults(null);
    setActiveIndex(0);
    setRecent(loadRecentSearches());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const q = encodeURIComponent(query.trim());
        const data = await adminApi.getJson<SearchPayload>(`/api/admin/search?q=${q}`);
        setSearchResults(data);
      } catch {
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, open]);

  const flatTargets = useMemo<FlatTarget[]>(() => {
    const items: FlatTarget[] = [];
    const q = query.trim();

    if (q.length < 2) {
      for (const r of recent) {
        items.push({ key: `recent:${r.to}:${r.query}`, to: r.to, label: r.label, group: "Recent" });
      }
    }

    for (const n of navMatches) {
      items.push({ key: `nav:${n.href}`, to: adminSpaTo(n.href), label: n.title, group: n.group, icon: n.icon });
    }

    for (const u of (searchResults?.users ?? []).slice(0, 5)) {
      items.push({
        key: `user:${u.id}`,
        to: adminSearchResultSpaPath("user", u.id),
        label: u.full_name || u.email || u.id,
        group: "Users",
      });
    }
    for (const p of (searchResults?.providers ?? []).slice(0, 5)) {
      items.push({
        key: `provider:${p.id}`,
        to: adminSearchResultSpaPath("provider", p.id),
        label: p.business_name,
        group: "Providers",
      });
    }
    for (const b of (searchResults?.bookings ?? []).slice(0, 5)) {
      items.push({
        key: `booking:${b.id}`,
        to: adminSearchResultSpaPath("booking", b.id),
        label: b.booking_number,
        group: "Bookings",
      });
    }
    for (const l of (searchResults?.leads ?? []).slice(0, 5)) {
      items.push({
        key: `lead:${l.id}`,
        to: adminSearchResultSpaPath("lead", l.id),
        label: l.business_name || l.lead_name || l.email || l.id,
        group: "Provider leads",
      });
    }
    for (const d of (searchResults?.onboarding_drafts ?? []).slice(0, 5)) {
      items.push({
        key: `draft:${d.user_id}`,
        to: adminSearchResultSpaPath("onboarding_draft", d.user_id),
        label: d.business_name || d.owner_name || d.owner_email || d.user_id,
        group: "Onboarding drafts",
      });
    }

    return items;
  }, [query, recent, navMatches, searchResults]);

  useEffect(() => {
    setActiveIndex((i) => (flatTargets.length === 0 ? 0 : Math.min(i, flatTargets.length - 1)));
  }, [flatTargets.length]);

  const goTo = useCallback(
    (target: FlatTarget) => {
      if (query.trim().length >= 2) {
        pushRecentSearch({ query: query.trim(), label: target.label, to: target.to });
      }
      navigate(target.to);
      onClose();
    },
    [navigate, onClose, query],
  );

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, flatTargets.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const target = flatTargets[activeIndex] ?? flatTargets[0];
      if (target) {
        e.preventDefault();
        goTo(target);
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[12vh]">
      <button type="button" className="absolute inset-0" aria-label="Close command palette" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-gray-100 px-3">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            autoFocus
            className="h-12 w-full bg-transparent text-sm outline-none"
            placeholder="Search pages, users, bookings, leads…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-expanded
            aria-controls="admin-command-palette-results"
          />
          <kbd className="hidden rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400 sm:inline">Esc</kbd>
        </div>
        <div id="admin-command-palette-results" role="listbox" className="max-h-[24rem] overflow-auto p-2 text-sm">
          {flatTargets.length === 0 ? (
            <p className="px-2 py-3 text-gray-500">
              {query.trim().length >= 2
                ? searching
                  ? "Searching…"
                  : `No results for “${query.trim()}”`
                : "Type to search or pick a recent destination"}
            </p>
          ) : (
            flatTargets.map((target, idx) => {
              const active = idx === activeIndex;
              return (
                <button
                  key={target.key}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn(
                    "flex w-full min-h-10 items-center gap-2 rounded-lg px-2 py-2 text-left",
                    active ? "bg-primary/10 text-primary" : "hover:bg-gray-50",
                  )}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => goTo(target)}
                >
                  {target.icon ? (
                    <target.icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-gray-400")} />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">
                    <span className={cn("font-medium", active ? "text-primary" : "text-gray-900")}>{target.label}</span>
                    <span className="ml-2 text-xs text-gray-400">{target.group}</span>
                  </span>
                  {active ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-primary/70" /> : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
