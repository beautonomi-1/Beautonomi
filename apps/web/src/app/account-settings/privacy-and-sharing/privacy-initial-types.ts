export type PrivacySettingsState = {
  accountVisibility: boolean;
  profileInformation: boolean;
  readReceipts: boolean;
  includeInSearchEngines: boolean;
  showHomeCity: boolean;
  showTripType: boolean;
  showLengthOfStay: boolean;
  analytics_consent: boolean;
};

export type DataExportStatusState = {
  isReady: boolean;
  isPending: boolean;
  downloadUrl?: string;
  fileName?: string;
};

export type PrivacyPageInitial = {
  settings: PrivacySettingsState;
  dataExportStatus: DataExportStatusState;
};
