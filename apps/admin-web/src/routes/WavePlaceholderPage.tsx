import { useLocation } from "react-router-dom";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

export function WavePlaceholderPage() {
  const location = useLocation();
  const legacyPath = `/admin${location.pathname}`.replace(/\/+/g, "/");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="No SPA route"
        description="This URL is not registered in the admin SPA router. It may be a typo, a bookmark to a removed path, or a legacy-only screen."
      />
      <AdminPanel>
        <p className="text-sm text-gray-600">
          Path: <code className="rounded bg-gray-100 px-1">{location.pathname}</code>
        </p>
        <a
          href={legacyAdminHref(legacyPath)}
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          Try legacy admin (if this path still exists there) →
        </a>
      </AdminPanel>
    </div>
  );
}
