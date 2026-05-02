import { AdminApiError } from "@beautonomi/admin-api-client";
import { adminToast } from "@/lib/adminToast";

/** Toast + return true when API rejected optimistic concurrency (409 CONCURRENT_UPDATE). */
export function handleLeadConcurrent409(e: unknown): boolean {
  if (e instanceof AdminApiError && e.status === 409) {
    adminToast.error("Another teammate updated this lead — refreshed from server.");
    return true;
  }
  return false;
}
