/**
 * Automation Execution API
 * 
 * This endpoint is called by a background job/cron service to execute automations.
 * It checks for automations that need to be triggered and sends messages via
 * the provider's configured Twilio/Mailchimp integrations.
 * 
 * Usage: This should be called periodically (e.g., every 5-15 minutes) by a cron job
 * or background service to check and execute pending automations.
 */

import { NextRequest } from "next/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendMessage } from "@/lib/marketing/unified-service";
import { debitMarketingBalance, getMarketingBalance, priceFor, creditMarketingBalance } from "@/lib/marketing/credits";
import { resolveMarketingSendingContext } from "@/lib/marketing/sending-path";
import { addDays, subDays, subMinutes } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dateRangeBoundsUtc,
  formatDateYmd,
  formatInTz,
  nowInTz,
  resolveTz,
} from "@/lib/dates/provider-tz";

async function providerTimezone(
  supabaseAdmin: SupabaseClient,
  providerId: string,
): Promise<string> {
  const { data } = await supabaseAdmin
    .from("providers")
    .select("timezone")
    .eq("id", providerId)
    .maybeSingle();
  return resolveTz((data as { timezone?: string | null } | null)?.timezone);
}

/** Month/day from `YYYY-MM-DD` (or ISO prefix) without timezone shift. */
function calendarMonthDayFromDob(value: unknown): { month: number; day: number } | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value : String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return { month: Number(m[2]), day: Number(m[3]) };
}

