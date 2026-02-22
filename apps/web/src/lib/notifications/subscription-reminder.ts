/**
 * Subscription Renewal Reminder Service
 * Handles sending notifications before subscription expires
 */

interface SubscriptionReminderConfig {
  daysBeforeExpiry: number[];
  notificationChannels: ("email" | "sms" | "push")[];
  enableIpadNotifications: boolean;
}

const DEFAULT_CONFIG: SubscriptionReminderConfig = {
  daysBeforeExpiry: [30, 14, 7, 3, 1], // Send reminders 30, 14, 7, 3, and 1 day before expiry
  notificationChannels: ["email", "sms", "push"],
  enableIpadNotifications: true,
};

export async function sendSubscriptionReminder(
  userId: string,
  subscriptionExpiryDate: Date,
  config: Partial<SubscriptionReminderConfig> = {}
): Promise<void> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const now = new Date();
  const daysUntilExpiry = Math.ceil(
    (subscriptionExpiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Check if we should send a reminder today
  if (finalConfig.daysBeforeExpiry.includes(daysUntilExpiry)) {
    const userAgent = typeof window !== "undefined" ? window.navigator.userAgent : "";
    const isIpad = /iPad|iPhone|iPod/.test(userAgent) || 
                   (userAgent.includes("Mac") && "ontouchend" in document);

    // Send notifications via configured channels
    for (const channel of finalConfig.notificationChannels) {
      if (channel === "email") {
        await sendEmailReminder(userId, subscriptionExpiryDate, daysUntilExpiry);
      } else if (channel === "sms") {
        await sendSMSReminder(userId, subscriptionExpiryDate, daysUntilExpiry);
      } else if (channel === "push") {
        // Enable iPad notifications if configured
        if (isIpad && finalConfig.enableIpadNotifications) {
          await sendPushReminder(userId, subscriptionExpiryDate, daysUntilExpiry, true);
        } else if (!isIpad) {
          await sendPushReminder(userId, subscriptionExpiryDate, daysUntilExpiry, false);
        }
      }
    }
  }
}

async function sendEmailReminder(
  userId: string,
  expiryDate: Date,
  daysUntilExpiry: number
): Promise<void> {
  // In a real implementation, this would call an email service
  const response = await fetch("/api/notifications/subscription-reminder/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      expiryDate: expiryDate.toISOString(),
      daysUntilExpiry,
    }),
  });

  if (!response.ok) {
    console.error("Failed to send email reminder");
  }
}

async function sendSMSReminder(
  userId: string,
  expiryDate: Date,
  daysUntilExpiry: number
): Promise<void> {
  // In a real implementation, this would call an SMS service
  const response = await fetch("/api/notifications/subscription-reminder/sms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      expiryDate: expiryDate.toISOString(),
      daysUntilExpiry,
    }),
  });

  if (!response.ok) {
    console.error("Failed to send SMS reminder");
  }
}

async function sendPushReminder(
  userId: string,
  expiryDate: Date,
  daysUntilExpiry: number,
  isIpad: boolean
): Promise<void> {
  // Request notification permission if not already granted
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }

    if (Notification.permission === "granted") {
      const message = daysUntilExpiry === 1
        ? "Your Beautonomi subscription expires tomorrow!"
        : `Your Beautonomi subscription expires in ${daysUntilExpiry} days`;

      // For iPad, ensure we're using the correct notification API
      if (isIpad) {
        // iPad-specific notification handling
        new Notification("Subscription Reminder", {
          body: message,
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: `subscription-reminder-${daysUntilExpiry}`,
          requireInteraction: false,
        });
      } else {
        // Standard notification for other devices
        new Notification("Subscription Reminder", {
          body: message,
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: `subscription-reminder-${daysUntilExpiry}`,
        });
      }

      // Also send to backend for tracking
      await fetch("/api/notifications/subscription-reminder/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          expiryDate: expiryDate.toISOString(),
          daysUntilExpiry,
          isIpad,
        }),
      });
    }
  }
}

/**
 * Check and send reminders for all subscriptions expiring soon
 * This should be called periodically (e.g., via a cron job)
 */
export async function checkAndSendSubscriptionReminders(): Promise<void> {
  try {
    const response = await fetch("/api/notifications/subscription-reminder/check");
    if (!response.ok) {
      console.error("Failed to check subscription reminders");
    }
  } catch (error) {
    console.error("Error checking subscription reminders:", error);
  }
}
