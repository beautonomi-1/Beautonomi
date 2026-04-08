import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bot,
  Eye,
  FileText,
  Flag,
  Gauge,
  Globe2,
  Layers,
  Link2,
  MapPin,
  Network,
  Puzzle,
  Route,
  Scale,
  ScrollText,
  Shield,
  ShieldAlert,
  Sparkles,
  ToggleLeft,
  Wrench,
} from "lucide-react";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { adminSpaTo } from "@/lib/adminSpaPath";

type CpLink = { title: string; to: string; description?: string; icon: LucideIcon };

const GROUPS: { label: string; description: string; items: CpLink[] }[] = [
  {
    label: "Flags & discovery",
    description: "Experiments and tenant-visible toggles",
    items: [
      {
        title: "Control plane feature flags",
        to: "/admin/control-plane/feature-flags",
        description: "Preview + resolver",
        icon: Sparkles,
      },
      {
        title: "Settings feature flags",
        to: "/admin/settings/feature-flags",
        description: "Tenant flag list",
        icon: ToggleLeft,
      },
    ],
  },
  {
    label: "Integrations",
    description: "Third-party credentials and SDK hooks",
    items: [
      { title: "Integrations hub", to: "/admin/control-plane/integrations", icon: Puzzle },
      { title: "Sumsub", to: "/admin/control-plane/integrations/sumsub", icon: Shield },
      { title: "Gemini", to: "/admin/control-plane/integrations/gemini", icon: Bot },
      { title: "Aura", to: "/admin/control-plane/integrations/aura", icon: Activity },
    ],
  },
  {
    label: "Modules",
    description: "Runtime tuning for marketplace behaviour",
    items: [
      { title: "Distance", to: "/admin/control-plane/modules/distance", icon: MapPin },
      { title: "On-demand", to: "/admin/control-plane/modules/on-demand", icon: Route },
      { title: "Safety", to: "/admin/control-plane/modules/safety", icon: Shield },
      { title: "Ranking", to: "/admin/control-plane/modules/ranking", icon: Gauge },
      { title: "Ranking scores", to: "/admin/control-plane/modules/ranking/scores", icon: Scale },
      { title: "AI module", to: "/admin/control-plane/modules/ai", icon: Bot },
      { title: "AI usage", to: "/admin/control-plane/modules/ai/usage", icon: Activity },
      { title: "AI entitlements", to: "/admin/control-plane/modules/ai/entitlements", icon: Flag },
      { title: "AI templates", to: "/admin/control-plane/modules/ai/templates", icon: Layers },
      { title: "Ads", to: "/admin/control-plane/modules/ads", icon: Sparkles },
    ],
  },
  {
    label: "Operations & audit",
    description: "Safety data, maintenance, and configuration history",
    items: [
      { title: "Safety logs", to: "/admin/control-plane/safety-logs", icon: ScrollText },
      { title: "Maintenance", to: "/admin/control-plane/maintenance", icon: Wrench },
      { title: "Sign-ups notify", to: "/admin/control-plane/maintenance/sign-ups", icon: Link2 },
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

export function ControlPlaneOverviewPage() {
  const { denied } = useSuperadminPage("Control plane overview is superadmin-only (matches child routes and nav).");

  if (denied) return denied;

  return (
    <div className="space-y-10">
      <div className="relative overflow-hidden rounded-3xl border border-gray-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 px-6 py-8 text-white shadow-xl ring-1 ring-white/10 sm:px-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-teal-500/15 blur-3xl" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Platform</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Control plane</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/75">
          Deep configuration for superadmins and platform operators. Everything here runs in the SPA against{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/90">/api/admin/*</code> with your
          current tenant scope.
        </p>
      </div>

      {GROUPS.map((group) => (
        <section key={group.label}>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{group.label}</h2>
            <p className="text-sm text-gray-500">{group.description}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((l) => (
              <Link
                key={l.to}
                to={adminSpaTo(l.to)}
                className="group flex gap-4 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-sm ring-1 ring-gray-950/[0.04] transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
              >
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gray-900 text-white shadow-inner ring-1 ring-white/10">
                  <l.icon className="h-6 w-6" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 group-hover:text-primary">{l.title}</h3>
                  {l.description ? <p className="mt-1 text-xs text-gray-500">{l.description}</p> : null}
                  <span className="mt-3 inline-flex items-center text-sm font-medium text-primary opacity-90 group-hover:opacity-100">
                    Open
                    <span className="ml-1 transition group-hover:translate-x-0.5">→</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
