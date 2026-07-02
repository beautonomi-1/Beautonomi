const { withAppBuildGradle } = require(
  require.resolve("expo/config-plugins", { paths: [process.cwd()] }),
);

// Marker so the injected block is only added once (config plugins can run
// repeatedly across prebuild invocations).
const MARKER = "// beautonomi:commonmark-dedupe";

// commonmark was relocated from the `com.atlassian.commonmark` group to
// `org.commonmark` (same `org.commonmark.*` Java package). Different native
// SDKs in the graph pull in both the old relocated 0.13.0 artifact and the
// modern 0.21.0 artifact, so Android's checkReleaseDuplicateClasses fails with
// "Duplicate class org.commonmark.* found in modules commonmark-0.13.0.jar ...
// and commonmark-0.21.0.jar". iOS has no equivalent classpath dedupe, which is
// why only the Android bundleRelease task fails.
//
// We drop the old relocated coordinate everywhere and substitute any request
// for it onto the modern coordinate, leaving a single commonmark artifact on
// the classpath. 0.21.0 keeps the same `org.commonmark.*` package/class names,
// so consumers compiled against the relocated 0.13.0 still link.
const DEDUPE_BLOCK = `
${MARKER}
configurations.all {
    exclude group: "com.atlassian.commonmark", module: "commonmark"
    resolutionStrategy.dependencySubstitution {
        substitute module("com.atlassian.commonmark:commonmark") using module("org.commonmark:commonmark:0.21.0")
    }
}
`;

module.exports = function withAndroidCommonmarkDedupe(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        "[withAndroidCommonmarkDedupe] Expected android/app/build.gradle to be Groovy.",
      );
    }
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents = `${cfg.modResults.contents.trimEnd()}\n${DEDUPE_BLOCK}`;
    }
    return cfg;
  });
};
