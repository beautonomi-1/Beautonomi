import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";
import { useProvider } from "@/providers/ProviderContext";

type CommerceRealtimeTable = "product_orders" | "product_return_requests";

/**
 * Debounced silent refetch when commerce rows change. List screens cache per
 * filter URL, so nav-counts realtime alone leaves chip counts stale until focus.
 */
export function useCommerceListRealtimeRefresh(
  silentRefresh: () => void,
  tables: CommerceRealtimeTable[],
  enabled = true,
): void {
  const { provider } = useProvider();
  const refreshRef = useRef(silentRefresh);
  useEffect(() => {
    refreshRef.current = silentRefresh;
  }, [silentRefresh]);

  const tablesKey = tables.join(",");

  const tablesRef = useRef(tables);
  tablesRef.current = tables;

  useEffect(() => {
    const providerId = provider?.id;
    const activeTables = tablesRef.current;
    if (!enabled || !providerId || activeTables.length === 0) return;

    let debounce: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        refreshRef.current();
      }, 400);
    };

    try {
      const topic = nextRealtimeTopic(`commerce-list:${providerId}:${tablesKey}`);
      let builder = supabase.channel(topic);
      for (const table of activeTables) {
        builder = builder.on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table,
            filter: `provider_id=eq.${providerId}`,
          },
          scheduleRefresh,
        );
      }
      channel = builder.subscribe();
    } catch {
      // Realtime is optional — pull-to-refresh and focus revalidation remain.
    }

    return () => {
      if (debounce) clearTimeout(debounce);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, provider?.id, tablesKey]);
}
