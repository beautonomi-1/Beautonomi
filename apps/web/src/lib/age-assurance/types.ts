export type AgeBand = "under_13" | "13_17" | "18_plus" | "unknown";

export type AgeBandSource =
  | "verified_dob"
  | "declared_dob"
  | "device_signal"
  | "under_age_flag"
  | "none";

export interface ResolvedAgeBand {
  band: AgeBand;
  source: AgeBandSource;
}

export type SocialAgeGateMode = "off" | "log" | "enforce";

export interface SafetySettingsStored {
  restricted_mode?: boolean;
  hide_social_feed?: boolean;
  disable_comments_likes?: boolean;
  disable_direct_messaging?: boolean;
  sensitive_content_filter?: boolean;
  require_device_auth?: boolean;
}

export interface EffectiveSafetySetting {
  value: boolean;
  locked: boolean;
}

export interface EffectiveSafetySettings {
  restricted_mode: EffectiveSafetySetting;
  hide_social_feed: EffectiveSafetySetting;
  disable_comments_likes: EffectiveSafetySetting;
  disable_direct_messaging: EffectiveSafetySetting;
  sensitive_content_filter: EffectiveSafetySetting;
  require_device_auth: EffectiveSafetySetting;
}

export type SocialCapability =
  | "ugc_create"
  | "comment"
  | "like_or_save"
  | "direct_message"
  | "review";