/**
 * POST /api/provider/automations/execute
 * 
 * Execute pending automations for all providers
 * This should be called by a cron job or background service
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;
    
    if (!cronSecret) {
      console.error("CRON_SECRET / INTERNAL_API_SECRET not configured — refusing automation execution");
      return handleApiError(
        new Error("Server misconfiguration"),
        "Service unavailable",
        "SERVICE_UNAVAILABLE",
        503
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return handleApiError(
        new Error("Unauthorized - This endpoint requires cron secret"),
        "Unauthorized",
        "UNAUTHORIZED",
        401
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date();
    const executedAutomations: string[] = [];
    const errors: Array<{ automationId: string; error: string }> = [];

    // Get all active automations
    const { data: automations, error: automationsError } = await supabaseAdmin
      .from("marketing_automations")
      .select("*")
      .eq("is_active", true)
      .eq("is_template", false);

    if (automationsError) {
      throw automationsError;
    }

    if (!automations || automations.length === 0) {
      return successResponse({
        executed: 0,
        message: "No active automations to execute",
      });
    }

    // Process each automation
    for (const automation of automations) {
      try {
        const shouldExecute = await shouldExecuteAutomation(supabaseAdmin, automation, now);
        
        if (!shouldExecute.shouldRun) {
          continue;
        }

        // Get the target customer(s) for this automation
        const customers = await getAutomationRecipients(
          supabaseAdmin,
          automation.provider_id,
          automation.trigger_type,
          automation.trigger_config,
          shouldExecute.context
        );

        if (customers.length === 0) {
          continue; // No recipients for this automation
        }

        const channel = automation.action_type as "email" | "sms" | "whatsapp" | "notification";
        const sendCtx =
          channel !== "notification"
            ? await resolveMarketingSendingContext(
                automation.provider_id,
                channel,
                supabaseAdmin,
              )
            : null;
        const debitsCredits = sendCtx?.debitsCredits ?? false;

        const { data: providerRow } = await supabaseAdmin
          .from("providers")
          .select("tenant_id")
          .eq("id", automation.provider_id)
          .maybeSingle();
        const tenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;

        if (debitsCredits) {
          const category = channel === "whatsapp" ? "marketing" : "default";
          const unitCost = await priceFor(supabaseAdmin, channel, category);
          const estimated = customers.length * unitCost;
          const balance = await getMarketingBalance(supabaseAdmin, automation.provider_id);
          if (balance.total_zar < estimated) {
            errors.push({
              automationId: automation.id,
              error: `Insufficient marketing credit (need ~R${estimated.toFixed(2)})`,
            });
            continue;
          }
        }

        // Get automation message content
        const messageContent = await getAutomationMessage(
          automation,
          shouldExecute.context
        );

        if (!messageContent) {
          errors.push({
            automationId: automation.id,
            error: "No message content configured",
          });
          continue;
        }

        // Send messages to all recipients
        for (const customer of customers) {
          const debitKey = `automation:${automation.id}:${customer.id}:${channel}`;
          let debitedAmount = 0;
          try {
            // Check if we've already sent this automation to this customer recently
            const alreadySent = await checkIfAlreadySent(
              supabaseAdmin,
              automation.id,
              customer.id,
              shouldExecute.context
            );

            if (alreadySent) {
              continue; // Skip - already sent
            }

            // Replace template variables in message
            const personalizedContent = personalizeMessage(
              messageContent.body,
              customer,
              shouldExecute.context
            );
            const personalizedSubject = personalizeMessage(
              messageContent.subject || "",
              customer,
              shouldExecute.context
            );

            // For push notifications, use the customer's user_id (external_id) rather than phone/email.
            const contactTo =
              channel === "notification" ? customer.id : customer.contact;

            if (debitsCredits) {
              const category = channel === "whatsapp" ? "marketing" : "default";
              const unitCost = await priceFor(supabaseAdmin, channel, category);
              const debit = await debitMarketingBalance({
                providerId: automation.provider_id,
                amountZar: unitCost,
                reason: "automation_send",
                idempotencyKey: debitKey,
                channel,
                category,
                supabase: supabaseAdmin,
              });
              if (!debit.ok) {
                errors.push({
                  automationId: automation.id,
                  error: "reason" in debit ? debit.reason : "debit failed",
                });
                continue;
              }
              debitedAmount = unitCost;
            }

            const result = await sendMessage(
              automation.provider_id,
              channel,
              {
                to: contactTo,
                subject: personalizedSubject || undefined,
                content: personalizedContent,
                fromName: messageContent.fromName,
                tenantId,
                supabase: supabaseAdmin,
              }
            );

            if (!result.success) {
              errors.push({
                automationId: automation.id,
                error: result.error || "Failed to send message",
              });
              if (debitedAmount > 0) {
                await creditMarketingBalance({
                  providerId: automation.provider_id,
                  amountZar: debitedAmount,
                  reason: "refund",
                  idempotencyKey: `refund:${debitKey}`,
                  channel,
                  metadata: { refund_reason: "send_failed", error: result.error ?? null },
                  supabase: supabaseAdmin,
                });
              }
            } else {
              // Log successful execution to prevent duplicates
              await logAutomationExecution(
                supabaseAdmin,
                automation.id,
                customer.id,
                result.messageId ?? "",
                automation.action_type
              );
            }
          } catch (error: any) {
            errors.push({
              automationId: automation.id,
              error: error.message || "Failed to send message",
            });
            // Refund a credit debited before the send threw (crash mid-send).
            if (debitedAmount > 0) {
              try {
                await creditMarketingBalance({
                  providerId: automation.provider_id,
                  amountZar: debitedAmount,
                  reason: "refund",
                  idempotencyKey: `refund:${debitKey}`,
                  channel,
                  metadata: { refund_reason: "send_exception", error: error?.message ?? null },
                  supabase: supabaseAdmin,
                });
              } catch {
                // Best-effort; idempotency key makes a later retry safe.
              }
            }
          }
        }

        executedAutomations.push(automation.id);
      } catch (error: any) {
        errors.push({
          automationId: automation.id,
          error: error.message || "Failed to execute automation",
        });
      }
    }

    return successResponse({
      executed: executedAutomations.length,
      automationIds: executedAutomations,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error executing automations:", error);
    return handleApiError(error, "Failed to execute automations");
  }
}

/**
 * Determine if an automation should be executed now
 */
