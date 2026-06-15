const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

/**
 * OneSignal opens notification launch URLs in the system browser by default on
 * Android. Disable that so the JS click listener routes in-app (Expo Router).
 */
module.exports = function withOneSignalDisableLaunchUrl(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);

    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      "com.onesignal.NotificationOpened.DEFAULT",
      "DISABLE",
    );

    return cfg;
  });
};
