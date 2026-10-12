import { getStaffNotificationSettingsDefaults } from "@/lib/notifications/notification-preferences-defaults";

export type StaffNotificationSettingsJson = Record<string, unknown>;

export function parseStaffNotificationSettings(raw: unknown): StaffNotificationSettingsJson {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as StaffNotificationSettingsJson;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && raw !== null) return raw as StaffNotificationSettingsJson;
  return {};
}

/**
 * Merge JSON notification_settings with legacy provider_staff columns so send
 * paths and the team member dialog agree.
 */
export function effectiveStaffNotificationSettings(row: {
  notification_settings?: unknown;
  email_notifications_enabled?: boolean | null;
  sms_notifications_enabled?: boolean | null;
  desktop_notifications_enabled?: boolean | null;
}): StaffNotificationSettingsJson {
  const base = {
    ...getStaffNotificationSettingsDefaults(),
    ...parseStaffNotificationSettings(row.notification_settings),
  };
  if (
    row.email_notifications_enabled !== undefined &&
    row.email_notifications_enabled !== null &&
    base.email_enabled === undefined
  ) {
    base.email_enabled = row.email_notifications_enabled;
  } else if (row.email_notifications_enabled === false) {
    base.email_enabled = false;
  }
  if (
    row.sms_notifications_enabled !== undefined &&
    row.sms_notifications_enabled !== null
  ) {
    base.sms_enabled = row.sms_notifications_enabled === true;
  }
  if (
    row.desktop_notifications_enabled !== undefined &&
    row.desktop_notifications_enabled !== null
  ) {
    base.desktop_enabled = row.desktop_notifications_enabled === true;
  }
  return base;
}

/** Apply team settings PATCH fields into notification_settings JSON. */
export function mergeStaffSettingsPatchIntoNotificationJson(
  existing: unknown,
  patch: {
    email_notifications_enabled?: boolean;
    sms_notifications_enabled?: boolean;
    desktop_notifications_enabled?: boolean;
  },
): StaffNotificationSettingsJson {
  const next = {
    ...getStaffNotificationSettingsDefaults(),
    ...parseStaffNotificationSettings(existing),
  };
  if (patch.email_notifications_enabled !== undefined) {
    next.email_enabled = patch.email_notifications_enabled;
  }
  if (patch.sms_notifications_enabled !== undefined) {
    next.sms_enabled = patch.sms_notifications_enabled;
  }
  if (patch.desktop_notifications_enabled !== undefined) {
    next.desktop_enabled = patch.desktop_notifications_enabled;
  }
  return next;
}