async function shouldExecuteAutomation(
  supabaseAdmin: SupabaseClient,
  automation: any,
  now: Date
): Promise<{ shouldRun: boolean; context?: any }> {
  // Normalise legacy / mobile trigger names to the canonical engine names.
  const TRIGGER_ALIASES: Record<string, string> = {
    no_show: "appointment_no_show",
    birthday: "client_birthday",
    booking_confirmed: "booking_completed", // treat confirmed the same as completed follow-up
    appointment_confirmation: "booking_completed",
    inactive: "client_inactive",
    win_back: "client_inactive",
    rescheduled: "appointment_rescheduled",
    milestone: "visit_milestone",
    anniversary: "client_anniversary",
    referral: "referral_received",
    seasonal: "seasonal_promotion",
    custom: "seasonal_promotion", // fallback for custom: send to active clients
  };

  const rawTrigger = automation.trigger_type;
  const triggerType = TRIGGER_ALIASES[rawTrigger] ?? rawTrigger;
  const triggerConfig = automation.trigger_config || {};
  const delayMinutes = automation.delay_minutes || 0;

  switch (triggerType) {
    case "appointment_reminder": {
      const hoursBefore = triggerConfig.hours_before || 24;
      const minutesBefore = triggerConfig.minutes_before || hoursBefore * 60;
      const targetTime = subMinutes(now, minutesBefore - delayMinutes);

      // Find appointments scheduled at the target time
      const { data: bookings } = await supabaseAdmin
        .from("bookings")
        .select("id, scheduled_at, customer_id, status")
        .eq("provider_id", automation.provider_id)
        .eq("status", "confirmed")
        .gte("scheduled_at", targetTime.toISOString())
        .lte("scheduled_at", new Date(targetTime.getTime() + 15 * 60 * 1000).toISOString()); // 15 min window

      if (bookings && bookings.length > 0) {
        return {
          shouldRun: true,
          context: { bookings },
        };
      }
      return { shouldRun: false };
    }

    case "booking_completed": {
      const targetTime = subMinutes(now, delayMinutes);
      const windowStart = subMinutes(targetTime, 15); // 15 min window

      // Find recently completed bookings
      const { data: bookings } = await supabaseAdmin
        .from("bookings")
        .select("id, customer_id, completed_at, status")
        .eq("provider_id", automation.provider_id)
        .eq("status", "completed")
        .gte("completed_at", windowStart.toISOString())
        .lte("completed_at", targetTime.toISOString());

      if (bookings && bookings.length > 0) {
        return {
          shouldRun: true,
          context: { bookings },
        };
      }
      return { shouldRun: false };
    }

    case "appointment_no_show": {
      const targetTime = subMinutes(now, delayMinutes);
      const windowStart = subMinutes(targetTime, 15);

      // Find no-show appointments
      const { data: bookings } = await supabaseAdmin
        .from("bookings")
        .select("id, customer_id, scheduled_at, status")
        .eq("provider_id", automation.provider_id)
        .eq("status", "no_show")
        .gte("scheduled_at", windowStart.toISOString())
        .lte("scheduled_at", targetTime.toISOString());

      if (bookings && bookings.length > 0) {
        return {
          shouldRun: true,
          context: { bookings },
        };
      }
      return { shouldRun: false };
    }

    case "client_inactive": {
      const days = triggerConfig.days || 30;
      const _cutoffDate = subDays(now, days);

      // Find clients who haven't booked since cutoff date
      const { data: inactiveClients } = await supabaseAdmin
        .rpc("get_inactive_clients", {
          p_provider_id: automation.provider_id,
          p_days: days,
        });

      if (inactiveClients && inactiveClients.length > 0) {
        return {
          shouldRun: true,
          context: { clients: inactiveClients },
        };
      }
      return { shouldRun: false };
    }

    case "client_birthday": {
      const tz = await providerTimezone(supabaseAdmin, automation.provider_id);
      const month = Number(formatInTz(now, "M", tz));
      const day = Number(formatInTz(now, "d", tz));

      // Check for clients with birthdays today who have booked with this provider
      // Get distinct customers who have booked with this provider
      const { data: providerBookings } = await supabaseAdmin
        .from("bookings")
        .select("customer_id")
        .eq("provider_id", automation.provider_id)
        .not("customer_id", "is", null);

      if (!providerBookings || providerBookings.length === 0) {
        return { shouldRun: false };
      }

      const customerIds = [...new Set(providerBookings.map((b: any) => b.customer_id))];

      const { data: birthdayUsers } = await supabaseAdmin
        .from("users")
        .select("id, date_of_birth")
        .in("id", customerIds)
        .not("date_of_birth", "is", null);

      const birthdayClients =
        birthdayUsers?.filter((user: any) => {
          const parts = calendarMonthDayFromDob(user.date_of_birth);
          return parts != null && parts.month === month && parts.day === day;
        }).map((user: any) => ({ user_id: user.id })) || [];

      if (birthdayClients.length > 0) {
        return {
          shouldRun: true,
          context: { clients: birthdayClients },
        };
      }
      return { shouldRun: false };
    }

    case "appointment_rescheduled": {
      // §Release-audit 2026-04: the previous query filtered `bookings.status
      // = 'rescheduled'`, but the booking_status enum has no such value —
      // rescheduling keeps the status as `confirmed` / `pending` and writes
      // a `rescheduled` row into `booking_events`. Rebuild the trigger on
      // top of that event log so this automation actually fires.
      const targetTime = subMinutes(now, delayMinutes);
      const windowStart = subMinutes(targetTime, 15);

      const { data: events } = await supabaseAdmin
        .from("booking_events")
        .select("booking_id, created_at")
        .eq("event_type", "rescheduled")
        .gte("created_at", windowStart.toISOString())
        .lte("created_at", targetTime.toISOString());

      const bookingIds = [
        ...new Set((events ?? []).map((e: any) => e.booking_id).filter(Boolean)),
      ];
      if (bookingIds.length === 0) return { shouldRun: false };

      const { data: bookings } = await supabaseAdmin
        .from("bookings")
        .select("id, customer_id, updated_at, status")
        .eq("provider_id", automation.provider_id)
        .in("id", bookingIds);

      if (bookings && bookings.length > 0) {
        return {
          shouldRun: true,
          context: { bookings },
        };
      }
      return { shouldRun: false };
    }

    case "new_lead": {
      // §Release-audit 2026-04: dropped the `"inquiry"` status filter — that
      // literal is not a member of booking_status, so the previous query
      // always excluded it silently. `pending` (booking not yet confirmed)
      // is the current lead state.
      const minutesAgo = triggerConfig.minutes || delayMinutes || 60;
      const targetTime = subMinutes(now, minutesAgo);
      const windowStart = subMinutes(targetTime, 15);

      const { data: leads } = await supabaseAdmin
        .from("bookings")
        .select("id, customer_id, created_at, status")
        .eq("provider_id", automation.provider_id)
        .eq("status", "pending")
        .gte("created_at", windowStart.toISOString())
        .lte("created_at", targetTime.toISOString());

      if (leads && leads.length > 0) {
        return {
          shouldRun: true,
          context: { bookings: leads },
        };
      }
      return { shouldRun: false };
    }

    case "package_expiring": {
      const daysBefore = triggerConfig.days_before || 7;
      const tz = await providerTimezone(supabaseAdmin, automation.provider_id);
      const limitYmd = formatDateYmd(addDays(nowInTz(tz), daysBefore), tz);
      const { toIso: expiryUpperBound } = dateRangeBoundsUtc(limitYmd, limitYmd, tz);

      // Find packages expiring soon
      const { data: packages } = await supabaseAdmin
        .from("service_packages")
        .select("id, customer_id, expires_at")
        .eq("provider_id", automation.provider_id)
        .eq("is_active", true)
        .lte("expires_at", expiryUpperBound)
        .gte("expires_at", now.toISOString());

      if (packages && packages.length > 0) {
        return {
          shouldRun: true,
          context: { packages },
        };
      }
      return { shouldRun: false };
    }

    case "visit_milestone": {
      const visitCount = triggerConfig.visit_count || 10;

      // Find clients who have reached the visit milestone
      const { data: milestoneClients } = await supabaseAdmin
        .rpc("get_clients_by_visit_count", {
          p_provider_id: automation.provider_id,
          p_visit_count: visitCount,
        });

      if (milestoneClients && milestoneClients.length > 0) {
        return {
          shouldRun: true,
          context: { clients: milestoneClients },
        };
      }
      return { shouldRun: false };
    }

    case "client_anniversary": {
      const years = triggerConfig.years || 1;
      const anniversaryDate = new Date(now);
      anniversaryDate.setFullYear(anniversaryDate.getFullYear() - years);

      // Find clients who first booked exactly X years ago (within a 7-day window)
      const { data: anniversaryClients } = await supabaseAdmin
        .rpc("get_clients_by_first_booking_date", {
          p_provider_id: automation.provider_id,
          p_years_ago: years,
        });

      if (anniversaryClients && anniversaryClients.length > 0) {
        return {
          shouldRun: true,
          context: { clients: anniversaryClients },
        };
      }
      return { shouldRun: false };
    }

    case "referral_received": {
      const targetTime = subMinutes(now, delayMinutes);
      const windowStart = subMinutes(targetTime, 60); // 1 hour window

      // Bookings tagged with a provider referral source (e.g. Instagram, Friend) from Settings → Referral Sources
      const { data: referrals } = await supabaseAdmin
        .from("bookings")
        .select("id, customer_id, created_at, referral_source_id")
        .eq("provider_id", automation.provider_id)
        .not("referral_source_id", "is", null)
        .gte("created_at", windowStart.toISOString())
        .lte("created_at", targetTime.toISOString());

      if (referrals && referrals.length > 0) {
        return {
          shouldRun: true,
          context: { bookings: referrals },
        };
      }
      return { shouldRun: false };
    }

    case "seasonal_promotion": {
      const tz = await providerTimezone(supabaseAdmin, automation.provider_id);
      const month = Number(formatInTz(now, "M", tz));
      const day = Number(formatInTz(now, "d", tz));

      // Example: Check for major holidays or seasonal periods
      const isHolidaySeason = (month === 11 && day >= 20) || (month === 12) || (month === 1 && day <= 7); // Nov 20 - Jan 7
      const isSummer = month >= 6 && month <= 8;
      const isValentines = month === 2 && day >= 10 && day <= 16;

      if (isHolidaySeason || isSummer || isValentines) {
        // Get active clients for seasonal promotion
        const { data: activeClients } = await supabaseAdmin
          .rpc("get_active_clients", {
            p_provider_id: automation.provider_id,
            p_days: 90, // Active in last 90 days
          });

        if (activeClients && activeClients.length > 0) {
          return {
            shouldRun: true,
            context: { clients: activeClients },
          };
        }
      }
      return { shouldRun: false };
    }

    case "holiday": {
      const tz = await providerTimezone(supabaseAdmin, automation.provider_id);
      const month = Number(formatInTz(now, "M", tz));
      const day = Number(formatInTz(now, "d", tz));

      // Major holidays
      const isHoliday = 
        (month === 1 && day === 1) || // New Year
        (month === 2 && day === 14) || // Valentine's
        (month === 12 && day === 25) || // Christmas
        (month === 12 && day === 31); // New Year's Eve

      if (isHoliday) {
        const { data: clients } = await supabaseAdmin
          .rpc("get_active_clients", {
            p_provider_id: automation.provider_id,
            p_days: 180,
          });

        if (clients && clients.length > 0) {
          return {
            shouldRun: true,
            context: { clients },
          };
        }
      }
      return { shouldRun: false };
    }

    // Add more trigger types as needed
    default:
      console.warn(`Unsupported trigger type: ${triggerType}`);
      return { shouldRun: false };
  }
}

