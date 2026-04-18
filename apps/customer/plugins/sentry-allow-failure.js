const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SENTRY_PHASE_NAME = "Upload Debug Symbols to Sentry";
const BUNDLE_PHASE_NAME = "Bundle React Native code and images";
const SOURCE_ENV_LINE =
  'source "${SRCROOT}/.xcode.env" 2>/dev/null || true';
// Set in script body so child scripts (e.g. sentry-xcode-debug-files.sh) see it; EAS/pnpm run from ios/ and require.resolve fails.
const EXPORT_CLI_PATH_LINE =
  'export SENTRY_CLI_PACKAGE_PATH="${SRCROOT}/../node_modules/@sentry/cli"';

/** Return the first .xcodeproj dir name under iosRoot that has project.pbxproj, or null. */
function findXcodeProjectName(iosRoot) {
  if (!fs.existsSync(iosRoot)) return null;
  const entries = fs.readdirSync(iosRoot, { withFileTypes: true }) || [];
  for (const e of entries) {
    if (e.isDirectory() && e.name.endsWith(".xcodeproj")) {
      const pbxPath = path.join(iosRoot, e.name, "project.pbxproj");
      if (fs.existsSync(pbxPath)) return e.name.replace(/\.xcodeproj$/, "");
    }
  }
  return null;
}

