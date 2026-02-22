/**
 * Debug Plugin
 * Console logs events when debug_mode is enabled
 */

import { AmplitudePlugin, PluginContext } from "./types";
import { AmplitudeEvent } from "../types";

export class DebugPlugin implements AmplitudePlugin {
  name = "debug";
  private context: PluginContext;

  constructor(context: PluginContext) {
    this.context = context;
  }

  execute(event: AmplitudeEvent): AmplitudeEvent {
    if (this.context.config?.debug_mode) {
      console.log(`[Amplitude Debug] ${event.event_type}`, {
        user_id: event.user_id,
        device_id: event.device_id,
        event_properties: event.event_properties,
        user_properties: event.user_properties,
      });
    }

    return event;
  }
}