/**
 * Get recipients for an automation based on trigger context
 */
async function getAutomationRecipients(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  triggerType: string,
  triggerConfig: any,
  context: any
): Promise<Array<{ id: string; contact: string; name?: string }>> {
  const recipients: Array<{ id: string; contact: string; name?: string }> = [];

  if (triggerType === "appointment_reminder" && context?.bookings) {
    // Get customer contact info for bookings
    const customerIds = context.bookings.map((b: any) => b.customer_id);
    const { data: customers } = await supabaseAdmin
      .from("users")
      .select("id, email, phone, full_name")
      .in("id", customerIds);

    if (customers) {
      for (const customer of customers) {
        // Use phone for SMS, email for email
        const contact = customer.phone || customer.email;
        if (contact) {
          recipients.push({
            id: customer.id,
            contact,
            name: customer.full_name,
          });
        }
      }
    }
  } else if (triggerType === "booking_completed" && context?.bookings) {
    const customerIds = context.bookings.map((b: any) => b.customer_id);
    const { data: customers } = await supabaseAdmin
      .from("users")
      .select("id, email, phone, full_name")
      .in("id", customerIds);

    if (customers) {
      for (const customer of customers) {
        const contact = customer.phone || customer.email;
        if (contact) {
          recipients.push({
            id: customer.id,
            contact,
            name: customer.full_name,
          });
        }
      }
    }
  } else if (triggerType === "client_inactive" && context?.clients) {
    const customerIds = context.clients.map((c: any) => c.id);
    const { data: customers } = await supabaseAdmin
      .from("users")
      .select("id, email, phone, full_name")
      .in("id", customerIds);

    if (customers) {
      for (const customer of customers) {
        const contact = customer.phone || customer.email;
        if (contact) {
          recipients.push({
            id: customer.id,
            contact,
            name: customer.full_name,
          });
        }
      }
    }
  } else if (triggerType === "client_birthday" && context?.clients) {
    const customerIds = context.clients.map((c: any) => c.user_id);
    const { data: customers } = await supabaseAdmin
      .from("users")
      .select("id, email, phone, full_name")
      .in("id", customerIds);

    if (customers) {
      for (const customer of customers) {
        const contact = customer.phone || customer.email;
        if (contact) {
          recipients.push({
            id: customer.id,
            contact,
            name: customer.full_name,
          });
        }
      }
    }
  } else if (triggerType === "appointment_rescheduled" && context?.bookings) {
    const customerIds = context.bookings.map((b: any) => b.customer_id);
    const { data: customers } = await supabaseAdmin
      .from("users")
      .select("id, email, phone, full_name")
      .in("id", customerIds);

    if (customers) {
      for (const customer of customers) {
        const contact = customer.phone || customer.email;
        if (contact) {
          recipients.push({
            id: customer.id,
            contact,
            name: customer.full_name,
          });
        }
      }
    }
  } else if (triggerType === "new_lead" && context?.bookings) {
    const customerIds = context.bookings.map((b: any) => b.customer_id);
    const { data: customers } = await supabaseAdmin
      .from("users")
      .select("id, email, phone, full_name")
      .in("id", customerIds);

    if (customers) {
      for (const customer of customers) {
        const contact = customer.phone || customer.email;
        if (contact) {
          recipients.push({
            id: customer.id,
            contact,
            name: customer.full_name,
          });
        }
      }
    }
  } else if (triggerType === "package_expiring" && context?.packages) {
    const customerIds = context.packages.map((p: any) => p.customer_id);
    const { data: customers } = await supabaseAdmin
      .from("users")
      .select("id, email, phone, full_name")
      .in("id", customerIds);

    if (customers) {
      for (const customer of customers) {
        const contact = customer.phone || customer.email;
        if (contact) {
          recipients.push({
            id: customer.id,
            contact,
            name: customer.full_name,
          });
        }
      }
    }
  } else if ((triggerType === "visit_milestone" || triggerType === "client_anniversary" || 
              triggerType === "seasonal_promotion" || triggerType === "holiday") && context?.clients) {
    const customerIds = context.clients.map((c: any) => c.id || c.user_id);
    const { data: customers } = await supabaseAdmin
      .from("users")
      .select("id, email, phone, full_name")
      .in("id", customerIds);

    if (customers) {
      for (const customer of customers) {
        const contact = customer.phone || customer.email;
        if (contact) {
          recipients.push({
            id: customer.id,
            contact,
            name: customer.full_name,
          });
        }
      }
    }
  } else if (triggerType === "referral_received" && context?.bookings) {
    const customerIds = context.bookings.map((b: any) => b.customer_id);
    const { data: customers } = await supabaseAdmin
      .from("users")
      .select("id, email, phone, full_name")
      .in("id", customerIds);

    if (customers) {
      for (const customer of customers) {
        const contact = customer.phone || customer.email;
        if (contact) {
          recipients.push({
            id: customer.id,
            contact,
            name: customer.full_name,
          });
        }
      }
    }
  }

  return recipients;
}

