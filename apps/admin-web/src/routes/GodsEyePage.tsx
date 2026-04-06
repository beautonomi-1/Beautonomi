import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminQueryBlock } from "@/components/admin/AdminQueryBlock";

interface GodsEyePayload {
  overview?: {
    total_users?: number;
    total_providers?: number;
    total_bookings?: number;
    total_revenue?: number;
  };
}

export function GodsEyePage() {
  const { allowed, denied } = useSuperadminPage("Gods Eye matches legacy admin: superadmin only.");

  const q = useQuery({
    queryKey: adminQueryKeys.godsEye(),
    queryFn: () => adminApi.getJson<GodsEyePayload>("/api/admin/gods-eye", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Gods Eye"
        description="Operations overview; live map parity deferred (use legacy map tab if needed)."
      />
      <AdminQueryBlock query={q}>
        {(payload) => {
          const o = payload?.overview;
          return (
            <AdminPanel>
              {o ? (
                <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <dt className="text-gray-500">Users</dt>
                    <dd className="text-lg font-semibold">{o.total_users ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Providers</dt>
                    <dd className="text-lg font-semibold">{o.total_providers ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Bookings</dt>
                    <dd className="text-lg font-semibold">{o.total_bookings ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Revenue</dt>
                    <dd className="text-lg font-semibold">{o.total_revenue ?? "—"}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-gray-600">No overview payload.</p>
              )}
            </AdminPanel>
          );
        }}
      </AdminQueryBlock>
    </div>
  );
}
