/**
 * Analytics types - shared across web + RN
 */

export interface AmplitudeConfig {
  api_key_public: string | null;
  environment: "production" | "staging" | "development";
  enabled_client_portal: boolean;
  enabled_provider_portal: boolean;
  enabled_admin_portal: boolean;
  guides_enabled: boolean;
  surveys_enabled: boolean;
  sampling_rate: number;
  debug_mode: boolean;
}

export interface AnalyticsTrackOptions {
  event_type: string;
  event_properties?: Record<string, unknown>;
  user_properties?: Record<string, unknown>;
}

export interface IAnalytics {
  track(options: AnalyticsTrackOptions): void;
  identify(userId: string, userProperties?: Record<string, unknown>): void;
  setUserProperties(properties: Record<string, unknown>): void;
  reset(): void;
}
