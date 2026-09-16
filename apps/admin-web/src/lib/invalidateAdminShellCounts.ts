import type { QueryClient } from "@tanstack/react-query";
import { adminQueryKeys } from "@/lib/adminQueryKeys";

/** Refresh sidebar queue badges, activity queues, and persisted notification inbox. */
export function invalidateAdminShellCounts(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
  void qc.invalidateQueries({ queryKey: adminQueryKeys.activity() });
  // Prefix match so bell ("bell") and inbox pages all refresh after read/unread/delete.
  void qc.invalidateQueries({ queryKey: [...adminQueryKeys.root, "admin-notifications"] });
}
