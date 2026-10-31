import { Link } from "react-router";
import { LayoutGrid } from "lucide-react";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { CpBack } from "./cpShared";
import { platformIntegrationCatalogEntries } from "@/routes/integrations/integrationCatalog";

export function CpIntegrationsHubPage() {
  const { denied } = useSuperadminPage("Control plane is superadmin-only.");
  if (denied) return denied;

  const platformCards = platformIntegrationCatalogEntries();
  const allConnectorsHref = adminSpaTo("/admin/integrations-hub");

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader
        title="Platform integrations"
        description="Identity, AI, payments routing, and launch tooling. Connector credentials live on the integrations catalog."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Link to={allConnectorsHref}>
          <AdminPanel className="h-full transition-colors hover:border-gray-300">
            <div className="flex items-start gap-3">
              <LayoutGrid className="h-5 w-5 shrink-0 text-gray-600" />
              <div>
                <h2 className="text-base font-semibold text-gray-900">All connectors</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Payment, messaging, analytics, webhooks, and shipping connectors.
                </p>
                <span className="mt-2 inline-block text-sm font-medium text-primary">Open catalog →</span>
              </div>
            </div>
          </AdminPanel>
        </Link>
        {platformCards.map((c) => (
          <Link key={c.href} to={adminSpaTo(c.href)}>
            <AdminPanel className="h-full transition-colors hover:border-gray-300">
              <div className="flex items-start gap-3">
                <c.icon className="h-5 w-5 shrink-0 text-gray-600" />
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{c.label}</h2>
                  <p className="mt-1 text-sm text-gray-600">{c.description}</p>
                  <span className="mt-2 inline-block text-sm font-medium text-primary">Configure →</span>
                </div>
              </div>
            </AdminPanel>
          </Link>
        ))}
      </div>
    </div>
  );
}
