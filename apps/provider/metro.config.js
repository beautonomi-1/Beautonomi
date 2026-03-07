const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Preserve Expo defaults and add monorepo root (expo doctor expects default watchFolders)
config.watchFolders = [...(config.watchFolders || [projectRoot]), monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Redirect expo-router/entry to project index only for bundle entry (not when index.ts imports it); avoids Metro 500 on web.
const projectIndex = path.resolve(projectRoot, "index.ts");
const defaultResolve = config.resolver.resolveRequest;
const norm = (p) => (p ? path.resolve(p).replace(/\\/g, "/") : "");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const originNorm = norm(context.originModulePath);
  const indexNorm = norm(projectIndex);
  const isFromIndex = originNorm === indexNorm || (originNorm && originNorm.endsWith("/index.ts"));
  if (
    platform === "web" &&
    !isFromIndex &&
    (moduleName === "expo-router/entry" || (String(moduleName).includes("expo-router") && String(moduleName).includes("entry")))
  ) {
    return { type: "sourceFile", filePath: projectIndex };
  }
  return defaultResolve ? defaultResolve(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

// Process Tailwind/NativeWind so className styles apply (required for NativeWind v4)
module.exports = withNativeWind(config, { input: "./global.css" });
