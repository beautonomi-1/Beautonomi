import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";

/** True when agents may propose but platform blocks execution (shadow mode or gates). */
export function useAgentShadowMode() {
  const q = useQuery({
    queryKey: ["agent-gate-status", "production"],
    queryFn: () =>
      adminApi.getJson<{
        mutations_allowed?: boolean;
        shadow_mode?: boolean;
        master_enabled?: boolean;
        blockers?: string[];
      }>("/api/admin/agents/assist-status?environment=production"),
    staleTime: 60_000,
  });
  const shadowMode = q.data?.shadow_mode === true || q.data?.mutations_allowed === false;
  const masterEnabled = q.data?.master_enabled !== false;
  return { shadowMode, masterEnabled, blockers: q.data?.blockers ?? [], loading: q.isLoading };
}
