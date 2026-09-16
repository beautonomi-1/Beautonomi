import { Network, Settings, Shield, Smartphone, ToggleLeft, UserCheck } from "lucide-react";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminSectionQueueHub } from "@/components/admin/AdminSectionQueueHub";
import { adminSpaTo } from "@/lib/adminSpaPath";

export function PlatformConfigHubPage() {
  useAdminDocumentTitle("Platform config");
  const { bootstrap } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin === true;
  const { denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required.",
  );
  if (denied) return denied;

  return (
    <AdminSectionQueueHub
      title="Platform configuration"
      description="Feature flags, team access, tenant settings, and app configuration."
      quickLinks={[
        {
          id: "flags",
          label: "Feature flags",
          description: "Toggle tenant and platform features.",
          href: "/admin/settings/feature-flags",
          variant: "urgent",
        },
        {
          id: "team",
          label: "Admin team",
          description: "Staff accounts and invitations.",
          href: "/admin/settings/admin-team",
          variant: "mine",
        },
        {
          id: "permissions",
          label: "Roles & permissions",
          description: "Section access matrix for admin roles.",
          href: "/admin/settings/team-permissions",
          variant: "unassigned",
        },
      ]}
      toolCards={[
        {
          to: adminSpaTo("/admin/settings/feature-flags"),
          label: "Feature flags",
          description: "Enable or disable product features per tenant.",
          icon: ToggleLeft,
          accent: "from-violet-600 to-purple-800",
        },
        {
          to: adminSpaTo("/admin/settings/admin-team"),
          label: "Admin team",
          description: "Invite and manage platform administrators.",
          icon: UserCheck,
          accent: "from-sky-600 to-blue-800",
        },
        {
          to: adminSpaTo("/admin/settings/team-permissions"),
          label: "Roles & permissions",
          description: "RBAC matrix for admin sections.",
          icon: Shield,
          accent: "from-red-600 to-rose-800",
        },
        {
          to: adminSpaTo("/admin/settings"),
          label: "General settings",
          description: "Tenant branding, comms, and defaults.",
          icon: Settings,
          accent: "from-gray-700 to-gray-900",
        },
        {
          to: adminSpaTo("/admin/settings/app-version"),
          label: "App version",
          description: "Minimum supported client versions.",
          icon: Smartphone,
          accent: "from-emerald-600 to-teal-800",
        },
        ...(isSuperadmin
          ? [
              {
                to: adminSpaTo("/admin/settings/tenants"),
                label: "Markets",
                description: "Multi-tenant market configuration.",
                icon: Network,
                accent: "from-indigo-600 to-violet-800",
              },
            ]
          : []),
      ]}
    />
  );
}
