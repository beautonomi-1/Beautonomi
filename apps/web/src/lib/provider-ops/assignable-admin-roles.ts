import type { UserRole } from "@/types/beautonomi";

/** Platform operators eligible for provider-lead assignment — aligned with admin team roles. */
export const PROVIDER_OPS_ASSIGNABLE_ROLES: UserRole[] = [
  "superadmin",
  "admin_support",
  "admin_finance",
  "admin_trust",
  "admin_content",
  "admin_ecommerce",
  "admin_marketing",
  "admin_integrations",
  "admin_operations",
  "admin_platform_config",
  "support_agent",
];
