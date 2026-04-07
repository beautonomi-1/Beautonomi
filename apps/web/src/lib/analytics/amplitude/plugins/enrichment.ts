/**
 * Enrichment Plugin
 * Adds common properties to **event_properties** so Amplitude receives them
 * (the browser SDK only forwards event_properties to track(), not top-level AmplitudeEvent fields).
 */

import { AmplitudePlugin, PluginContext } from "./types";
import { AmplitudeEvent } from "../types";
import { getMarketingAttributionForEvents } from "../marketing-attribution";

function browserDeviceType(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

export class EnrichmentPlugin implements AmplitudePlugin {
  name = "enrichment";
  private context: PluginContext;

  constructor(context: PluginContext) {
    this.context = context;
  }

  execute(event: AmplitudeEvent): AmplitudeEvent {
    const ep = { ...(event.event_properties ?? {}) };

    const app_version = process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0";
    if (ep.app_version == null) ep.app_version = app_version;

    if (ep.platform == null) {
      ep.platform = typeof window !== "undefined" ? "web" : "server";
    }

    if (ep.device_type == null && typeof window !== "undefined") {
      ep.device_type = browserDeviceType();
    }

    if (this.context.portal && ep.portal == null) {
      ep.portal = this.context.portal;
    }

    if (this.context.route && ep.route == null) {
      ep.route = this.context.route;
    }

    if (typeof window !== "undefined" && document.referrer && ep.referrer == null) {
      ep.referrer = document.referrer;
    }

    if (typeof window !== "undefined" && ep.timezone == null) {
      try {
        ep.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        /* ignore */
      }
    }

    if (typeof window !== "undefined") {
      const mkt = getMarketingAttributionForEvents();
      for (const [k, v] of Object.entries(mkt)) {
        if (ep[k] == null) ep[k] = v;
      }
    }

    return {
      ...event,
      event_properties: ep,
    };
  }
}
