"use client";

import { useEffect, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
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
        if (!data?.has_multiple) {
          setMemberships([]);
          return;
        }
        setMemberships(data.memberships ?? []);
        setActiveId(data.active_provider_id ?? null);
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

  if (loading || memberships.length < 2) return null;

  const isLight = variant === "light";

  async function switchOrg(providerId: string) {
    await fetcher.post("/api/provider/memberships", { provider_id: providerId });
    setActiveId(providerId);
    window.location.reload();
  }

  if (collapsed) {
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
            {m.business_name}
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
            {m.business_name}
          </option>
        ))}
      </select>
    </div>
  );
}