/** Find the start index of the Sentry phase script content (after shellScript = ") in pbx. Returns { scriptIdx } or null. */
function findSentryScriptIndex(pbx) {
  // 1) Try by phase name (Expo/Sentry add "Upload Debug Symbols to Sentry")
  const phaseMarker = `name = "${SENTRY_PHASE_NAME}"`;
  let idx = pbx.indexOf(phaseMarker);
  if (idx !== -1) {
    const afterPhase = pbx.slice(idx);
    const scriptMatch = afterPhase.match(/shellScript\s*=\s*"/);
    if (scriptMatch) {
      return idx + scriptMatch.index + scriptMatch[0].length;
    }
  }
  // 2) Fallback: find any shellScript that runs the Sentry debug-files script
  const sentryScriptMarker = "sentry-xcode-debug-files";
  idx = pbx.indexOf(sentryScriptMarker);
  if (idx !== -1) {
    const before = pbx.slice(0, idx);
    const scriptOpen = before.lastIndexOf('shellScript = "');
    if (scriptOpen !== -1) {
      const contentStart = scriptOpen + 'shellScript = "'.length;
      return contentStart;
    }
  }
  return null;
}

/** Find shellScript start for "Bundle React Native code and images" (Sentry wraps via sentry-xcode.sh). */
function findBundleScriptIndex(pbx) {
  const phaseMarker = `name = "${BUNDLE_PHASE_NAME}"`;
  let idx = pbx.indexOf(phaseMarker);
  if (idx !== -1) {
    const afterPhase = pbx.slice(idx);
    const scriptMatch = afterPhase.match(/shellScript\s*=\s*"/);
    if (scriptMatch) {
      return idx + scriptMatch.index + scriptMatch[0].length;
    }
  }
  const sentryMarker = "sentry-xcode.sh";
  idx = pbx.indexOf(sentryMarker);
  if (idx !== -1) {
    const before = pbx.slice(0, idx);
    const scriptOpen = before.lastIndexOf('shellScript = "');
    if (scriptOpen !== -1) {
      return scriptOpen + 'shellScript = "'.length;
    }
  }
  return null;
}

function prependSourceEnvToPhase(pbx, scriptIdx) {
  // Only scan the start of this phase's script. A long slice can include the next
  // build phase (e.g. dSYM already patched) and falsely look "already patched".
  const restHead = pbx.slice(scriptIdx, scriptIdx + 180);
  if (restHead.includes("${SRCROOT}/.xcode.env")) {
    return pbx;
  }
  const before = pbx.slice(0, scriptIdx);
  const after = pbx.slice(scriptIdx);
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const toInsert = esc(SOURCE_ENV_LINE) + "\\n" + esc(EXPORT_CLI_PATH_LINE) + "\\n";
  return before + toInsert + after;
}

/**
 * Apply .xcode.env and pbxproj changes. Used by the config plugin and by local test.
 * @param {string} iosRoot - Path to ios folder
 * @param {string} [projectName] - Xcode project name (e.g. "customer"); if omitted, discovered from iosRoot
 */
function applySentryAllowFailure(iosRoot, projectName) {
  const envPath = path.join(iosRoot, ".xcode.env");
  const lines = [
    // EAS `env` is not passed to Xcode Run Script phases; sentry-xcode.sh checks this literal `true`.
    "export SENTRY_DISABLE_AUTO_UPLOAD=true",
    "export SENTRY_ALLOW_FAILURE=true",
    // So the "Upload Debug Symbols to Sentry" phase can find @sentry/cli when run from ios/ (EAS/pnpm).
    'export SENTRY_CLI_PACKAGE_PATH="${SRCROOT}/../node_modules/@sentry/cli"',
    // Node require.resolve('@sentry/cli/package.json') runs from ios/; pnpm layout needs NODE_PATH to resolve it.
    'export NODE_PATH="${SRCROOT}/../node_modules"',
  ];
  let content = "";
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf8");
  }
  let changed = false;
  const keyForLine = (line) => {
    if (line.includes("SENTRY_DISABLE_AUTO_UPLOAD")) return "SENTRY_DISABLE_AUTO_UPLOAD";
    if (line.includes("SENTRY_ALLOW_FAILURE")) return "SENTRY_ALLOW_FAILURE";
    if (line.includes("SENTRY_CLI_PACKAGE_PATH")) return "SENTRY_CLI_PACKAGE_PATH";
    if (line.includes("NODE_PATH")) return "NODE_PATH";
    return null;
  };
  for (const line of lines) {
    const key = keyForLine(line);
    if (!key || content.includes(key)) continue;
    const suffix = content.trimEnd() ? "\n" + line + "\n" : line + "\n";
    content = content.trimEnd() + suffix;
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(envPath, content, "utf8");
  }

  const resolvedName = projectName || findXcodeProjectName(iosRoot);
  if (!resolvedName) return;
  const pbxPath = path.join(iosRoot, resolvedName + ".xcodeproj", "project.pbxproj");
  if (!fs.existsSync(pbxPath)) {
    return;
  }
  let pbx = fs.readFileSync(pbxPath, "utf8");
  let modified = false;
  // Patch "Bundle React Native" before dSYM (earlier in project.pbxproj) so indices stay intuitive.
  const bundleIdx = findBundleScriptIndex(pbx);
  if (bundleIdx != null) {
    const next = prependSourceEnvToPhase(pbx, bundleIdx);
    if (next !== pbx) {
      pbx = next;
      modified = true;
    }
  }
  const dsymIdx = findSentryScriptIndex(pbx);
  if (dsymIdx != null) {
    const next = prependSourceEnvToPhase(pbx, dsymIdx);
    if (next !== pbx) {
      pbx = next;
      modified = true;
    }
  }
  if (modified) {
    fs.writeFileSync(pbxPath, pbx, "utf8");
  }
}

/**
 * 1) Injects SENTRY_DISABLE_AUTO_UPLOAD, SENTRY_ALLOW_FAILURE, and CLI path into ios/.xcode.env.
 * 2) Prepends sourcing of .xcode.env to the Sentry-related Run Script phases so variables are visible
 *    (EAS `env` is not passed to Xcode script phases). Required for sentry-xcode.sh (bundle) and
 *    sentry-xcode-debug-files.sh (dSYM) when SENTRY_AUTH_TOKEN is absent.
 */
function withSentryAllowFailure(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const projectName = config.slug || config.name || null;
      applySentryAllowFailure(iosRoot, projectName);
      return config;
    },
  ]);
}

module.exports = withSentryAllowFailure;
module.exports.applySentryAllowFailure = applySentryAllowFailure;
