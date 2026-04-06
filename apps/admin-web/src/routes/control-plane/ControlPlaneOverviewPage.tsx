import { Link } from "react-router-dom";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

const LINKS: { title: string; to?: string; legacy?: string; note?: string }[] = [
  { title: "Feature flags (control plane)", legacy: "/admin/control-plane/feature-flags", note: "SPA: settings/feature-flags list" },
  { title: "Integrations hub", legacy: "/admin/control-plane/integrations" },
  { title: "Sumsub", legacy: "/admin/control-plane/integrations/sumsub" },
  { title: "Gemini", legacy: "/admin/control-plane/integrations/gemini" },
  { title: "Aura", legacy: "/admin/control-plane/integrations/aura" },
  { title: "Ads module", legacy: "/admin/control-plane/modules/ads" },
  { title: "On-demand", legacy: "/admin/control-plane/modules/on-demand" },
  { title: "AI module", legacy: "/admin/control-plane/modules/ai" },
  { title: "Ranking", legacy: "/admin/control-plane/modules/ranking" },
  { title: "Distance", legacy: "/admin/control-plane/modules/distance" },
  { title: "Safety", legacy: "/admin/control-plane/modules/safety" },
  { title: "Safety logs", legacy: "/admin/control-plane/safety-logs" },
  { title: "Maintenance", legacy: "/admin/control-plane/maintenance" },
  { title: "Sign-ups notify", legacy: "/admin/control-plane/maintenance/sign-ups" },
  { title: "Config audit log", legacy: "/admin/control-plane/audit-log" },
];

export function ControlPlaneOverviewPage() {
  const { denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Control plane"
        description="Deep control-plane screens remain in legacy until their APIs are wired into focused SPA routes."
      />
      <AdminPanel>
        <p className="text-sm text-gray-600">
          Quick SPA link:{" "}
          <Link to="/settings/feature-flags" className="font-medium text-gray-900 underline">
            Feature flags (read-only list)
          </Link>
        </p>
      </AdminPanel>
      <div className="grid gap-4 md:grid-cols-2">
        {LINKS.map((l) => (
          <AdminPanel key={l.title}>
            <h2 className="text-lg font-semibold text-gray-900">{l.title}</h2>
            {l.note ? <p className="mt-1 text-xs text-gray-500">{l.note}</p> : null}
            {l.legacy ? (
              <a
                href={legacyAdminHref(l.legacy)}
                className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
              >
                Open in legacy →
              </a>
            ) : null}
          </AdminPanel>
        ))}
      </div>
    </div>
  );
}
