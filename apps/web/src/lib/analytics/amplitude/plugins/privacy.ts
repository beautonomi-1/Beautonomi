/**
 * Privacy Plugin
 * Redacts PII from event properties
 */

import { AmplitudePlugin, PluginContext } from "./types";
import { AmplitudeEvent } from "../types";

const PII_DENYLIST = [
  "email",
  "phone",
  "phone_number",
  "message",
  "content",
  "notes",
  "special_requests",
  "address_line1",
  "address_line2",
  "address",
  "full_address",
  "password",
  "credit_card",
  "card_number",
  "ssn",
  "social_security_number",
];

export class PrivacyPlugin implements AmplitudePlugin {
  name = "privacy";
  private context: PluginContext;

  constructor(context: PluginContext) {
    this.context = context;
  }

  execute(event: AmplitudeEvent): AmplitudeEvent {
    const cleaned: AmplitudeEvent = { ...event };

    // Clean event properties
    if (cleaned.event_properties) {
      cleaned.event_properties = this.redactObject(cleaned.event_properties);
    }

    // Clean user properties
    if (cleaned.user_properties) {
      cleaned.user_properties = this.redactObject(cleaned.user_properties);
    }

    // Log redaction in debug mode
    if (this.context.config?.debug_mode) {
      const originalProps = JSON.stringify(event.event_properties || {});
      const cleanedProps = JSON.stringify(cleaned.event_properties || {});
      if (originalProps !== cleanedProps) {
        console.log("[Amplitude Privacy] Redacted PII from event properties");
      }
    }

    return cleaned;
  }

  private redactObject(obj: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Check if key matches denylist
      if (PII_DENYLIST.some((denied) => lowerKey.includes(denied))) {
        // Skip this property
        continue;
      }

      // Recursively clean nested objects
      if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
        cleaned[key] = this.redactObject(value);
      } else if (Array.isArray(value)) {
        // Clean array items if they're objects
        cleaned[key] = value.map((item) =>
          item && typeof item === "object" && !(item instanceof Date)
            ? this.redactObject(item)
            : item
        );
      } else {
        cleaned[key] = value;
      }
    }

    return cleaned;
  }
}
