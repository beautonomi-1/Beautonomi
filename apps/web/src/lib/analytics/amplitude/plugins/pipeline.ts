/**
 * Plugin Pipeline
 * Executes plugins in sequence: enrichment → privacy → reliability → debug
 */

import { AmplitudePlugin } from "./types";
import { AmplitudeEvent } from "../types";
import { EnrichmentPlugin } from "./enrichment";
import { PrivacyPlugin } from "./privacy";
import { ReliabilityPlugin } from "./reliability";
import { DebugPlugin } from "./debug";
import { PluginContext } from "./types";

export class PluginPipeline {
  private plugins: AmplitudePlugin[] = [];

  constructor(context: PluginContext) {
    const enableDebugPlugin =
      process.env.NODE_ENV !== "production" && Boolean(context.config?.debug_mode);

    // Initialize plugins in order
    this.plugins = [
      new EnrichmentPlugin(context),
      new PrivacyPlugin(context),
      new ReliabilityPlugin(context),
      ...(enableDebugPlugin ? [new DebugPlugin(context)] : []),
    ];
  }

  async execute(event: AmplitudeEvent): Promise<AmplitudeEvent> {
    let processedEvent = event;

    // Execute plugins in sequence
    for (const plugin of this.plugins) {
      const result = plugin.execute(processedEvent);
      processedEvent = result instanceof Promise ? await result : result;
    }

    return processedEvent;
  }

  destroy() {
    // Cleanup plugins that need it
    for (const plugin of this.plugins) {
      if (plugin instanceof ReliabilityPlugin) {
        plugin.destroy();
      }
    }
  }
}
