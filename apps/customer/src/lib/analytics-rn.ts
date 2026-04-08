/**
 * Platform-specific analytics entry: use react-native.web on web to avoid
 * @amplitude/plugin-engagement-react-native (getEnforcing crash on React 19 + Metro).
 */
import { Platform } from "react-native";

// Conditional platform entry; require() needed for Metro bundler resolution
/* eslint-disable @typescript-eslint/no-require-imports */
const analyticsRN =
  Platform.OS === "web"
    ? require("@beautonomi/analytics/react-native.web")
    : require("@beautonomi/analytics/react-native");
/* eslint-enable @typescript-eslint/no-require-imports */

export const initAnalytics = analyticsRN.initAnalytics;
export const handleEngagementURL = analyticsRN.handleEngagementURL;
export const bootEngagement = analyticsRN.bootEngagement;
export const getAnalyticsClient = analyticsRN.getAnalyticsClient;
export const isEngagementEnabled = analyticsRN.isEngagementEnabled;
export const getMobileAnalyticsAttribution = analyticsRN.getMobileAnalyticsAttribution;
export const captureMarketingAttributionFromUrl = analyticsRN.captureMarketingAttributionFromUrl;
export const getCachedFirstTouchForIdentify = analyticsRN.getCachedFirstTouchForIdentify;
