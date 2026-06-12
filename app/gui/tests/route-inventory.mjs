import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

class RouteInventoryError extends Error {
  constructor(message) {
    super(message);
    this.name = "RouteInventoryError";
  }
}

const EXPECTED_ROUTES = ["manual-bg-bridge"];
const RETIRED_TOOLS = [
  "cdp-command-pump.mjs",
  "extension-bridge-server.mjs",
  "inject-bridge-cdp.mjs",
  "launch-cdp-runtime.ps1",
  "launch-extension-runtime.ps1",
  "launch-patched-html-runtime.ps1",
  "launch-preload-runtime.ps1",
  "launch-visible-runtime.ps1",
  "launch-wrapper-runtime.ps1",
  "runtime-smoke.mjs"
];

function usage() {
  return [
    "Usage: node tests/route-inventory.mjs [--expect-default <route>]",
    "",
    "Asserts the runtime launcher exposes only the manual bridge route."
  ].join("\n");
}

function parseOptions(argv) {
  const options = { expectedDefault: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      console.log(usage());
      process.exitCode = 0;
      return null;
    }
    if (arg === "--expect-default") {
      const value = argv[index + 1];
      if (!value) throw new RouteInventoryError("--expect-default requires a value");
      options.expectedDefault = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--expect-default=")) {
      const value = arg.slice("--expect-default=".length);
      if (!value) throw new RouteInventoryError("--expect-default requires a value");
      options.expectedDefault = value;
      continue;
    }
    throw new RouteInventoryError(`unknown argument: ${arg}`);
  }
  return options;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new RouteInventoryError(`${fieldName} must be a non-empty string`);
  }
  return value;
}

function requireBoolean(value, fieldName) {
  if (typeof value !== "boolean") throw new RouteInventoryError(`${fieldName} must be a boolean`);
  return value;
}

function requireStringArray(value, fieldName) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new RouteInventoryError(`${fieldName} must be a string array`);
  }
  return value;
}

function parseRouteDetails(raw) {
  const supportedRoutes = requireStringArray(raw.supportedRoutes, "supportedRoutes");
  const details = raw.routeDetails;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    throw new RouteInventoryError("routeDetails must be an object");
  }
  return supportedRoutes.map((name) => {
    const detail = details[name];
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
      throw new RouteInventoryError(`routeDetails.${name} is missing`);
    }
    return {
      name,
      label: requireString(detail.label, `${name}.label`),
      default: requireBoolean(detail.default, `${name}.default`),
      powershellSwitches: requireStringArray(detail.powershellSwitches, `${name}.powershellSwitches`),
      launcher: requireString(detail.launcher, `${name}.launcher`),
      riskNote: requireString(detail.riskNote, `${name}.riskNote`)
    };
  });
}

function formatList(values) {
  return values.length === 0 ? "none" : values.join(", ");
}

function assertOnlyExpectedRoutes(raw, routes) {
  const names = routes.map((route) => route.name);
  const details = Object.keys(raw.routeDetails);
  const missing = EXPECTED_ROUTES.filter((name) => !names.includes(name));
  const extra = names.filter((name) => !EXPECTED_ROUTES.includes(name));
  const extraDetails = details.filter((name) => !EXPECTED_ROUTES.includes(name));
  if (missing.length > 0 || extra.length > 0 || extraDetails.length > 0) {
    throw new RouteInventoryError(
      `runtime routes must be exactly ${EXPECTED_ROUTES.join(", ")}; ` +
        `missing ${formatList(missing)}; extra ${formatList(extra)}; extraDetails ${formatList(extraDetails)}`
    );
  }
}

