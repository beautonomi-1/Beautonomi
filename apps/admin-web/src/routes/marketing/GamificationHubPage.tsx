import { Link } from "react-router";
import { Coins, Medal, RotateCcw } from "lucide-react";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { adminSpaTo } from "@/lib/adminSpaPath";

const SECTIONS = [
  {
    to: "/admin/gamification/point-rules",
    icon: Coins,
    title: "Point Rules",
    description:
      "Define how providers earn points — configure actions, multipliers, and display order. Changes take effect immediately for future events.",
    cta: "Manage rules →",
    colorClass:
      "border-violet-200/80 bg-violet-50 ring-violet-950/[0.04] hover:border-violet-300",
    iconClass: "bg-violet-100 text-violet-700 ring-violet-200",
    ctaClass: "text-violet-900",
  },
  {
    to: "/admin/gamification/badges",
    icon: Medal,
    title: "Provider Badges",
    description:
      "Create and manage achievement badges awarded to providers. Configure thresholds, artwork, and active state.",
    cta: "Manage badges →",
    colorClass:
      "border-amber-200/80 bg-amber-50 ring-amber-950/[0.04] hover:border-amber-300",
    iconClass: "bg-amber-100 text-amber-700 ring-amber-200",
    ctaClass: "text-amber-900",
  },
  {
    to: "/admin/gamification/operations",
    icon: RotateCcw,
    title: "Gamification Ops",
    description:
      "Run bulk backfills and per-provider recalculations. Use after rule changes or data corrections to re-score existing records.",
    cta: "Open ops →",
    colorClass:
      "border-gray-200/90 bg-white ring-gray-950/[0.04] hover:border-gray-300",
    iconClass: "bg-gray-100 text-gray-700 ring-gray-200",
    ctaClass: "text-gray-900",
  },
] as const;

export function GamificationHubPage() {
  const { denied } = useAdminSectionPage(
    ADMIN_SECTION_MARKETING_COMMS,
    "Marketing access is required.",
  );
  useAdminDocumentTitle("Gamification");

  if (denied) return denied;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Gamification"
        description="Configure the points and badge system that rewards provider performance and drives engagement."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {SECTIONS.map(({ to, icon: Icon, title, description, cta, colorClass, iconClass, ctaClass }) => (
          <Link
            key={to}
            to={adminSpaTo(to)}
            className={`group flex flex-col justify-between rounded-2xl border p-6 shadow-sm ring-1 transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${colorClass}`}
          >
            <div>
              <div
                className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ring-1 ${iconClass}`}
              >
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-gray-900">
                {title}
              </h2>
              <p className="mt-2 text-sm text-gray-600">{description}</p>
            </div>
            <span
              className={`mt-6 inline-flex min-h-11 items-center text-sm font-semibold group-hover:underline ${ctaClass}`}
            >
              {cta}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
