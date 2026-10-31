import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  CreditCard,
  Globe,
  Mail,
  Map,
  MessageCircle,
  MessageSquare,
  Phone,
  Plug,
  Radio,
  Rocket,
  Share2,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Truck,
  UserCheck,
} from "lucide-react";
import { adminSpaTo } from "@/lib/adminSpaPath";
import type { QueueHubToolCard } from "@/components/admin/AdminSectionQueueHub";

export type IntegrationCatalogGroup = "connectors" | "status" | "platform";

export type IntegrationCatalogEntry = {
  /** Absolute admin href, e.g. `/admin/integrations/resend` */
  href: string;
  label: string;
  description: string;
  group: IntegrationCatalogGroup;
  superadminOnly: boolean;
  icon: LucideIcon;
  accent: string;
};

const GROUP_HEADING: Record<IntegrationCatalogGroup, string> = {
  connectors: "Connectors",
  status: "Status & health",
  platform: "Platform",
};

/** Single source of truth for integration hub cards and control-plane platform index. */
export const INTEGRATION_CATALOG: IntegrationCatalogEntry[] = [
  {
    href: "/admin/integrations/resend",
    label: "Resend",
    description: "Transactional email delivery.",
    group: "connectors",
    superadminOnly: false,
    icon: Mail,
    accent: "from-sky-600 to-blue-800",
  },
  {
    href: "/admin/integrations/zoho-mail",
    label: "Zoho Mail",
    description: "Support inbox sync and desk replies.",
    group: "connectors",
    superadminOnly: false,
    icon: Mail,
    accent: "from-teal-600 to-cyan-800",
  },
  {
    href: "/admin/integrations/slack",
    label: "Slack",
    description: "Workspace alerts for ops teams.",
    group: "connectors",
    superadminOnly: false,
    icon: Radio,
    accent: "from-violet-600 to-purple-800",
  },
  {
    href: "/admin/integrations/amplitude",
    label: "Amplitude",
    description: "Product analytics configuration.",
    group: "connectors",
    superadminOnly: false,
    icon: BarChart3,
    accent: "from-indigo-600 to-violet-800",
  },
  {
    href: "/admin/mapbox",
    label: "Mapbox",
    description: "Maps access token and styles.",
    group: "connectors",
    superadminOnly: false,
    icon: Map,
    accent: "from-cyan-600 to-blue-700",
  },
  {
    href: "/admin/webhooks",
    label: "Webhooks",
    description: "Manage outbound webhook endpoints.",
    group: "connectors",
    superadminOnly: false,
    icon: Plug,
    accent: "from-slate-600 to-gray-800",
  },
  {
    href: "/admin/api-keys",
    label: "API keys",
    description: "Issue and rotate API credentials.",
    group: "connectors",
    superadminOnly: false,
    icon: Shield,
    accent: "from-blue-600 to-indigo-800",
  },
  {
    href: "/admin/iso-codes",
    label: "ISO codes",
    description: "Country and currency reference data.",
    group: "connectors",
    superadminOnly: false,
    icon: Globe,
    accent: "from-lime-600 to-green-800",
  },
  {
    href: "/admin/whatsapp/sessions",
    label: "WhatsApp sessions",
    description: "Connect numbers and message leads.",
    group: "connectors",
    superadminOnly: false,
    icon: MessageSquare,
    accent: "from-green-600 to-emerald-800",
  },
  {
    href: "/admin/integrations/paystack",
    label: "Paystack",
    description: "Card payments and transfers.",
    group: "connectors",
    superadminOnly: true,
    icon: CreditCard,
    accent: "from-emerald-600 to-teal-800",
  },
  {
    href: "/admin/integrations/calls",
    label: "Calls (Voice)",
    description: "Twilio dialer and Salestrail tracking.",
    group: "connectors",
    superadminOnly: true,
    icon: Phone,
    accent: "from-pink-600 to-rose-800",
  },
  {
    href: "/admin/integrations/yoco",
    label: "Yoco Web POS",
    description: "OAuth Web POS integration.",
    group: "connectors",
    superadminOnly: true,
    icon: Smartphone,
    accent: "from-teal-600 to-emerald-800",
  },
  {
    href: "/admin/integrations/rendobar",
    label: "Rendobar",
    description: "Explore video transcode and poster jobs.",
    group: "connectors",
    superadminOnly: true,
    icon: Radio,
    accent: "from-violet-600 to-indigo-800",
  },
  {
    href: "/admin/integrations/paycloud",
    label: "PayCloud",
    description: "Card machine fleet configuration.",
    group: "connectors",
    superadminOnly: true,
    icon: Terminal,
    accent: "from-gray-700 to-gray-900",
  },
  {
    href: "/admin/integrations/shipping",
    label: "Courier shipping",
    description: "Third-party shipping connectors.",
    group: "connectors",
    superadminOnly: true,
    icon: Truck,
    accent: "from-orange-600 to-red-800",
  },
  {
    href: "/admin/integrations/paycloud-operations",
    label: "PayCloud Operations",
    description: "Payment exceptions, terminals, and reconcile.",
    group: "connectors",
    superadminOnly: true,
    icon: Terminal,
    accent: "from-gray-600 to-slate-800",
  },
  {
    href: "/admin/integrations/apple",
    label: "Apple App Store Connect",
    description: "IAP credentials and App Store API.",
    group: "connectors",
    superadminOnly: true,
    icon: Smartphone,
    accent: "from-slate-700 to-gray-900",
  },
  {
    href: "/admin/control-plane/integrations/wasender",
    label: "WhatsApp (Wasender)",
    description: "Wasender API token and send limits.",
    group: "connectors",
    superadminOnly: true,
    icon: MessageCircle,
    accent: "from-green-700 to-emerald-900",
  },
  {
    href: "/admin/control-plane/integrations/stripe",
    label: "Stripe",
    description: "Deployment health probe; live keys on Region online gateway.",
    group: "status",
    superadminOnly: true,
    icon: CreditCard,
    accent: "from-indigo-600 to-violet-800",
  },
  {
    href: "/admin/integrations/flutterwave",
    label: "Flutterwave",
    description: "Webhook health; verif-hash and secret on Region online gateway.",
    group: "status",
    superadminOnly: true,
    icon: CreditCard,
    accent: "from-orange-600 to-amber-800",
  },
  {
    href: "/admin/integrations/onesignal",
    label: "OneSignal",
    description: "Push status only; edit keys under Notifications.",
    group: "status",
    superadminOnly: true,
    icon: Bell,
    accent: "from-amber-600 to-orange-800",
  },
  {
    href: "/admin/integrations/singular",
    label: "Singular",
    description: "Mobile SDK notes; credentials are not saved here.",
    group: "status",
    superadminOnly: true,
    icon: Share2,
    accent: "from-fuchsia-600 to-purple-800",
  },
  {
    href: "/admin/control-plane/integrations/ai",
    label: "AI Platform",
    description: "Vercel Gateway, workforce, budgets, emergency.",
    group: "platform",
    superadminOnly: true,
    icon: Sparkles,
    accent: "from-violet-600 to-purple-800",
  },
  {
    href: "/admin/control-plane/integrations/didit",
    label: "Didit",
    description: "Identity verification (KYC).",
    group: "platform",
    superadminOnly: true,
    icon: ShieldCheck,
    accent: "from-blue-600 to-indigo-800",
  },
  {
    href: "/admin/control-plane/integrations/aura",
    label: "Aura",
    description: "Trust & safety escalation (panic dispatch).",
    group: "platform",
    superadminOnly: true,
    icon: UserCheck,
    accent: "from-emerald-600 to-teal-800",
  },
  {
    href: "/admin/control-plane/region-online-gateway",
    label: "Region online gateway",
    description: "Paystack, Stripe, or Flutterwave checkout per region.",
    group: "platform",
    superadminOnly: true,
    icon: CreditCard,
    accent: "from-indigo-600 to-violet-800",
  },
  {
    href: "/admin/control-plane/country-launch-checklist",
    label: "Country launch checklist",
    description: "Pre-launch readiness validation per tenant/region.",
    group: "platform",
    superadminOnly: true,
    icon: Rocket,
    accent: "from-orange-600 to-amber-800",
  },
];

