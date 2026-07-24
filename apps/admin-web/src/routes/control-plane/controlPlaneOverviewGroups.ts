import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  Gauge,
  Link2,
  MapPin,
  Network,
  Puzzle,
  Route,
  ScrollText,
  Shield,
  ShieldAlert,
  Sparkles,
  ToggleLeft,
  Wrench,
} from "lucide-react";

export type CpLink = { title: string; to: string; description?: string; icon: LucideIcon };

/** Overview IA for Platform Advanced — single source of truth for cards + regression tests. */
export const CONTROL_PLANE_OVERVIEW_GROUPS: {
  label: string;
  description: string;
  items: CpLink[];
}[] = [
  {
    label: "Feature flags",
    description: "Manage tenant-visible toggles and preview resolution",
    items: [
      {
        title: "Manage flags",
        to: "/admin/settings/feature-flags",
        description: "Create and toggle tenant-visible flags",
        icon: ToggleLeft,
      },
      {
        title: "Preview & resolve",
        to: "/admin/control-plane/feature-flags",
        description: "Simulate which flags resolve for a user / role / env",
        icon: Sparkles,
      },
    ],
  },
  {
    label: "Identity & trust",
    description: "Third-party credentials for verification and safety",
    items: [
      { title: "Integrations hub", to: "/admin/control-plane/integrations", icon: Puzzle },
      {
        title: "Didit",
        to: "/admin/control-plane/integrations/didit",
        description: "Identity / KYC",
        icon: Shield,
      },
      {
        title: "Aura",
        to: "/admin/control-plane/integrations/aura",
        description: "Trust & safety signals",
        icon: Activity,
      },
    ],
  },
  {
    label: "Marketplace modules",
    description: "Runtime tuning for marketplace behaviour",
    items: [
      { title: "Distance", to: "/admin/control-plane/modules/distance", icon: MapPin },
      { title: "On-demand", to: "/admin/control-plane/modules/on-demand", icon: Route },
      { title: "Safety", to: "/admin/control-plane/modules/safety", icon: Shield },
      {
        title: "Ranking",
        to: "/admin/control-plane/modules/ranking",
        description: "Weights + score inspector",
        icon: Gauge,
      },
      { title: "Ads", to: "/admin/control-plane/modules/ads", icon: Sparkles },
    ],
  },
  {
    label: "AI & agents",
    description: "Provider assistant, credentials, and autonomous admin agents",
    items: [
      {
        title: "Provider AI",
        to: "/admin/control-plane/modules/ai",
        description: "Budgets, limits, templates, usage, plan entitlements",
        icon: Bot,
      },
      {
        title: "Gemini credentials",
        to: "/admin/control-plane/integrations/gemini",
        description: "API key, models, safety",
        icon: Sparkles,
      },
      {
        title: "Agentic console",
        to: "/admin/control-plane/modules/agents",
        description: "Autonomous admin agents, approvals, kill switches",
        icon: Network,
      },
    ],
  },
  {
    label: "Operations & audit",
    description: "Safety data, maintenance, and configuration history",
    items: [
      { title: "Safety logs", to: "/admin/control-plane/safety-logs", icon: ScrollText },
      { title: "Maintenance", to: "/admin/control-plane/maintenance", icon: Wrench },
      {
        title: "Sign-up notifications",
        to: "/admin/control-plane/maintenance/sign-ups",
        description: "New sign-up alert routing",
        icon: Link2,
      },
      { title: "Config change log", to: "/admin/control-plane/audit-log", icon: ScrollText },
      {
        title: "Compliance purge",
        to: "/admin/control-plane/compliance",
        description: "User / provider erasure + audit trail",
        icon: ShieldAlert,
      },
    ],
  },
];
