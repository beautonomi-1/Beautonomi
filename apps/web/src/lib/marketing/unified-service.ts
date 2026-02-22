/**
 * Unified Marketing Service
 * 
 * Provides a unified interface for sending marketing campaigns (emails, SMS, and WhatsApp)
 * using provider-configured integrations.
 * 
 * API References:
 * - SendGrid: https://docs.sendgrid.com/api-reference/mail-send/mail-send
 * - Mailchimp: https://mailchimp.com/developer/transactional/api/messages/send-new-message/
 * - Twilio: https://www.twilio.com/docs/usage/api
 */

import { getSupabaseServer } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MessagingChannel = "email" | "sms" | "whatsapp";
export type EmailProvider = "sendgrid" | "mailchimp";

export interface SendCampaignOptions {
  to: string | string[]; // Email address or phone number(s)
  subject?: string; // For email campaigns
  content: string; // Campaign message body
  from?: string; // From email/phone (optional, uses integration default)
  fromName?: string; // From name (optional)
  metadata?: Record<string, any>; // Additional campaign metadata
}

export interface SendCampaignResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: string;
}

export interface EmailIntegration {
  id: string;
  provider_id: string;
  provider_name: EmailProvider;
  api_key: string;
  api_secret?: string;
  from_email: string;
  from_name: string;
  is_enabled: boolean;
  test_status: "pending" | "success" | "failed";
}

export interface TwilioIntegration {
  id: string;
  provider_id: string;
  account_sid: string;
  auth_token: string;
  sms_from_number?: string;
  whatsapp_from_number?: string;
  is_sms_enabled: boolean;
  is_whatsapp_enabled: boolean;
  sms_test_status: "pending" | "success" | "failed";
  whatsapp_test_status: "pending" | "success" | "failed";
}

/**
 * Get provider's email integration
 */
export async function getEmailIntegration(
  supabase: SupabaseClient<any>,
  providerId: string
): Promise<EmailIntegration | null> {
  const { data, error } = await supabase
    .from("provider_email_integrations")
    .select("*")
    .eq("provider_id", providerId)
    .eq("is_enabled", true)
    .single();

  if (error || !data) {
    return null;
  }

  return data as EmailIntegration;
}

/**
 * Get provider's Twilio integration
 */
