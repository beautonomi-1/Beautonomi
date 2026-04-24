export type PreferenceOption = {
  id: string;
  type: "language" | "currency" | "timezone";
  code: string | null;
  name: string;
  display_order: number;
  metadata?: Record<string, unknown>;
};

export type Preferences = {
  language: { code: string; name: string } | null;
  currency: { code: string; name: string } | null;
  timezone: { code: string; name: string } | null;
};

export type PreferencesPageInitial = {
  options: {
    languages: PreferenceOption[];
    currencies: PreferenceOption[];
    timezones: PreferenceOption[];
  };
  preferences: Preferences;
};
