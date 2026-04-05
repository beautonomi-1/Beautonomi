import type { UserRole } from "@/types/beautonomi";

/** Roles that may access support ticket admin APIs and the Support Tickets UI. */
export const SUPPORT_TICKET_STAFF_ROLES = [
  "superadmin",
  "support_agent",
  "admin_support",
] as const satisfies readonly UserRole[];

export type SupportTicketStaffRole = (typeof SUPPORT_TICKET_STAFF_ROLES)[number];

/** Roles that can appear in the assignee dropdown (people who handle tickets). */
export const SUPPORT_TICKET_ASSIGNEE_ROLES = [
  "superadmin",
  "support_agent",
  "admin_support",
] as const satisfies readonly UserRole[];
