import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, UserPlus } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { cn } from "@/lib/cn";

export type AssignableUser = { id: string; full_name: string | null; email: string | null };

export function labelOf(u: AssignableUser) {
  const n = u.full_name?.trim();
  const e = u.email?.trim();
  return n || e || u.id.slice(0, 8) + "…";
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function LeadAssigneeInline({
  leadId,
  assignedToId,
  displayName,
  updatedAt,
  onAssign,
  disabled,
  compact,
}: {
  leadId: string;
  assignedToId: string | null;
  displayName: string;
  updatedAt?: string;
  onAssign: (args: {
    leadId: string;
    assigned_to: string;
    assigned_to_name?: string;
    expected_updated_at?: string;
  }) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 280);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

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
      let right = window.innerWidth - rect.right;
      
      if (top + 250 > window.innerHeight) {
        top = Math.max(4, rect.top - 250 - 4);
      }
      
      setPopoverStyle({
        position: 'fixed',
        top: `${top}px`,
        right: `${right}px`,
        width: 'min(100vw - 2rem, 18rem)',
        zIndex: 9999,
      });
    };
    
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  const usersQ = useQuery({
    queryKey: adminQueryKeys.providerOps.assignableUsers(dq),
    queryFn: () =>
      adminApi.getJson<{ users: AssignableUser[] }>(
        `/api/admin/provider-ops/assignable-users?q=${encodeURIComponent(dq)}`,
        { timeoutMs: 15_000 },
      ),
    enabled: open,
    staleTime: 30_000,
  });

  const pick = useCallback(
    (u: AssignableUser) => {
      onAssign({
        leadId,
        assigned_to: u.id,
        assigned_to_name: labelOf(u),
        expected_updated_at: updatedAt,
      });
      setOpen(false);
      setQ("");
    },
    [leadId, onAssign, updatedAt],
  );

  const unassign = useCallback(() => {
    onAssign({ leadId, assigned_to: "", expected_updated_at: updatedAt });
    setOpen(false);
  }, [leadId, onAssign, updatedAt]);

  return (
    <div ref={rootRef} className={cn("relative inline-flex max-w-full items-center gap-1", compact && "justify-end")}>
      <span className={cn("truncate text-xs text-gray-700", compact ? "max-w-[7rem]" : "max-w-[10rem]")} title={displayName}>
        {assignedToId ? displayName : "—"}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex shrink-0 items-center rounded-md border border-gray-200 bg-white p-1 text-gray-500 hover:bg-gray-50 hover:text-gray-800 disabled:opacity-40 transition-colors"
        title="Change assignee"
        aria-expanded={open}
      >
        <UserPlus className="h-3.5 w-3.5" />
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          style={popoverStyle}
          className="rounded-xl border border-gray-200 bg-white py-1 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="search"
            placeholder="Search name or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full border-b border-gray-100 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
            autoFocus
          />
          <div className="max-h-52 overflow-auto py-1">
            {assignedToId ? (
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50"
                onClick={unassign}
              >
                Unassign
              </button>
            ) : null}
            {usersQ.isLoading && <p className="px-3 py-2 text-xs text-gray-400">Loading…</p>}
            {usersQ.isError && (
              <p className="px-3 py-2 text-xs text-red-600">{(usersQ.error as Error)?.message ?? "Failed to load"}</p>
            )}
            {(usersQ.data?.users ?? []).map((u) => (
              <button
                key={u.id}
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                onClick={() => pick(u)}
              >
                <span className="font-medium">{labelOf(u)}</span>
                {u.email && u.full_name ? <span className="block truncate text-[11px] text-gray-500">{u.email}</span> : null}
              </button>
            ))}
            {!usersQ.isLoading && (usersQ.data?.users?.length ?? 0) === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No matches</p>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/** Modal / panel: search assignable users (same API as inline picker). */
export function AssigneeSearchPanel({
  title,
  onPick,
  onClose,
}: {
  title: string;
  onPick: (u: AssignableUser) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 280);
  const usersQ = useQuery({
    queryKey: adminQueryKeys.providerOps.assignableUsers(`bulk|${dq}`),
    queryFn: () =>
      adminApi.getJson<{ users: AssignableUser[] }>(
        `/api/admin/provider-ops/assignable-users?q=${encodeURIComponent(dq)}`,
        { timeoutMs: 15_000 },
      ),
    staleTime: 20_000,
  });

  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <button type="button" className="text-xs text-gray-500 hover:text-gray-800" onClick={onClose}>
          Close
        </button>
      </div>
      <input
        type="search"
        placeholder="Search name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
        autoFocus
      />
      <div className="max-h-56 overflow-auto rounded-xl border border-gray-100">
        {usersQ.isLoading && <p className="px-3 py-4 text-xs text-gray-400">Loading…</p>}
        {(usersQ.data?.users ?? []).map((u) => (
          <button
            key={u.id}
            type="button"
            className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-gray-50"
            onClick={() => onPick(u)}
          >
            <span className="font-medium text-gray-900">{labelOf(u)}</span>
            {u.email ? <span className="text-[11px] text-gray-500">{u.email}</span> : null}
          </button>
        ))}
        {!usersQ.isLoading && (usersQ.data?.users?.length ?? 0) === 0 && (
          <p className="px-3 py-4 text-xs text-gray-400">No matches</p>
        )}
      </div>
    </div>
  );
}
