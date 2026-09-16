import {
  BarChart3,
  Bell,
  CreditCard,
  Globe,
  Mail,
  Map,
  MessageSquare,
  Phone,
  Plug,
  Radio,
  Share2,
  Shield,
  Smartphone,
  Terminal,
  Truck,
} from "lucide-react";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminSectionQueueHub } from "@/components/admin/AdminSectionQueueHub";
import { adminSpaTo } from "@/lib/adminSpaPath";

export function IntegrationsHubPage() {
  useAdminDocumentTitle("Integrations");
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
      toolCards={[
        {
          to: adminSpaTo("/admin/integrations/paystack"),
          label: "Paystack",
          description: "Card payments and transfers.",
          icon: CreditCard,
          accent: "from-emerald-600 to-teal-800",
        },
        {
          to: adminSpaTo("/admin/integrations/resend"),
          label: "Resend",
          description: "Transactional email delivery.",
          icon: Mail,
          accent: "from-sky-600 to-blue-800",
        },
        {
          to: adminSpaTo("/admin/integrations/slack"),
          label: "Slack",
          description: "Workspace alerts for ops teams.",
          icon: Radio,
          accent: "from-violet-600 to-purple-800",
        },
        {
          to: adminSpaTo("/admin/integrations/amplitude"),
          label: "Amplitude",
          description: "Product analytics configuration.",
          icon: BarChart3,
          accent: "from-indigo-600 to-violet-800",
        },
        {
          to: adminSpaTo("/admin/mapbox"),
          label: "Mapbox",
          description: "Maps access token and styles.",
          icon: Map,
          accent: "from-cyan-600 to-blue-700",
        },
        {
          to: adminSpaTo("/admin/integrations/onesignal"),
          label: "OneSignal",
          description: "Push notification provider.",
          icon: Bell,
          accent: "from-amber-600 to-orange-800",
        },
        {
          to: adminSpaTo("/admin/integrations/calls"),
          label: "Calls (Voice)",
          description: "Twilio dialer and Salestrail tracking.",
          icon: Phone,
          accent: "from-pink-600 to-rose-800",
        },
        {
          to: adminSpaTo("/admin/integrations/yoco"),
          label: "Yoco Web POS",
          description: "OAuth Web POS integration.",
          icon: Smartphone,
          accent: "from-teal-600 to-emerald-800",
        },
        {
          to: adminSpaTo("/admin/integrations/paycloud"),
          label: "PayCloud",
          description: "Card machine fleet configuration.",
          icon: Terminal,
          accent: "from-gray-700 to-gray-900",
        },
        {
          to: adminSpaTo("/admin/integrations/shipping"),
          label: "Courier shipping",
          description: "Third-party shipping connectors.",
          icon: Truck,
          accent: "from-orange-600 to-red-800",
        },
        {
          to: adminSpaTo("/admin/integrations/singular"),
          label: "Singular",
          description: "Attribution and deep linking.",
          icon: Share2,
          accent: "from-fuchsia-600 to-purple-800",
        },
        {
          to: adminSpaTo("/admin/webhooks"),
          label: "Webhooks",
          description: "Manage outbound webhook endpoints.",
          icon: Plug,
          accent: "from-slate-600 to-gray-800",
        },
        {
          to: adminSpaTo("/admin/api-keys"),
          label: "API keys",
          description: "Issue and rotate API credentials.",
          icon: Shield,
          accent: "from-blue-600 to-indigo-800",
        },
        {
          to: adminSpaTo("/admin/iso-codes"),
          label: "ISO codes",
          description: "Country and currency reference data.",
          icon: Globe,
          accent: "from-lime-600 to-green-800",
        },
        {
          to: adminSpaTo("/admin/whatsapp/sessions"),
          label: "WhatsApp sessions",
          description: "Session templates and messaging.",
          icon: MessageSquare,
          accent: "from-green-600 to-emerald-800",
        },
      ]}
    />
  );
}