export async function getTwilioIntegration(
  supabase: SupabaseClient<any>,
  providerId: string
): Promise<TwilioIntegration | null> {
  const { data, error } = await supabase
    .from("provider_twilio_integrations")
    .select("*")
    .eq("provider_id", providerId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as TwilioIntegration;
}

/**
 * Send marketing campaign using provider's integration
 */
export async function sendMessage(
  providerId: string,
  channel: MessagingChannel,
  options: SendCampaignOptions
): Promise<SendCampaignResult> {
  const supabase = await getSupabaseServer();
  
  if (channel === "email") {
    const integration = await getEmailIntegration(supabase, providerId);
    if (!integration) {
      return {
        success: false,
        error: "No active email integration found. Please configure SendGrid or Mailchimp in settings.",
      };
    }
    
    if (integration.provider_name === "sendgrid") {
      return await sendViaSendGrid(integration, options);
    } else if (integration.provider_name === "mailchimp") {
      return await sendViaMailchimp(integration, options);
    }
  } else if (channel === "sms" || channel === "whatsapp") {
    const integration = await getTwilioIntegration(supabase, providerId);
    if (!integration) {
      return {
        success: false,
        error: "No Twilio integration found. Please configure Twilio in settings.",
      };
    }
    
    if (channel === "sms") {
      if (!integration.is_sms_enabled || !integration.sms_from_number) {
        return {
          success: false,
          error: "SMS is not enabled or configured. Please enable SMS in Twilio settings.",
        };
      }
      return await sendViaTwilioSMS(integration, options);
    } else {
      if (!integration.is_whatsapp_enabled || !integration.whatsapp_from_number) {
        return {
          success: false,
          error: "WhatsApp is not enabled or configured. Please enable WhatsApp in Twilio settings.",
        };
      }
      return await sendViaTwilioWhatsApp(integration, options);
    }
  }
  
  return {
    success: false,
    error: `Unsupported channel: ${channel}`,
  };
}

// Email Provider Implementations

/**
 * Send via SendGrid v3 API
 * Documentation: https://docs.sendgrid.com/api-reference/mail-send/mail-send
 */
async function sendViaSendGrid(
  integration: EmailIntegration,
  options: SendCampaignOptions
): Promise<SendCampaignResult> {
  try {
    const apiKey = integration.api_key;
    if (!apiKey) {
      return { success: false, error: "SendGrid API key not configured" };
    }

    if (!options.subject) {
      return { success: false, error: "Email subject is required" };
    }

    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    const fromEmail = options.from || integration.from_email;
    const fromName = options.fromName || integration.from_name || "Beautonomi";
    
    // SendGrid v3 API structure
    const payload = {
      personalizations: recipients.map(to => ({
        to: [{ email: to }],
      })),
      from: {
        email: fromEmail,
        name: fromName,
      },
      subject: options.subject,
      content: [
        {
          type: "text/html",
          value: options.content,
        },
      ],
    };
    
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    // SendGrid returns 202 Accepted on success (no body)
    if (response.status === 202) {
      // Extract message ID from X-Message-Id header if available
      const messageId = response.headers.get("X-Message-Id");
      return {
        success: true,
        messageId: messageId || undefined,
        provider: "sendgrid",
      };
    }

    // Handle errors
    const errorText = await response.text();
    let errorMessage = "SendGrid API error";
    
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.errors?.[0]?.message || errorJson.message || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }

    return {
      success: false,
      error: errorMessage,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send via Mailchimp Marketing API
 * For marketing campaigns, we use the Mailchimp Marketing API (v3.0)
 * Documentation: https://mailchimp.com/developer/marketing/api/campaigns/
 * 
 * Note: This creates and sends a campaign via Mailchimp's Marketing API.
 * Mailchimp Transactional (Mandrill) should only be used for transactional emails
 * (order confirmations, password resets, etc.), not marketing campaigns.
 */
async function sendViaMailchimp(
  integration: EmailIntegration,
  options: SendCampaignOptions
): Promise<SendCampaignResult> {
  try {
    const apiKey = integration.api_key || integration.api_secret;
    if (!apiKey) {
      return { success: false, error: "Mailchimp API key not configured" };
    }

    if (!options.subject) {
      return { success: false, error: "Email subject is required" };
    }

    // Extract datacenter from API key (format: xxxxx-us1)
    // Mailchimp API keys contain the datacenter suffix
    const parts = apiKey.split("-");
    const datacenter = parts.length > 1 ? parts[parts.length - 1] : "us1";
    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    const fromEmail = options.from || integration.from_email;
    const fromName = options.fromName || integration.from_name || "Beautonomi";
    
    // For marketing campaigns, we need to:
    // 1. Create a temporary list/segment with recipients
    // 2. Create a campaign
    // 3. Send the campaign
    // 
    // Note: This is a simplified implementation. For production, you should:
    // - Maintain a permanent audience list
    // - Use segments or tags for targeting
    // - Schedule campaigns rather than immediate send
    
    const baseUrl = `https://${datacenter}.api.mailchimp.com/3.0`;
    const authHeader = `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`;
    
    // Step 1: Create a temporary list for this campaign
    const listPayload = {
      name: `Campaign ${Date.now()}`,
      permission_reminder: "You're receiving this because you opted in.",
      email_type_option: false,
      contact: {
        company: fromName,
        address1: "",
        city: "",
        state: "",
        zip: "",
        country: "ZA",
      },
      campaign_defaults: {
        from_name: fromName,
        from_email: fromEmail,
        subject: options.subject,
        language: "en",
      },
    };
    
    const listResponse = await fetch(`${baseUrl}/lists`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify(listPayload),
    });
    
    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      return {
        success: false,
        error: `Failed to create audience list: ${errorText}`,
      };
    }
    
    const listData = await listResponse.json();
    const listId = listData.id;
    
    // Step 2: Add recipients to the list
    const membersPayload = {
      members: recipients.map(email => ({
        email_address: email,
        status: "subscribed",
      })),
      update_existing: false,
    };
    
    await fetch(`${baseUrl}/lists/${listId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify(membersPayload),
    });
    
    // Step 3: Create a campaign
    const campaignPayload = {
      type: "regular",
      recipients: {
        list_id: listId,
      },
      settings: {
        subject_line: options.subject,
        from_name: fromName,
        reply_to: fromEmail,
        title: `Campaign ${Date.now()}`,
      },
    };
    
    const campaignResponse = await fetch(`${baseUrl}/campaigns`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify(campaignPayload),
    });
    
    if (!campaignResponse.ok) {
      const errorText = await campaignResponse.text();
      return {
        success: false,
        error: `Failed to create campaign: ${errorText}`,
      };
    }
    
    const campaignData = await campaignResponse.json();
    const campaignId = campaignData.id;
    
    // Step 4: Set campaign content
    const contentPayload = {
      html: options.content,
    };
    
    await fetch(`${baseUrl}/campaigns/${campaignId}/content`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify(contentPayload),
    });
    
    // Step 5: Send the campaign
    const sendResponse = await fetch(`${baseUrl}/campaigns/${campaignId}/actions/send`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
      },
    });
    
    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      return {
        success: false,
        error: `Failed to send campaign: ${errorText}`,
      };
    }

    return {
      success: true,
      messageId: campaignId,
      provider: "mailchimp",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// SMS Provider Implementations

/**
 * Send SMS via Twilio API
 * Documentation: https://www.twilio.com/docs/usage/api
 * Endpoint: POST /2010-04-01/Accounts/{AccountSid}/Messages.json
 */
async function sendViaTwilioSMS(
  integration: TwilioIntegration,
  options: SendCampaignOptions
): Promise<SendCampaignResult> {
  try {
    const accountSid = integration.account_sid;
    const authToken = integration.auth_token;
    const fromNumber = integration.sms_from_number;
    
    if (!accountSid || !authToken || !fromNumber) {
      return { success: false, error: "Twilio SMS credentials not configured" };
    }

    if (!options.content) {
      return { success: false, error: "Message content is required" };
    }

    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    
    // Twilio requires E.164 format phone numbers
    // Validate and send to each recipient
    const results = await Promise.all(
      recipients.map(async (to) => {
        // Ensure phone number is in E.164 format (starts with +)
        const toNumber = to.startsWith("+") ? to : `+${to.replace(/\D/g, "")}`;
        const fromNumberFormatted = fromNumber.startsWith("+") ? fromNumber : `+${fromNumber.replace(/\D/g, "")}`;
        
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              "Authorization": `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              From: fromNumberFormatted,
              To: toNumber,
              Body: options.content,
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || `Twilio API error: ${response.status}`);
        }

        return await response.json();
      })
    );

    // Return first message SID as the message ID
    return {
      success: true,
      messageId: results[0]?.sid,
      provider: "twilio_sms",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}


