const fs = require("fs");
const path = require("path");

const { withDangerousMod } = require(
  require.resolve("expo/config-plugins", { paths: [process.cwd()] }),
);

const COCOAPODS_CDN = "source 'https://cdn.cocoapods.org/'";
const SUMSUB_SPECS = "source 'https://github.com/SumSubstance/Specs.git'";

/**
 * Prepends CocoaPods source declarations to the generated ios/Podfile so that
 * `pod install` can resolve IdensicMobileSDK from the SumSubstance Specs repo.
 *
 * expo-build-properties `iosPodfileSourceRepos` is not a real option and is
 * silently ignored at build time — this plugin is the correct approach.
 *
 * CocoaPods requires explicit source declarations whenever any pod resolves
 * from a non-CDN spec repo. Once any source is declared the CDN must also be
 * listed, otherwise every other pod (from cdn.cocoapods.org) fails to resolve.
 */
module.exports = function withPodfileSources(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile",
      );
      if (!fs.existsSync(podfilePath)) {
        return cfg;
      }

      let contents = fs.readFileSync(podfilePath, "utf8");

      // Idempotent: skip if the SumSubstance source is already present.
      if (contents.includes("github.com/SumSubstance/Specs.git")) {
        return cfg;
      }

      contents = `${COCOAPODS_CDN}\n${SUMSUB_SPECS}\n\n${contents}`;
      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};
