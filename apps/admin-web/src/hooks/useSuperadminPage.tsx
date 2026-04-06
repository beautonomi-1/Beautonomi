import { useMemo } from "react";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

/** Superadmin-only surfaces (analytics, gods-eye, …) — matches server superadmin checks. */
export function useSuperadminPage(permissionMessage: string) {
  const { bootstrap } = useAdminSession();
  const allowed = bootstrap?.isSuperadmin === true;

  const denied = useMemo(
    () => (!allowed ? <PermissionDenied message={permissionMessage} /> : null),
    [allowed, permissionMessage]
  );

  return { allowed, denied };
}
