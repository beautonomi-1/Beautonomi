"use client";

import React from "react";
import Notificationtabs from "./components/tab";
import type { NotificationPreferences } from "./notification-preferences-types";

export default function NotificationsPageClient({
  initialPreferences,
}: {
  initialPreferences: NotificationPreferences | null;
}) {
  return <Notificationtabs initialPreferences={initialPreferences} />;
}