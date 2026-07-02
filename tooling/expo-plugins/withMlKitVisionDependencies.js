const { withAndroidManifest } = require(
  require.resolve("expo/config-plugins", { paths: [process.cwd()] }),
);

const ML_KIT_META_NAME = "com.google.mlkit.vision.DEPENDENCIES";

/**
 * Resolves the Android manifest merger conflict between expo-dev-launcher and
 * idensic-mobile-sdk (Sumsub) over the com.google.mlkit.vision.DEPENDENCIES
 * meta-data attribute.
 *
 * - expo-dev-launcher declares:  android:value="barcode_ui"
 * - idensic-mobile-sdk declares: android:value="face"
 *
 * Manifest merger fails because both entries exist and neither carries
 * tools:replace. This plugin injects a single app-level meta-data entry
 * with the union value and tools:replace="android:value" so the merger uses
 * our single declaration and stops failing.
 */
module.exports = function withMlKitVisionDependencies(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // xmlns:tools must be declared on the root <manifest> element for
    // tools:replace to be recognised by the manifest merger.
    manifest.$ = {
      ...manifest.$,
      "xmlns:tools": "http://schemas.android.com/tools",
    };

    const app = manifest.application?.[0];
    if (!app) return cfg;

    const metaDataList = (app["meta-data"] ?? []);
    const idx = metaDataList.findIndex(
      (m) => m?.$?.["android:name"] === ML_KIT_META_NAME,
    );

    const entry = {
      "android:name": ML_KIT_META_NAME,
      // Union of expo-dev-launcher (barcode_ui) and idensic-mobile-sdk (face).
      "android:value": "barcode_ui,face",
      "tools:replace": "android:value",
    };

    if (idx >= 0) {
      metaDataList[idx].$ = { ...metaDataList[idx].$, ...entry };
    } else {
      app["meta-data"] = [...metaDataList, { $: entry }];
    }

    return cfg;
  });
};
