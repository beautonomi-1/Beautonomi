import { describe, expect, it } from "vitest";
import {
  effectiveStaffNotificationSettings,
  mergeStaffSettingsPatchIntoNotificationJson,
} from "@/lib/notifications/staff-notification-settings-sync";
import { filterStaffUserIdsByNotificationSettings } from "@/lib/notifications/notify-provider-team";

describe("staff notification settings sync", () => {
  it("maps legacy email_notifications_enabled column into email_enabled", () => {
    const settings = effectiveStaffNotificationSettings({
      notification_settings: { new_bookings: true },
      email_notifications_enabled: false,
    });
    expect(settings.email_enabled).toBe(false);
  });

  it("merges team dialog PATCH fields into notification_settings JSON", () => {
    const next = mergeStaffSettingsPatchIntoNotificationJson(
      { new_bookings: true, email_enabled: true },
      { email_notifications_enabled: false },
    );
    expect(next.email_enabled).toBe(false);
    expect(next.new_bookings).toBe(true);
  });

  it("excludes staff from booking fan-out when new_bookings is false", () => {
    const ids = filterStaffUserIdsByNotificationSettings(
      [
        {
          user_id: "staff-user-1",
          notification_settings: { new_bookings: false },
        },
      ],
      "new_bookings",
    );
    expect(ids).toEqual([]);
  });
});
