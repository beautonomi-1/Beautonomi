/**
 * Local test for sentry-allow-failure plugin logic (no macOS needed).
 * Run: node plugins/sentry-allow-failure.test.js
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const { applySentryAllowFailure } = require("./sentry-allow-failure.js");

const SENTRY_PHASE_NAME = "Upload Debug Symbols to Sentry";
const BUNDLE_PHASE_NAME = "Bundle React Native code and images";

const FAKE_PBXPROJ = `// !$*UTF8*$!
{
	archiveVersion = 1;
	objects = {
		BUNDLE999 = {
			isa = PBXShellScriptBuildPhase;
			buildActionMask = 255;
			files = ();
			inputPaths = ();
			name = "${BUNDLE_PHASE_NAME}";
			outputPaths = ();
			runOnlyForDeploymentPostprocessing = 0;
			shellPath = /bin/sh;
			shellScript = "/bin/sh sentry-xcode.sh ./scripts/react-native-xcode.sh";
		};
		ABC123 = {
			isa = PBXShellScriptBuildPhase;
			buildActionMask = 255;
			files = ();
			inputPaths = ();
			name = "${SENTRY_PHASE_NAME}";
			outputPaths = ();
			runOnlyForDeploymentPostprocessing = 0;
			shellPath = /bin/sh;
			shellScript = "echo upload";
		};
	};
	rootObject = XYZ;
}
`;

function runTest() {
  const tmpDir = path.join(os.tmpdir(), "sentry-allow-failure-test-" + Date.now());
  const iosRoot = path.join(tmpDir, "ios");
  const xcodeproj = path.join(iosRoot, "customer.xcodeproj");

  console.log("Creating temp iOS project at", tmpDir);

  fs.mkdirSync(xcodeproj, { recursive: true });
  fs.writeFileSync(path.join(xcodeproj, "project.pbxproj"), FAKE_PBXPROJ, "utf8");

  applySentryAllowFailure(iosRoot, "customer");

  const envPath = path.join(iosRoot, ".xcode.env");
  const pbxPath = path.join(xcodeproj, "project.pbxproj");

  if (!fs.existsSync(envPath)) {
    console.error("FAIL: .xcode.env was not created");
    cleanup();
    process.exit(1);
  }
  const envContent = fs.readFileSync(envPath, "utf8");
  if (!envContent.includes("SENTRY_DISABLE_AUTO_UPLOAD")) {
    console.error("FAIL: .xcode.env missing SENTRY_DISABLE_AUTO_UPLOAD");
    console.error(envContent);
    cleanup();
    process.exit(1);
  }
  if (!envContent.includes("export SENTRY_ALLOW_FAILURE=true")) {
    console.error("FAIL: .xcode.env missing SENTRY_ALLOW_FAILURE");
    console.error(envContent);
    cleanup();
    process.exit(1);
  }
  if (!envContent.includes("SENTRY_CLI_PACKAGE_PATH")) {
    console.error("FAIL: .xcode.env missing SENTRY_CLI_PACKAGE_PATH");
    console.error(envContent);
    cleanup();
    process.exit(1);
  }
  console.log("PASS: .xcode.env contains SENTRY_ALLOW_FAILURE and SENTRY_CLI_PACKAGE_PATH");

  const pbxContent = fs.readFileSync(pbxPath, "utf8");
  if (
    !pbxContent.includes(".xcode.env") ||
    !pbxContent.includes("source ") ||
    !pbxContent.includes("SENTRY_CLI_PACKAGE_PATH")
  ) {
    console.error(
      "FAIL: project.pbxproj was not patched with source .xcode.env and export SENTRY_CLI_PACKAGE_PATH"
    );
    console.error("Snippet:", pbxContent.slice(pbxContent.indexOf("shellScript"), pbxContent.indexOf("shellScript") + 150));
    cleanup();
    process.exit(1);
  }
  if (!pbxContent.includes("echo upload")) {
    console.error("FAIL: original script content was removed");
    cleanup();
    process.exit(1);
  }
  // pbxproj escapes quotes in shellScript; match the stable path substring instead.
  const sourceMatches = (pbxContent.match(/\$\{SRCROOT\}\/\.xcode\.env/g) || []).length;
  if (sourceMatches !== 2) {
    console.error("FAIL: expected .xcode.env source in both bundle and dSYM phases, got", sourceMatches);
    cleanup();
    process.exit(1);
  }
  console.log("PASS: project.pbxproj bundle + dSYM phases prefixed with source .xcode.env");

  const envAfterFirst = fs.readFileSync(envPath, "utf8");
  applySentryAllowFailure(iosRoot, "customer");
  const pbxContent2 = fs.readFileSync(pbxPath, "utf8");
  const envAfterSecond = fs.readFileSync(envPath, "utf8");
  if (pbxContent !== pbxContent2) {
    console.error("FAIL: idempotency - second run changed project.pbxproj");
    cleanup();
    process.exit(1);
  }
  if (envAfterFirst !== envAfterSecond) {
    console.error("FAIL: idempotency - second run changed .xcode.env");
    cleanup();
    process.exit(1);
  }
  console.log("PASS: idempotent (second run did not double-patch)");

  cleanup();
  console.log("\nAll checks passed.");

  function cleanup() {
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch (_) {}
  }
}

runTest();
