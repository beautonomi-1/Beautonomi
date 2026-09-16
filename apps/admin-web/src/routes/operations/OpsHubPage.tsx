import { Activity, Clock, GitMerge, Globe2, Radio, Shield } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminSectionQueueHub } from "@/components/admin/AdminSectionQueueHub";
import { adminSpaTo } from "@/lib/adminSpaPath";

export function OpsHubPage() {
  useAdminDocumentTitle("Operations");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_OPERATIONS,
    "Operations access is required.",
  );

  const healthQ = useQuery({
    queryKey: [...adminQueryKeys.root, "ops-hub-health"] as const,
    queryFn: () =>
      adminApi.getJson<{ status?: string; failing_checks?: number }>(
        "/api/admin/system-health",
        { timeoutMs: 30_000 },
      ),
    enabled: allowed,
    refetchInterval: 60_000,
    retry: false,
  });

  if (denied) return denied;
  if (healthQ.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }

  const failingChecks = healthQ.data?.failing_checks ?? 0;
  const healthStatus = healthQ.data?.status ?? "unknown";

  return (
    <AdminSectionQueueHub
      title="Platform Operations"
      description="System health, service zones, security, and background job visibility."
      metrics={[
        {
          label: "Platform health",
          value: healthStatus.replace(/_/g, " "),
          urgent: failingChecks > 0,
          href: "/admin/system-health",
        },
        {
          label: "Failing checks",
          value: failingChecks,
          urgent: failingChecks > 0,
          href: "/admin/system-health",
        },
      ]}
      quickLinks={[
        {
          id: "health",
          label: "System health",
          description: "Live dependency and cron status.",
          href: "/admin/system-health",
          count: failingChecks,
          variant: failingChecks > 0 ? "urgent" : "default",
        },
        {
          id: "zones",
          label: "Service zones",
          description: "Market coverage and geo boundaries.",
          href: "/admin/service-zones",
          variant: "mine",
        },
        {
          id: "security",
          label: "Security policy",
          description: "Auth, MFA, and access controls.",
          href: "/admin/security",
          variant: "unassigned",
        },
      ]}
      queueLinks={[
        {
          title: "Cron runs",
          description: "Scheduled job execution history.",
          href: "/admin/cron-runs",
        },
        {
          title: "Workflow runs",
          description: "Automation workflow execution logs.",
          href: "/admin/workflow-runs",
        },
        {
          title: "Inbound webhooks",
          description: "Third-party webhook delivery logs.",
          href: "/admin/webhooks/inbound",
        },
      ]}
      toolCards={[
        {
          to: adminSpaTo("/admin/system-health"),
          label: "Platform health",
          description: "Dependency checks, queues, and incident signals.",
          icon: Activity,
          accent: "from-emerald-600 to-teal-800",
        },
        {
          to: adminSpaTo("/admin/service-zones"),
          label: "Service zones",
          description: "Market coverage maps and zone configuration.",
          icon: Globe2,
          accent: "from-sky-600 to-blue-800",
        },
        {
          to: adminSpaTo("/admin/security"),
          label: "Security policy",
          description: "Password rules, MFA, and session policy.",
          icon: Shield,
          accent: "from-red-600 to-rose-800",
        },
        {
          to: adminSpaTo("/admin/cron-runs"),
          label: "Cron runs",
          description: "Background scheduler execution history.",
          icon: Clock,
          accent: "from-amber-600 to-orange-800",
        },
        {
          to: adminSpaTo("/admin/workflow-runs"),
          label: "Workflow runs",
          description: "Automation pipeline run logs.",
          icon: GitMerge,
          accent: "from-violet-600 to-purple-800",
        },
        {
          to: adminSpaTo("/admin/webhooks/inbound"),
          label: "Inbound webhooks",
          description: "Delivery logs for external webhook events.",
          icon: Radio,
          accent: "from-indigo-600 to-blue-800",
        },
      ]}
    />
  );
}
