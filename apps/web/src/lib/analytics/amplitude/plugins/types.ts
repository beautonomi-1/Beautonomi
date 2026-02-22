/**
 * Amplitude Plugin Types
 */

import { AmplitudeEvent } from "../types";

export interface AmplitudePlugin {
  name: string;
  execute(event: AmplitudeEvent): Promise<AmplitudeEvent> | AmplitudeEvent;
}

export interface PluginContext {
  config?: {
    debug_mode?: boolean;
    sampling_rate?: number;
  };
  portal?: "client" | "provider" | "admin";
  route?: string;
}
