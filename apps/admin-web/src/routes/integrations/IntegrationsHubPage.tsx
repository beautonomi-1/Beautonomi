import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminSectionQueueHub } from "@/components/admin/AdminSectionQueueHub";
import { integrationHubCardGroups } from "@/routes/integrations/integrationCatalog";

export function IntegrationsHubPage() {
  useAdminDocumentTitle("Integrations");
  const { bootstrap } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin === true;
  const { denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations access is required.",
  );
  if (denied) return denied;

  return (
    <AdminSectionQueueHub
      title="Integrations"
      description="Payment, messaging, analytics, and platform connectors."
      quickLinks={[
        {
          id: "webhooks",
          label: "Webhook endpoints",
          description: "Outbound webhook subscriptions.",
          href: "/admin/webhooks",
          variant: "urgent",
        },
        {
          id: "api-keys",
          label: "API keys",
          description: "Tenant API credentials.",
          href: "/admin/api-keys",
          variant: "mine",
        },
        {
          id: "inbound",
          label: "Inbound webhooks",
          description: "Delivery logs for inbound events.",
          href: "/admin/webhooks/inbound",
          variant: "unassigned",
        },
      ]}
      cardGroups={integrationHubCardGroups(isSuperadmin)}
    />
  );
}