/**
 * Get message content for an automation
 * Uses message template from action_config if available, otherwise falls back to defaults
 */
async function getAutomationMessage(
  automation: any,
  _context: any
): Promise<{ subject?: string; body: string; fromName?: string } | null> {
  // Get message template from action_config
  const actionConfig = automation.action_config || {};
  let template = actionConfig.message_template;
  
  // Fallback to default messages if no template in action_config
  if (!template) {
    const defaultMessages: Record<string, string> = {
      "48h Appointment Reminder": "Hi {{name}}, this is a friendly reminder that you have an appointment with us in 48 hours. We're looking forward to seeing you!",
      "24h Upcoming Reminder": "Hi {{name}}, just a reminder that your appointment is tomorrow. See you soon!",
      "1h Final Reminder": "Hi {{name}}, your appointment is in 1 hour. We'll see you soon!",
      "Thank You After Service": "Hi {{name}}, thank you for choosing us today! We hope you had a great experience.",
      "Review Request": "Hi {{name}}, we'd love to hear about your experience! Please leave us a review.",
      "Re-book Reminder (3 Days)": "Hi {{name}}, it's been 3 days since your last visit. Ready to book your next appointment?",
      "Win-Back: 30 Days Inactive": "Hi {{name}}, we miss you! It's been a while since your last visit. Book now and get 10% off!",
      "Client Birthday": "Happy Birthday {{name}}! 🎉 We'd love to celebrate with you - here's a special birthday offer just for you!",
    };
    template = defaultMessages[automation.name] || automation.description || "Hello {{name}}, this is an automated message from us.";
  }

  // Get subject from action_config (for email) or use automation name
  const subject = actionConfig.subject || (automation.action_type === "email" ? automation.name : undefined);

  return {
    body: template, // Will be personalized later
    subject,
    fromName: actionConfig.from_name || "Beautonomi",
  };
}

