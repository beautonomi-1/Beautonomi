const fs = require("fs");
const path = require("path");

const { withDangerousMod } = require(require.resolve("expo/config-plugins", {
  paths: [process.cwd()],
}));

/**
 * Expo SDK 54 template sets networkTimeout=10000 on the Gradle wrapper.
 * Transient 504s from the distribution CDN are less likely to win the race
 * with a longer read timeout (still bounded by server behaviour).
 */
module.exports = function withGradleWrapperResilience(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const propsPath = path.join(
        cfg.modRequest.platformProjectRoot,
        "gradle/wrapper/gradle-wrapper.properties",
      );
      if (!fs.existsSync(propsPath)) {
        return cfg;
      }
      let body = fs.readFileSync(propsPath, "utf8");
      if (/^networkTimeout=/m.test(body)) {
        body = body.replace(/^networkTimeout=\d+/m, "networkTimeout=120000");
      } else {
        body = `${body.trimEnd()}\nnetworkTimeout=120000\n`;
      }
      fs.writeFileSync(propsPath, body);
      return cfg;
    },
  ]);
};
