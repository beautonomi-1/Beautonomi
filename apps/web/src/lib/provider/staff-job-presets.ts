import type { StaffPermissions } from "@/lib/auth/permissions";
import {
  getDefaultStaffPermissionsForDbRole,
  getReceptionistPresetPermissions,
} from "@/lib/provider/staff-invite-default-permissions";

export type StaffJobPreset = "stylist" | "senior" | "front_desk" | "manager";

export type StaffJobPresetResult = {
  dbRole: "owner" | "manager" | "employee";
  permissions: StaffPermissions;
  is_service_provider: boolean;
  enable_in_online_booking: boolean;
  work_hours_enabled: boolean;
  /** When true, do not assign service_ids on create (front desk). */
  skipServiceAssignment: boolean;
};

export function parseStaffJobPreset(value: unknown): StaffJobPreset | null {
  if (value === "stylist" || value === "senior" || value === "front_desk" || value === "manager") {
    return value;
  }
  return null;
}

export function resolveStaffJobPreset(job: StaffJobPreset): StaffJobPresetResult {
  switch (job) {
    case "manager":
      return {
        dbRole: "manager",
        permissions: getDefaultStaffPermissionsForDbRole("manager"),
        is_service_provider: true,
        enable_in_online_booking: true,
        work_hours_enabled: true,
        skipServiceAssignment: false,
      };
    case "front_desk":
      return {
        dbRole: "employee",
        permissions: getReceptionistPresetPermissions(),
        is_service_provider: false,
        enable_in_online_booking: false,
        work_hours_enabled: true,
        skipServiceAssignment: true,
      };
    case "senior": {
      const base = getDefaultStaffPermissionsForDbRole("employee");
      return {
        dbRole: "employee",
        permissions: {
          ...base,
          create_appointments: true,
          cancel_appointments: true,
          create_sales: true,
          process_payments: true,
        },
        is_service_provider: true,
        enable_in_online_booking: true,
        work_hours_enabled: true,
        skipServiceAssignment: false,
      };
    }
    case "stylist":
    default:
      return {
        dbRole: "employee",
        permissions: getDefaultStaffPermissionsForDbRole("employee"),
        is_service_provider: true,
        enable_in_online_booking: true,
        work_hours_enabled: true,
        skipServiceAssignment: false,
      };
  }
}
