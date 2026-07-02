import { Navigate } from "react-router-dom";
import { adminSpaTo } from "@/lib/adminSpaPath";

/**
 * Monitoring is now merged into Platform Health under the "API Monitoring" tab.
 * Redirect any direct visits to /admin/monitoring to the merged page.
 */
export function MonitoringHealthPage() {
  return <Navigate to={adminSpaTo("/admin/system-health?tab=monitoring")} replace />;
}
