import { notifyAdminOps } from "@/lib/notifications/notify-admin-ops";

const FINANCE_STAFF_ROLES = ["superadmin", "admin_finance"] as const;

/** In-app alert for superadmin + admin_finance (bell badge). */
export async function notifyFinanceStaff(input: {
  tenantId: string;
  title: string;
  message: string;
  link: string;
  dedupeKey: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  void notifyAdminOps({
    roles: [...FINANCE_STAFF_ROLES],
    type: "admin_ops_alert",
    title: input.title,
    message: input.message,
    link: input.link,
    tenantId: input.tenantId,
    dedupeKey: input.dedupeKey,
    data: input.data,
  });
}
