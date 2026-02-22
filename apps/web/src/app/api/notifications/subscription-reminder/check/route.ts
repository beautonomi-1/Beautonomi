import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await getSupabaseServer();

    // Get all active subscriptions expiring in the next 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('id, user_id, expires_at, notification_preferences')
      .eq('status', 'active')
      .lte('expires_at', thirtyDaysFromNow.toISOString())
      .gte('expires_at', new Date().toISOString());

    if (error) {
      console.error('Error fetching subscriptions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch subscriptions' },
        { status: 500 }
      );
    }

    const remindersToSend: Array<{
      userId: string;
      subscriptionId: string;
      expiryDate: Date;
      daysUntilExpiry: number;
    }> = [];

    const now = new Date();
    const reminderDays = [30, 14, 7, 3, 1];

    for (const subscription of subscriptions || []) {
      const expiryDate = new Date(subscription.expires_at);
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Check if we should send a reminder today
      if (reminderDays.includes(daysUntilExpiry)) {
        // Check if reminder was already sent for this day
        const { data: existingReminder } = await supabase
          .from('subscription_reminders')
          .select('id')
          .eq('subscription_id', subscription.id)
          .eq('days_before_expiry', daysUntilExpiry)
          .eq('sent_at', new Date().toISOString().split('T')[0])
          .single();

        if (!existingReminder) {
          remindersToSend.push({
            userId: subscription.user_id,
            subscriptionId: subscription.id,
            expiryDate,
            daysUntilExpiry,
          });
        }
      }
    }

    // Send reminders
    for (const reminder of remindersToSend) {
      // Get user notification preferences
      const { data: userPrefs } = await supabase
        .from('notification_preferences')
        .select('subscription_reminders_email, subscription_reminders_sms, subscription_reminders_push')
        .eq('user_id', reminder.userId)
        .single();

      const prefs = userPrefs || {
        subscription_reminders_email: true,
        subscription_reminders_sms: true,
        subscription_reminders_push: true,
      };

      // Send email if enabled
      if (prefs.subscription_reminders_email) {
        await sendEmailReminder(reminder.userId, reminder.expiryDate, reminder.daysUntilExpiry);
      }

      // Send SMS if enabled
      if (prefs.subscription_reminders_sms) {
        await sendSMSReminder(reminder.userId, reminder.expiryDate, reminder.daysUntilExpiry);
      }

      // Send push notification if enabled (including iPad)
      if (prefs.subscription_reminders_push) {
        await sendPushReminder(reminder.userId, reminder.expiryDate, reminder.daysUntilExpiry);
      }

      // Record that reminder was sent
      await supabase.from('subscription_reminders').insert({
        subscription_id: reminder.subscriptionId,
        days_before_expiry: reminder.daysUntilExpiry,
        sent_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      message: `Processed ${remindersToSend.length} subscription reminders`,
      remindersSent: remindersToSend.length,
    });
  } catch (error) {
    console.error('Error in subscription reminder check:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function sendEmailReminder(
  userId: string,
  expiryDate: Date,
  daysUntilExpiry: number
): Promise<void> {
  // In a real implementation, integrate with email service (SendGrid, AWS SES, etc.)
  console.log(`Sending email reminder to user ${userId} - ${daysUntilExpiry} days until expiry`);
}

async function sendSMSReminder(
  userId: string,
  expiryDate: Date,
  daysUntilExpiry: number
): Promise<void> {
  // In a real implementation, integrate with SMS service (Twilio, AWS SNS, etc.)
  console.log(`Sending SMS reminder to user ${userId} - ${daysUntilExpiry} days until expiry`);
}

async function sendPushReminder(
  userId: string,
  expiryDate: Date,
  daysUntilExpiry: number
): Promise<void> {
  // In a real implementation, integrate with push notification service (FCM, APNs, etc.)
  // This should handle both iOS (including iPad) and Android devices
  console.log(`Sending push reminder to user ${userId} - ${daysUntilExpiry} days until expiry (iPad compatible)`);
}
