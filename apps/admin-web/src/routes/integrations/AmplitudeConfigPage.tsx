import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

export function AmplitudeConfigPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations & dev access is required."
  );
  const [sp, setSp] = useSearchParams();
  const env = sp.get("environment") || "production";

  const q = useQuery({
    queryKey: adminQueryKeys.amplitude(env),
    queryFn: () =>
      adminApi.getJson<Record<string, unknown> | null>(
        `/api/admin/integrations/amplitude?environment=${encodeURIComponent(env)}`,
        { timeoutMs: 30_000 }
      ),
    enabled: allowed,
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Amplitude" />
        <AdminPanel>
          <AdminPageSkeleton rows={3} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const d = q.data;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Amplitude" description="GET /api/admin/integrations/amplitude" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/integrations/amplitude")} className="font-medium text-gray-900 underline">
          Edit keys in legacy (PUT) →
        </a>
      </p>
      <AdminPanel>
        <label className="text-sm text-gray-600">
          Environment{" "}
          <select
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
            value={env}
            onChange={(e) => {
              const n = new URLSearchParams(sp);
              n.set("environment", e.target.value);
              setSp(n, { replace: true });
            }}
          >
            <option value="production">production</option>
            <option value="staging">staging</option>
          </select>
        </label>
        {d == null ? (
          <p className="mt-4 text-sm text-gray-600">No configuration row for this environment.</p>
        ) : (
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(d)
              .filter(([k]) => !k.includes("key") && !k.includes("secret"))
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-gray-500">{k}</dt>
                  <dd className="font-medium">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))}
          </dl>
        )}
      </AdminPanel>
    </div>
  );
}