// WhatsApp Provider Implementations

/**
 * Send WhatsApp via Twilio API
 * Documentation: https://www.twilio.com/docs/whatsapp
 * Uses the same Messages API but with whatsapp: prefix for phone numbers
 */
async function sendViaTwilioWhatsApp(
  integration: TwilioIntegration,
  options: SendCampaignOptions
): Promise<SendCampaignResult> {
  try {
    const accountSid = integration.account_sid;
    const authToken = integration.auth_token;
    const fromNumber = integration.whatsapp_from_number;
    
    if (!accountSid || !authToken || !fromNumber) {
      return { success: false, error: "Twilio WhatsApp credentials not configured" };
    }

    if (!options.content) {
      return { success: false, error: "Message content is required" };
    }

    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    
    // Twilio WhatsApp requires whatsapp: prefix for phone numbers
    // Format: whatsapp:+14155238886
    const results = await Promise.all(
      recipients.map(async (to) => {
        // Ensure phone number is in E.164 format first, then add whatsapp: prefix
        let toNumber = to.startsWith("whatsapp:") ? to.replace("whatsapp:", "") : to;
        toNumber = toNumber.startsWith("+") ? toNumber : `+${toNumber.replace(/\D/g, "")}`;
        const toWhatsApp = `whatsapp:${toNumber}`;
        
        // Format from number
        const fromNumberFormatted = fromNumber.startsWith("whatsapp:") 
          ? fromNumber 
          : fromNumber.startsWith("+")
          ? `whatsapp:${fromNumber}`
          : `whatsapp:+${fromNumber.replace(/\D/g, "")}`;
        
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              "Authorization": `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              From: fromNumberFormatted,
              To: toWhatsApp,
              Body: options.content,
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || `Twilio WhatsApp API error: ${response.status}`);
        }

        return await response.json();
      })
    );

    return {
      success: true,
      messageId: results[0]?.sid,
      provider: "twilio_whatsapp",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