/**
 * Check if automation was already sent to this customer
 */
async function checkIfAlreadySent(
  supabaseAdmin: SupabaseClient,
  automationId: string,
  customerId: string,
  _context: any
): Promise<boolean> {
  // Check execution log for this automation + customer combination
  // For time-based triggers, check if sent within the trigger window
  const { data: existing } = await supabaseAdmin
    .from("automation_executions")
    .select("id")
    .eq("automation_id", automationId)
    .eq("customer_id", customerId)
    .gte("executed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
    .maybeSingle();

  return !!existing;
}

/**
 * Personalize message with customer and context data
 */
function personalizeMessage(
  template: string,
  customer: { id: string; name?: string; contact: string },
  context: any
): string {
  let message = template;

  // Replace customer name
  message = message.replace(/\{\{name\}\}/g, customer.name || "there");
  message = message.replace(/\{\{customer_name\}\}/g, customer.name || "there");

  // Replace booking details if available
  if (context?.bookings?.[0]) {
    const booking = context.bookings[0];
    message = message.replace(/\{\{booking_number\}\}/g, booking.booking_number || booking.id || "");
    if (booking.scheduled_at) {
      const date = new Date(booking.scheduled_at);
      message = message.replace(/\{\{appointment_date\}\}/g, date.toLocaleDateString());
      message = message.replace(/\{\{appointment_time\}\}/g, date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
  }

  // Replace package details if available
  if (context?.packages?.[0]) {
    const pkg = context.packages[0];
    if (pkg.expires_at) {
      const date = new Date(pkg.expires_at);
      message = message.replace(/\{\{package_expiry_date\}\}/g, date.toLocaleDateString());
    }
  }

  return message;
}

/**
 * Log automation execution to prevent duplicate sends
 */
async function logAutomationExecution(
  supabaseAdmin: SupabaseClient,
  automationId: string,
  customerId: string,
  messageId: string,
  actionType: string
): Promise<void> {
  // Create a log entry to track executions
  // This prevents sending the same automation multiple times
  try {
    const { error } = await supabaseAdmin.from("automation_executions").insert({
      automation_id: automationId,
      customer_id: customerId,
      message_id: messageId,
      action_type: actionType,
      executed_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (err) {
    // Table might not exist yet - that's okay for now
    console.warn("Could not log automation execution:", err);
  }
}
