const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * §Dual-role launch mitigation (2026-04-17): Android 11+ requires apps to
 * declare which other packages/schemes they need to interrogate via a
 * <queries> block in AndroidManifest.xml. Without this:
 *   - Linking.canOpenURL("provider://") always returns false even when the
 *     Partner app is installed
 *   - Linking.openURL("provider://") silently fails
 *
 * This plugin injects:
 *   <queries>
 *     <package android:name="com.beautonomi.partner" />
 *     <intent>
 *       <action android:name="android.intent.action.VIEW" />
 *       <data android:scheme="provider" />
 *     </intent>
 *   </queries>
 *
 * ...so the customer app can surface the "Open Partner app" deep link
 * reliably on all supported Android versions.
 *
 * Usage (app.config.js):
 *   plugins: [
 *     ["./plugins/android-sibling-app-queries", {
 *       packageName: "com.beautonomi.partner",
 *       scheme: "provider",
 *     }],
 *   ]
 */
module.exports = function withAndroidSiblingAppQueries(config, props) {
  const packageName = props?.packageName;
  const scheme = props?.scheme;
  if (!packageName || !scheme) {
    throw new Error(
      "android-sibling-app-queries: both `packageName` and `scheme` are required.",
    );
  }
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!manifest.queries) {
      manifest.queries = [];
    }
    if (!Array.isArray(manifest.queries)) {
      manifest.queries = [manifest.queries];
    }

    const hasPackage = manifest.queries.some((q) =>
      Array.isArray(q.package)
        ? q.package.some((p) => p?.$?.["android:name"] === packageName)
        : false,
    );
    const hasScheme = manifest.queries.some((q) =>
      Array.isArray(q.intent)
        ? q.intent.some((it) =>
            Array.isArray(it.data)
              ? it.data.some((d) => d?.$?.["android:scheme"] === scheme)
              : false,
          )
        : false,
    );

    if (!hasPackage || !hasScheme) {
      manifest.queries.push({
        package: hasPackage ? [] : [{ $: { "android:name": packageName } }],
        intent: hasScheme
          ? []
          : [
              {
                action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
                data: [{ $: { "android:scheme": scheme } }],
              },
            ],
      });
    }
    return cfg;
  });
};
