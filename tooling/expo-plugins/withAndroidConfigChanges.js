const { withAndroidManifest } = require(require.resolve("expo/config-plugins", {
  paths: [process.cwd()],
}));

/**
 * Adds critical system-event config changes to the main React Native activity so
 * Android does NOT destroy and recreate the activity when the user changes their
 * device locale, time, font scale, or screen density.
 *
 * Without these entries a LOCALE_CHANGED / TIME_SET / DATE_CHANGED system broadcast
 * (e.g. user edits device settings while the app is foregrounded) causes Android to
 * tear down the entire React Native / Fabric bridge and rebuild it, saturating the
 * JS thread and triggering an ANR.
 *
 * React Native handles these config changes internally (i18n re-renders via
 * useTranslation, Dimensions API fires its own event, etc.), so skipping
 * Android's recreation is safe.
 */
module.exports = function withAndroidConfigChanges(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = manifest.manifest?.application?.[0];
    if (!app) return cfg;

    const activities = app.activity ?? [];
    const mainActivity = activities.find(
      (a) =>
        a.$?.["android:name"] === ".MainActivity" ||
        a.$?.["android:name"] === "com.beautonomi.partner.MainActivity" ||
        // Expo SDK ≥51 uses the generic ReactActivity name
        a.$?.["android:name"]?.endsWith("MainActivity"),
    );

    if (!mainActivity) return cfg;

    const REQUIRED_CONFIG_CHANGES = [
      "keyboard",
      "keyboardHidden",
      "orientation",
      "screenSize",
      "screenLayout",
      "uiMode",
      "locale",
      "layoutDirection",
      "fontScale",
      "density",
      "smallestScreenSize",
    ].join("|");

    // Only write when the attribute is missing or doesn't cover locale/fontScale yet.
    const current = mainActivity.$?.["android:configChanges"] ?? "";
    const hasLocale = current.includes("locale");
    const hasFontScale = current.includes("fontScale");
    if (!hasLocale || !hasFontScale) {
      mainActivity.$ = {
        ...mainActivity.$,
        "android:configChanges": REQUIRED_CONFIG_CHANGES,
      };
    }

    return cfg;
  });
};
