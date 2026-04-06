import { useMemo } from "react";
import type { AdminSection } from "@beautonomi/admin-access";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

/**
 * Section RBAC for a page: keep `useQuery({ enabled: allowed })` in sync with the gate.
 * Returns a pre-built denied element so call sites stay one-liner: `if (denied) return denied`.
 */
export function useAdminSectionPage(section: AdminSection, permissionMessage: string) {
  const { canAccess } = useAdminSession();
  const allowed = canAccess(section);

  const denied = useMemo(
    () => (!allowed ? <PermissionDenied message={permissionMessage} /> : null),
    [allowed, permissionMessage]
  );

  return { allowed, denied };
}
