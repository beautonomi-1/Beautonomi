/**
 * When on-demand accept is enabled, subscribes to Realtime for new on-demand
 * requests and navigates to the incoming screen when one appears (deduped by
 * seen ids). Falls back to polling if Realtime is unavailable.
 */
import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { useProvider } from "@/providers/ProviderContext";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";

interface OnDemandRequestRow {
  id: string;
  status: string;
}

export function OnDemandIncomingListener() {
  const router = useRouter();
  const onDemandConfig = useModuleConfig("on_demand");
  const { provider } = useProvider();
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Realtime: subscribe to INSERTs on on_demand_requests for this provider
  useEffect(() => {
    if (!onDemandConfig.enabled || !provider?.id) return;

    const channel = supabase
      .channel(`on-demand-requests:${provider.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "on_demand_requests",
          filter: `provider_id=eq.${provider.id}`,
        },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (row.status !== "requested") return;
          if (seenIdsRef.current.has(row.id)) return;
          seenIdsRef.current.add(row.id);
          router.push(`/(app)/on-demand/incoming/${row.id}` as never);
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [onDemandConfig.enabled, provider?.id, router]);

  // Fallback poll in case Realtime misses an event or is unavailable
  useEffect(() => {
    if (!onDemandConfig.enabled) return;

    const poll = async () => {
      try {
        const result = await api.get<OnDemandRequestRow[]>("/api/provider/on-demand/requests");
        const list = result.data ?? [];
        const requested = list.filter((r) => r.status === "requested");
        for (const r of requested) {
          if (seenIdsRef.current.has(r.id)) continue;
          seenIdsRef.current.add(r.id);
          router.push(`/(app)/on-demand/incoming/${r.id}` as never);
          break;
        }
      } catch {
        // ignore
      }
    };

    const interval = setInterval(poll, 12000);
    poll();
    return () => clearInterval(interval);
  }, [onDemandConfig.enabled, router]);

  return null;
}
