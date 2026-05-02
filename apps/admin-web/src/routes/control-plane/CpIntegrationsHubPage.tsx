import { Link } from "react-router-dom";
import {
  BarChart3,
  Map,
  Settings,
  Sparkles,
  Shield,
  UserCheck,
  MessageCircle,
  Radio,
} from "lucide-react";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { CpBack } from "./cpShared";

const cards: { title: string; description: string; to: string; icon: typeof BarChart3 }[] = [
  {
    title: "Amplitude",
    description: "Product analytics API configuration",
    to: adminSpaTo("/admin/integrations/amplitude"),
    icon: BarChart3,
  },
  {
    title: "Slack",
    description: "Workspace alerts for Support & Provider Ops",
    to: adminSpaTo("/admin/integrations/slack"),
    icon: Radio,
  },
  {
    title: "Mapbox",
    description: "Maps access token and style presets",
    to: adminSpaTo("/admin/mapbox"),
    icon: Map,
  },
  {
    title: "Platform settings",
    description: "General tenant settings and comms channels",
    to: adminSpaTo("/admin/settings"),
    icon: Settings,
  },
  {
    title: "Gemini AI",
    description: "API key, models, safety",
    to: adminSpaTo("/admin/control-plane/integrations/gemini"),
    icon: Sparkles,
  },
  {
    title: "Sumsub",
    description: "KYC verification",
    to: adminSpaTo("/admin/control-plane/integrations/sumsub"),
    icon: Shield,
  },
  {
    title: "Aura",
    description: "Identity and trust",
    to: adminSpaTo("/admin/control-plane/integrations/aura"),
    icon: UserCheck,
  },
  {
    title: "WhatsApp (Wasender)",
    description: "WhatsApp messaging for lead outreach",
    to: adminSpaTo("/admin/control-plane/integrations/wasender"),
    icon: MessageCircle,
  },
];

export function CpIntegrationsHubPage() {
  const { denied } = useSuperadminPage("Control plane is superadmin-only.");
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader
        title="Integrations"
        description="Manage integration keys and toggles. Secrets are not shown after save."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.title} to={c.to}>
            <AdminPanel className="h-full transition-colors hover:border-gray-300">
              <div className="flex items-start gap-3">
                <c.icon className="h-5 w-5 shrink-0 text-gray-600" />
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{c.title}</h2>
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
