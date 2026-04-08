const path = require("path");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getSentryExpoConfig(projectRoot);

// Preserve Expo defaults and add monorepo root (expo doctor expects default watchFolders)
config.watchFolders = [...(config.watchFolders || [projectRoot]), monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Redirect expo-router/entry to project index only for bundle entry (not when index.ts imports it); avoids Metro 500 on web.
// Use path-robust "is from our index?" so Windows (casing, slashes) never causes a redirect loop or broken bundle.
const projectIndex = path.resolve(projectRoot, "index.ts");
const defaultResolve = config.resolver.resolveRequest;

function normalizePath(p) {
  if (!p) return "";
  const resolved = path.isAbsolute(p) ? p : path.resolve(projectRoot, p);
  const unified = resolved.replace(/\\/g, "/");
  return process.platform === "win32" ? unified.toLowerCase() : unified;
}

const indexNorm = normalizePath(projectIndex);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isExpoRouterEntry =
    moduleName === "expo-router/entry" ||
    (String(moduleName).includes("expo-router") && String(moduleName).includes("entry"));
  const originPath = context.originModulePath
    ? path.resolve(projectRoot, context.originModulePath)
    : null;
  const originNorm = normalizePath(originPath);
  const isFromIndex = originNorm === indexNorm;

  if (platform === "web" && isExpoRouterEntry && !isFromIndex) {
    return { type: "sourceFile", filePath: projectIndex };
  }
  return defaultResolve
    ? defaultResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

// Process Tailwind/NativeWind so className styles apply (required for NativeWind v4)
module.exports = withNativeWind(config, { input: "./global.css" });