function entryToToolCard(entry: IntegrationCatalogEntry): QueueHubToolCard {
  return {
    to: adminSpaTo(entry.href),
    label: entry.label,
    description: entry.description,
    icon: entry.icon,
    accent: entry.accent,
  };
}

export function filterCatalogEntries(isSuperadmin: boolean): IntegrationCatalogEntry[] {
  return INTEGRATION_CATALOG.filter((e) => !e.superadminOnly || isSuperadmin);
}

export function integrationHubCardGroups(isSuperadmin: boolean): { heading: string; cards: QueueHubToolCard[] }[] {
  const visible = filterCatalogEntries(isSuperadmin);
  const groups: IntegrationCatalogGroup[] = ["connectors", "status", "platform"];
  return groups
    .map((group) => {
      const cards = visible.filter((e) => e.group === group).map(entryToToolCard);
      if (cards.length === 0) return null;
      return { heading: GROUP_HEADING[group], cards };
    })
    .filter((g): g is { heading: string; cards: QueueHubToolCard[] } => g != null);
}

export function platformIntegrationCatalogEntries(): IntegrationCatalogEntry[] {
  return INTEGRATION_CATALOG.filter((e) => e.group === "platform");
}

/** Hrefs shown on the control-plane platform index plus the connector catalog link. */
export function controlPlaneIntegrationsHubHrefs(): string[] {
  return [...platformIntegrationCatalogEntries().map((e) => e.href), "/admin/integrations-hub"];
}

export function catalogHrefSet(): Set<string> {
  return new Set(INTEGRATION_CATALOG.map((e) => e.href));
}
