import { Gift, Mail, Megaphone, MessageSquare, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { AdminSectionQueueHub } from "@/components/admin/AdminSectionQueueHub";
import { adminSpaTo } from "@/lib/adminSpaPath";

export function MarketingOpsHubPage() {
  useAdminDocumentTitle("Marketing");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_MARKETING_COMMS,
    "Marketing access is required.",
  );

  const countsQ = useQuery({
    queryKey: adminQueryKeys.navCounts(),
    queryFn: () => adminApi.getJson<Record<string, number>>("/api/admin/nav-counts", { timeoutMs: 30_000 }),
    enabled: allowed,
    refetchInterval: 60_000,
  });

  if (denied) return denied;
  if (countsQ.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }
  if (countsQ.error) {
    if (isAdminApiAuthFailure(countsQ.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={countsQ.error.message} onRetry={() => void countsQ.refetch()} />;
  }

  const counts = countsQ.data ?? {};
  const openPromotions = counts["/admin/promotions"] ?? 0;
  const pendingWaitlist = counts["/admin/marketing/market-waitlist"] ?? 0;

  return (
    <AdminSectionQueueHub
      title="Marketing Ops"
      description="Campaigns, broadcasts, templates, and growth tooling."
      metrics={[
        {
          label: "Active promotions",
          value: openPromotions,
          href: "/admin/promotions",
        },
        {
          label: "Market waitlist (pending)",
          value: pendingWaitlist,
          href: "/admin/marketing/market-waitlist",
        },
      ]}
      quickLinks={[
        {
          id: "broadcasts",
          label: "Broadcasts",
          description: "Compose and review outbound campaigns.",
          href: "/admin/broadcast",
          variant: "urgent",
        },
        {
          id: "templates",
          label: "Templates",
          description: "Email, SMS, and notification templates.",
          href: "/admin/notification-templates",
          variant: "mine",
        },
        {
          id: "promotions",
          label: "Promotions",
          description: "Discount codes and promotional offers.",
          href: "/admin/promotions?status=active",
          count: openPromotions,
          variant: "unassigned",
        },
      ]}
      toolCards={[
        {
          to: adminSpaTo("/admin/broadcast"),
          label: "Broadcast",
          description: "Multi-channel broadcast hub with compose and history.",
          icon: MessageSquare,
          accent: "from-violet-600 to-purple-800",
        },
        {
          to: adminSpaTo("/admin/promotions"),
          label: "Promotions",
          description: "Create and manage promotional offers.",
          icon: Gift,
          accent: "from-pink-600 to-rose-800",
        },
        {
          to: adminSpaTo("/admin/notification-templates"),
          label: "Notification templates",
          description: "Push and in-app notification copy.",
          icon: Megaphone,
          accent: "from-sky-600 to-blue-800",
        },
        {
          to: adminSpaTo("/admin/email-templates"),
          label: "Email templates",
          description: "Transactional and marketing email layouts.",
          icon: Mail,
          accent: "from-emerald-600 to-teal-800",
        },
        {
          to: adminSpaTo("/admin/automations"),
          label: "Automations",
          description: "Lifecycle and trigger-based messaging flows.",
          icon: Zap,
          accent: "from-amber-600 to-orange-800",
        },
        {
          to: adminSpaTo("/admin/ads"),
          label: "Ads & campaigns",
          description: "In-app advertising and campaign management.",
          icon: Megaphone,
          accent: "from-indigo-600 to-violet-800",
        },
      ]}
    />
  );
}
