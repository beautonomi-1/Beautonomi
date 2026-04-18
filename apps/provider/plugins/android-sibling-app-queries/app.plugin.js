const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Android 11+ WrongAppScreen / sibling deep links: declare <queries> (peer
 * package + VIEW intent for scheme) or Linking.canOpenURL / openURL fail for
 * the other app.
 *
 * iOS uses LSApplicationQueriesSchemes in app.config.js (same `scheme` value
 * here); expo config does not always reflect withInfoPlist, so plist entries
 * stay explicit in app.config.
 *
 * Props: packageName = sibling Android applicationId, scheme = sibling URL
 * scheme (no "://"), must match ios.infoPlist.LSApplicationQueriesSchemes.
 */
module.exports = function withSiblingAppQueries(config, props) {
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

    if (!hasPackage) {
      manifest.queries.push({
        package: [{ $: { "android:name": packageName } }],
      });
    }
    if (!hasScheme) {
      manifest.queries.push({
        intent: [
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
