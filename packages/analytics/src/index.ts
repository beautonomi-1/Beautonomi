/**
 * Shared analytics interface - implementations (web/RN) inject SDK
 */

export { fetchAmplitudeConfig, clearAmplitudeConfigCache } from "./config";
export type {
  AmplitudeConfig,
  AnalyticsTrackOptions,
  IAnalytics,
} from "./types";