function assertManualBridgeLauncher(launchRuntimeSource, bgBridgeSource, expectedBridgeVersion) {
  const normalizedLaunch = launchRuntimeSource.replace(/\s+/g, " ");
  const normalizedBgBridge = bgBridgeSource.replace(/\s+/g, " ");
  if (!/\[switch\]\$BgBridgeManual/.test(launchRuntimeSource)) {
    throw new RouteInventoryError("launch-runtime.ps1 must expose the BgBridgeManual switch");
  }
  if (!/launch-bg-bridge-runtime\.ps1/.test(normalizedLaunch) || !/-PrepareOnly/.test(normalizedLaunch)) {
    throw new RouteInventoryError("launch-runtime.ps1 must prepare the manual bg bridge runtime only");
  }
  const retiredSwitches = ["Cdp", "Preload", "HtmlPatch", "BgBridge", "DirectInject", "AllowLegacyRoute"];
  const exposed = retiredSwitches.filter((name) => new RegExp(`\\[switch\\]\\$${name}\\b`).test(launchRuntimeSource));
  if (exposed.length > 0) throw new RouteInventoryError(`launch-runtime.ps1 still exposes retired switches: ${formatList(exposed)}`);
  if (!/\[switch\]\$PrepareOnly/.test(bgBridgeSource) || !/start-manual-bg-bridge\.cmd/.test(bgBridgeSource)) {
    throw new RouteInventoryError("manual bg bridge route must support prepare-only manual launch mode");
  }
  if (!/manualBgBridge/.test(bgBridgeSource) || !/manualLauncher/.test(bgBridgeSource) || !/manualGameExe/.test(bgBridgeSource)) {
    throw new RouteInventoryError("manual bg bridge route must write a waiting state with prepared launch paths");
  }
  if (!bgBridgeSource.includes(`bridgeVersion = "${expectedBridgeVersion}"`)) {
    throw new RouteInventoryError(`manual bg bridge prepare state must use bridge version ${expectedBridgeVersion}`);
  }
  if (!/if\s*\(\$PrepareOnly\)\s*\{[\s\S]*?return[\s\S]*?\}\s*Start-Process\s+-FilePath\s+\$GameExe/.test(normalizedBgBridge)) {
    throw new RouteInventoryError("manual bg bridge route must return before Start-Process when PrepareOnly is set");
  }
  if (/--load-extension=|remote-debugging-port|cdp-command-pump|inject-bridge-cdp/.test(bgBridgeSource)) {
    throw new RouteInventoryError("manual bg bridge route must not depend on extension loading or remote debugging");
  }
}

function assertRetiredToolsRemoved(toolsDir) {
  const existing = RETIRED_TOOLS.filter((name) => fs.existsSync(path.join(toolsDir, name)));
  if (existing.length > 0) throw new RouteInventoryError(`retired runtime tools still exist: ${formatList(existing)}`);
}

function assertManualBridgeGuiSurface(indexHtml, appSource) {
  if (!/id="openPreparedGameBtn"/.test(indexHtml)) {
    throw new RouteInventoryError("GUI must expose an open-prepared-game button after bridge preparation");
  }
  if (!/start-manual-bg-bridge\.cmd/.test(appSource) || !/function\s+openPreparedGame\s*\(/.test(appSource)) {
    throw new RouteInventoryError("GUI must know how to run runtime/game-app/start-manual-bg-bridge.cmd");
  }
  if (!/function\s+refreshPreparedGameControls\s*\(/.test(appSource)) {
    throw new RouteInventoryError("GUI must refresh prepared-game control state from the generated launcher");
  }
}

function run() {
  const options = parseOptions(process.argv.slice(2));
  if (options === null) return;
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(testsDir, "..");
  const modkitDir = path.resolve(appDir, "..", "..");
  const metadata = readJson(path.join(appDir, "protocol-metadata.json"));
  const routes = parseRouteDetails(metadata);
  assertOnlyExpectedRoutes(metadata, routes);
  const defaultRoutes = routes.filter((route) => route.default);
  if (defaultRoutes.length !== 1) throw new RouteInventoryError(`expected one default route, found ${defaultRoutes.length}`);
  const expectedDefault = options.expectedDefault ?? "manual-bg-bridge";
  if (defaultRoutes[0].name !== expectedDefault) {
    throw new RouteInventoryError(`metadata default ${defaultRoutes[0].name} did not match expected ${expectedDefault}`);
  }
  assertManualBridgeLauncher(
    readText(path.join(modkitDir, "tools", "launch-runtime.ps1")),
    readText(path.join(modkitDir, "tools", "launch-bg-bridge-runtime.ps1")),
    metadata.expectedBridgeVersion
  );
  assertRetiredToolsRemoved(path.join(modkitDir, "tools"));
  assertManualBridgeGuiSurface(
    readText(path.join(appDir, "index.html")),
    readText(path.join(appDir, "app.ts"))
  );
  console.log("Runtime bridge route inventory");
  console.log(`Default route: ${defaultRoutes[0].name}`);
  for (const route of routes) {
    console.log(`- ${route.name}`);
    console.log(`  switches: ${route.powershellSwitches.join(" ") || "(none)"}`);
    console.log(`  launcher: ${route.launcher}`);
  }
}

try {
  run();
} catch (error) {
  if (error instanceof RouteInventoryError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
