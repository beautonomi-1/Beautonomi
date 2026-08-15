"use client";

import { useEffect, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { invalidateProviderPortalCache } from "@/providers/provider-portal/ProviderPortalProvider";
import { cn } from "@/lib/utils";

type Membership = {
  provider_id: string;
  business_name: string;
  relationship: "owner" | "staff";
};

/**
 * Compact salon switcher for users with multiple provider memberships.
 */
export function ProviderOrgSwitcher({
  collapsed,
  variant = "dark",
  className,
}: {
  collapsed?: boolean;
  variant?: "dark" | "light";
  className?: string;
}) {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{
          data?: { memberships?: Membership[]; active_provider_id?: string | null; has_multiple?: boolean };
        }>("/api/provider/memberships");
        if (cancelled) return;
        const data = res.data;
        setMemberships(data?.memberships ?? []);
        setActiveId(data?.active_provider_id ?? null);
      } catch {
        if (!cancelled) setMemberships([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || memberships.length === 0) return null;

  const isLight = variant === "light";
  const current = memberships.find((m) => m.provider_id === activeId) ?? memberships[0];
  const canSwitch = memberships.length > 1;

  async function switchOrg(providerId: string) {
    if (providerId === activeId) return;
    await fetcher.post("/api/provider/memberships", { provider_id: providerId });
    invalidateProviderPortalCache();
    setActiveId(providerId);
    window.location.reload();
  }

  if (collapsed) {
    if (!canSwitch) {
      return (
        <p
          className={cn(
            "w-full text-[10px] truncate px-1 mb-2",
            isLight ? "text-gray-600" : "text-white/80",
          )}
          title={current?.business_name}
        >
          {current?.business_name}
        </p>
      );
    }
    return (
      <select
        aria-label="Switch business"
        className={cn(
          "w-full text-xs rounded-md px-2 py-1 mb-2",
          isLight
            ? "bg-white text-gray-900 border border-gray-200"
            : "bg-white/10 text-white border border-white/20",
        )}
        value={activeId ?? ""}
        onChange={(e) => void switchOrg(e.target.value)}
      >
        {memberships.map((m) => (
          <option key={m.provider_id} value={m.provider_id} className="text-gray-900">
            {m.business_name}{m.relationship === "owner" ? " (owner)" : " (staff)"}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div
      className={cn(
        isLight ? "rounded-xl border border-gray-200 bg-gray-50 px-3 py-2" : "px-3 py-2 mb-2 border-b border-white/10",
        className,
      )}
    >
      <label
        className={cn(
          "text-[10px] uppercase tracking-wide block mb-1",
          isLight ? "text-gray-500" : "text-white/70",
        )}
      >
        Active business
      </label>
      {canSwitch ? (
        <select
          className={cn(
            "w-full text-sm rounded-md px-2 py-1.5",
            isLight
              ? "bg-white text-gray-900 border border-gray-200"
              : "bg-white/10 text-white border border-white/20",
          )}
          value={activeId ?? ""}
          onChange={(e) => void switchOrg(e.target.value)}
        >
          {memberships.map((m) => (
            <option key={m.provider_id} value={m.provider_id} className="text-gray-900">
              {m.business_name}{m.relationship === "owner" ? " (owner)" : " (staff)"}
            </option>
          ))}
        </select>
      ) : (
        <p className={cn("text-sm font-medium truncate", isLight ? "text-gray-900" : "text-white")}>
          {current?.business_name}
          {current?.relationship === "owner" ? " (owner)" : " (staff)"}
        </p>
      )}
    </div>
  );
}
