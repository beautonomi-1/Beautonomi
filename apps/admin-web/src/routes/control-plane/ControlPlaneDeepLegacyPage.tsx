import { useLocation } from "react-router-dom";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

const TITLES: Record<string, string> = {
  "feature-flags": "Feature flags (preview)",
  integrations: "Integrations hub",
  "integrations/sumsub": "Sumsub",
  "integrations/gemini": "Gemini",
  "integrations/aura": "Aura",
  "modules/ads": "Ads module",
  "modules/on-demand": "On-demand",
  "modules/ai": "AI module",
  "modules/ai/templates": "AI templates",
  "modules/ai/entitlements": "AI entitlements",
  "modules/ai/usage": "AI usage",
  ranking: "Ranking",
  "modules/ranking": "Ranking",
  "modules/ranking/scores": "Ranking scores",
  "modules/distance": "Distance module",
  "modules/safety": "Safety module",
  "safety-logs": "Safety logs",
  maintenance: "Maintenance",
  "maintenance/sign-ups": "Sign-ups notify",
  "audit-log": "Config audit log",
};

export function ControlPlaneDeepLegacyPage() {
  const { denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );
  const location = useLocation();
  const pathname = (location.pathname || "/").startsWith("/")
    ? location.pathname
    : `/${location.pathname}`;
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  const suffixMatch = trimmed.match(/^\/control-plane\/(.+)$/);
  const suffix = suffixMatch?.[1] ?? "";
  const title = TITLES[suffix] ?? `Control plane · ${suffix || "tool"}`;
  const legacyPath = `/admin${location.pathname}`.replace(/\/+/g, "/");

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={title}
        description="This control-plane screen is still authored in legacy Next.js. Open legacy for full workflows."
      />
      <AdminPanel>
        <p className="text-sm text-gray-600">
          Path: <code className="rounded bg-gray-100 px-1">{location.pathname}</code>
        </p>
        <a href={legacyAdminHref(legacyPath)} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Open in legacy admin →
        </a>
      </AdminPanel>
    </div>
  );
}
