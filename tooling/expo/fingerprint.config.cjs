/**
 * Shared Expo fingerprint config for customer + provider.
 *
 * EAS production builds fail when the hash computed on the submitter
 * (GitHub / local) does not match the hash EAS computes after install/prebuild.
 * In this pnpm monorepo that mismatch is:
 *   1. CNG `ios/` / `android/` exist only after EAS prebuild (`bareNativeDir`)
 *   2. pnpm virtual-store folders include a peer-dep hash that differs
 *      between machines even when expo-router native sources are identical
 *
 * Native changes are still detected via package.json, app.config plugins,
 * and autolinking *contents* (paths normalized below).
 *
 * @type {import('expo/fingerprint').Config}
 */
function normalizePnpmAutolinkingPaths(text) {
  return text
    .replace(/_[a-f0-9]{32}(?=\/node_modules)/g, "")
    .replace(/\\/g, "/");
}

module.exports = {
  ignorePaths: [
    "ios",
    "ios/**/*",
    "android",
    "android/**/*",
    "node_modules/.pnpm/**",
    "../../node_modules/.pnpm/**",
    "**/node_modules/.pnpm/**",
  ],
  sourceSkips: ["PackageJsonScriptsAll"],
  fileHookTransform: (source, chunk) => {
    if (chunk == null) return chunk;
    if (
      source.type === "contents" &&
      typeof source.id === "string" &&
      source.id.includes("Autolinking")
    ) {
      const text = typeof chunk === "string" ? chunk : chunk.toString();
      return normalizePnpmAutolinkingPaths(text);
    }
    return chunk;
  },
};
