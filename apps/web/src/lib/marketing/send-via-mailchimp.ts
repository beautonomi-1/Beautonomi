/**
 * Mailchimp Transactional (Mandrill) — provider BYO email for marketing sends.
 * @see https://mailchimp.com/developer/transactional/api/messages/send.md
 * @see https://mailchimp.com/developer/transactional/api/users/ping.md
 */

type MailchimpEmailIntegration = {
  api_key: string;
  api_secret?: string;
  from_email: string;
  from_name: string;
};

type MailchimpSendOptions = {
  to: string | string[];
  subject?: string;
  content: string;
  from?: string;
  fromName?: string;
};

type MailchimpSendResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: string;
};

const MANDRILL_API_BASE = "https://mandrillapp.com/api/1.4";

/** Mailchimp Marketing API key shape (32 hex + datacenter suffix). Not valid for Mandrill. */
export const MAILCHIMP_MARKETING_KEY_PATTERN = /^[a-f0-9]{32}-[a-z]{2}\d+$/i;

export function isMailchimpMarketingApiKey(apiKey: string): boolean {
  return MAILCHIMP_MARKETING_KEY_PATTERN.test(apiKey.trim());
}

/** Ensure stored key shape matches the selected BYO email provider (avoids SendGrid↔Mandrill mix-ups). */
export function validateEmailApiKeyForProvider(
  providerName: "sendgrid" | "mailchimp",
  apiKey: string,
): string | null {
  const key = apiKey.trim();
  if (!key) return "API key is required";

  if (providerName === "sendgrid") {
    if (!key.startsWith("SG.")) {
      return "Invalid SendGrid API key format. Should start with 'SG.'";
    }
    return null;
  }

  if (isMailchimpMarketingApiKey(key)) {
    return "This looks like a Mailchimp Marketing API key (Profile → Extras → API keys). Use a Mailchimp Transactional key from Transactional → Settings → API Keys.";
  }
  if (key.startsWith("SG.")) {
    return "SendGrid API keys cannot be used for Mailchimp Transactional. Enter a Mailchimp Transactional API key.";
  }
  return null;
}

type MandrillErrorBody = {
  status?: string;
  name?: string;
  message?: string;
  code?: number | string;
};

export function mapMandrillApiError(body: MandrillErrorBody | null, fallback: string): string {
  if (!body) return fallback;
  const name = body.name ?? "";
  const message = body.message ?? fallback;

  if (name === "Invalid_Key") {
    return "Invalid Mailchimp Transactional API key. Create one under Mailchimp Transactional → Settings → API Keys.";
  }
  if (name === "PaymentRequired" || body.code === 10 || body.code === "10") {
    return "Mailchimp Transactional requires a paid plan or active credits for this feature.";
  }
  if (message.toLowerCase().includes("permission") && message.toLowerCase().includes("ip")) {
    return "This API key is restricted by IP address. Allow your server IP in Mailchimp Transactional key settings.";
  }
  if (message.toLowerCase().includes("permission") && message.toLowerCase().includes("method")) {
    return "This API key cannot call this Mailchimp Transactional endpoint. Edit key permissions in Transactional settings.";
  }
  return message;
}

export async function pingMailchimpTransactional(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${MANDRILL_API_BASE}/users/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: apiKey }),
    });

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!response.ok) {
      const errBody = typeof parsed === "object" && parsed !== null ? (parsed as MandrillErrorBody) : null;
      return { ok: false, error: mapMandrillApiError(errBody, `Mailchimp Transactional ping failed (${response.status})`) };
    }

    if (parsed === "PONG!" || parsed === "PONG") {
      return { ok: true };
    }

    return { ok: false, error: "Unexpected response from Mailchimp Transactional ping." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to reach Mailchimp Transactional",
    };
  }
}

type MandrillSendResult = {
  email: string;
  status: string;
  _id: string;
  reject_reason?: string;
};

function mapRejectReason(reason: string | undefined): string {
  if (reason === "unsigned") {
    return "Sending domain is not verified in Mailchimp Transactional (SPF/DKIM). Verify your domain and use a from-address on that domain.";
  }
  if (reason === "invalid-sender") {
    return "Invalid sender address for Mailchimp Transactional.";
  }
  if (reason) {
    return `Mailchimp Transactional rejected the message: ${reason}`;
  }
  return "Mailchimp Transactional rejected the message.";
}

export async function sendViaMailchimpTransactional(
  integration: MailchimpEmailIntegration,
  options: MailchimpSendOptions,
): Promise<MailchimpSendResult> {
  try {
    const apiKey = integration.api_key || integration.api_secret;
    if (!apiKey) {
      return { success: false, error: "Mailchimp Transactional API key not configured" };
    }

    if (isMailchimpMarketingApiKey(apiKey)) {
      return {
        success: false,
        error:
          "This looks like a Mailchimp Marketing API key. Use a Mailchimp Transactional key from Transactional → Settings → API Keys.",
      };
    }

    if (!options.subject) {
      return { success: false, error: "Email subject is required" };
    }

    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    const fromEmail = options.from || integration.from_email;
    const fromName = options.fromName || integration.from_name || "Beautonomi";

    const response = await fetch(`${MANDRILL_API_BASE}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: apiKey,
        message: {
          html: options.content,
          subject: options.subject,
          from_email: fromEmail,
          from_name: fromName,
          to: recipients.map((email) => ({ email, type: "to" })),
          auto_text: true,
        },
      }),
    });

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const errBody = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as MandrillErrorBody) : null;
      return {
        success: false,
        error: mapMandrillApiError(errBody, `Mailchimp Transactional send failed (${response.status})`),
      };
    }

    if (!Array.isArray(parsed)) {
      return { success: false, error: "Unexpected response from Mailchimp Transactional send." };
    }

    const results = parsed as MandrillSendResult[];
    const successStatuses = new Set(["sent", "queued", "scheduled"]);
    const failures = results.filter((r) => !successStatuses.has(r.status));

    if (failures.length > 0) {
      const first = failures[0];
      return {
        success: false,
        error: mapRejectReason(first.reject_reason) + (first.email ? ` (${first.email})` : ""),
      };
    }

    return {
      success: true,
      messageId: results[0]?._id,
      provider: "mailchimp",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
