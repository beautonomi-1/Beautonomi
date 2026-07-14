import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Search, UserPlus, X } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { cn } from "@/lib/cn";

export type ReferrerSelection = {
  referrer_user_id: string | null;
  referrer_provider_id: string | null;
  display_name: string;
};

type ReferrerSearchHit = {
  type: "provider" | "user";
  id: string;
  user_id: string | null;
  provider_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function hitToSelection(hit: ReferrerSearchHit): ReferrerSelection {
  if (hit.type === "provider" || hit.provider_id) {
    return {
      referrer_provider_id: hit.provider_id ?? hit.id,
      referrer_user_id: hit.user_id,
      display_name: hit.name,
    };
  }
  return {
    referrer_provider_id: null,
    referrer_user_id: hit.user_id ?? hit.id,
    display_name: hit.name,
  };
}

function hitSubtitle(hit: ReferrerSearchHit): string {
  const parts = [
    hit.type === "provider" ? "Provider" : "User",
    hit.email,
    hit.phone,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function ReferrerPicker({
  value,
  onChange,
  disabled,
  placeholder = "Search providers or users…",
}: {
  value: ReferrerSelection | null;
  onChange: (next: ReferrerSelection | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 280);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const searchQ = useQuery({
    queryKey: adminQueryKeys.providerOps.referrerSearch(dq),
    queryFn: () =>
      adminApi.getJson<{ results: ReferrerSearchHit[] }>(
        `/api/admin/provider-ops/referrers/search?q=${encodeURIComponent(dq)}`,
      ),
    enabled: open && dq.trim().length >= 2,
  });

  const results = searchQ.data?.results ?? [];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        rootRef.current && !rootRef.current.contains(e.target as Node) &&
        popoverRef.current && !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open || !rootRef.current) return;
    const updatePosition = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      let top = rect.bottom + 4;
      const right = window.innerWidth - rect.right;
      if (top + 280 > window.innerHeight) {
        top = Math.max(4, rect.top - 280 - 4);
      }
      setPopoverStyle({ position: "fixed", top, right, width: Math.max(rect.width, 320), zIndex: 9999 });
    };
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  const handleSelect = useCallback(
    (hit: ReferrerSearchHit) => {
      onChange(hitToSelection(hit));
      setOpen(false);
      setQ("");
    },
    [onChange],
  );

  const popover = open ? createPortal(
    <div
      ref={popoverRef}
      style={popoverStyle}
      className="rounded-xl border border-gray-200 bg-white shadow-lg"
    >
      <div className="border-b border-gray-100 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-gray-400 focus:outline-none"
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {dq.trim().length < 2 ? (
          <p className="px-3 py-4 text-xs text-gray-400">Type at least 2 characters to search</p>
        ) : searchQ.isLoading ? (
          <p className="px-3 py-4 text-xs text-gray-400">Searching…</p>
        ) : searchQ.isError ? (
          <p className="px-3 py-4 text-xs text-red-600">Search failed</p>
        ) : results.length === 0 ? (
          <p className="px-3 py-4 text-xs text-gray-400">No matches</p>
        ) : (
          results.map((hit) => (
            <button
              key={`${hit.type}:${hit.id}`}
              type="button"
              onClick={() => handleSelect(hit)}
              className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-gray-50"
            >
              <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-800">{hit.name}</span>
                <span className="block truncate text-xs text-gray-500">{hitSubtitle(hit)}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span className={cn("truncate text-left", value ? "text-gray-800" : "text-gray-400")}>
          {value?.display_name || "Select referrer (optional)"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {value ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"
        >
          <X className="h-3 w-3" /> Clear referrer
        </button>
      ) : null}
      {popover}
    </div>
  );
}

export function referrerSelectionFromLead(lead: Record<string, unknown>): ReferrerSelection | null {
  const provider = lead.referrer_provider as { id?: string; business_name?: string | null; email?: string | null; billing_email?: string | null } | null | undefined;
  const user = lead.referrer_user as { id?: string; full_name?: string | null; email?: string | null } | null | undefined;
  const providerId = lead.referrer_provider_id != null ? String(lead.referrer_provider_id) : provider?.id ?? null;
  const userId = lead.referrer_user_id != null ? String(lead.referrer_user_id) : user?.id ?? null;
  if (!providerId && !userId) return null;

  const display_name =
    provider?.business_name?.trim() ||
    user?.full_name?.trim() ||
    provider?.billing_email?.trim() ||
    provider?.email?.trim() ||
    user?.email?.trim() ||
    "Referrer";

  return {
    referrer_provider_id: providerId,
    referrer_user_id: userId,
    display_name,
  };
}
