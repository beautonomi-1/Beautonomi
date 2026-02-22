/**
 * Enrichment Plugin
 * Adds common properties to events: app_version, environment, portal, route, referrer, timezone, provider_id
 */

import { AmplitudePlugin, PluginContext } from "./types";
import { AmplitudeEvent } from "../types";

export class EnrichmentPlugin implements AmplitudePlugin {
  name = "enrichment";
  private context: PluginContext;

  constructor(context: PluginContext) {
    this.context = context;
  }

  execute(event: AmplitudeEvent): AmplitudeEvent {
    const enriched: AmplitudeEvent = { ...event };

    // Add app version (from env or PlatformSettingsProvider)
    if (!enriched.app_version) {
      enriched.app_version = process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0";
    }

    // Add environment
    if (!enriched.platform) {
      enriched.platform = typeof window !== "undefined" ? "web" : "server";
    }

    // Add portal (from context)
    if (this.context.portal && !enriched.event_properties?.portal) {
      enriched.event_properties = {
        ...enriched.event_properties,
        portal: this.context.portal,
      };
    }

    // Add route (from context)
    if (this.context.route && !enriched.event_properties?.route) {
      enriched.event_properties = {
        ...enriched.event_properties,
        route: this.context.route,
      };
    }

    // Add referrer (client-side only)
    if (typeof window !== "undefined" && document.referrer && !enriched.event_properties?.referrer) {
      enriched.event_properties = {
        ...enriched.event_properties,
        referrer: document.referrer,
      };
    }

    // Add timezone (client-side only)
    if (typeof window !== "undefined" && !enriched.event_properties?.timezone) {
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        enriched.event_properties = {
          ...enriched.event_properties,
          timezone,
        };
      } catch {
        // Ignore timezone errors
      }
    }

    return enriched;
  }
}
