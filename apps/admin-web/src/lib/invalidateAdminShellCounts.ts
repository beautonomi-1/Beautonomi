import type { QueryClient } from "@tanstack/react-query";
import { adminQueryKeys } from "@/lib/adminQueryKeys";

/** Refresh sidebar queue badges, activity queues, and persisted notification inbox. */
export function invalidateAdminShellCounts(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
  void qc.invalidateQueries({ queryKey: adminQueryKeys.activity() });
  void qc.invalidateQueries({ queryKey: adminQueryKeys.adminNotifications() });
}
