/**
 * Customer app: ringtone playback helper (behind on_demand flag).
 * When on_demand is enabled, use signed URL and expo-av to play for ring_duration_seconds.
 * Stub: no expo-av dependency required until feature is enabled.
 */

import type { OnDemandModuleConfig } from "@/lib/config-bundle";

export interface RingtoneController {
  stop: () => void;
}

export async function playRingtone(
  _config: OnDemandModuleConfig,
  _signedUrl?: string
): Promise<RingtoneController> {
  if (!_config.enabled || !_config.ringtone_asset_path) {
    return { stop: () => {} };
  }
  return { stop: () => {} };
}
