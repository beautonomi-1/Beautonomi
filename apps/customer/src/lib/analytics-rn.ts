/**
 * Platform-specific analytics entry: use react-native.web on web to avoid
 * @amplitude/plugin-engagement-react-native (getEnforcing crash on React 19 + Metro).
 */
import { Platform } from "react-native";

const analyticsRN =
  Platform.OS === "web"
    ? require("@beautonomi/analytics/react-native.web")
    : require("@beautonomi/analytics/react-native");

export const initAnalytics = analyticsRN.initAnalytics;
export const handleEngagementURL = analyticsRN.handleEngagementURL;
export const bootEngagement = analyticsRN.bootEngagement;
export const getAnalyticsClient = analyticsRN.getAnalyticsClient;
export const isEngagementEnabled = analyticsRN.isEngagementEnabled;
