import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

class RouteSelectorContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "RouteSelectorContractError";
  }
}

const require = createRequire(import.meta.url);
const ts = require("typescript");

function assert(condition, message) {
  if (!condition) throw new RouteSelectorContractError(message);
}

function usage() {
  return [
    "Usage: node tests/route-selector-contract.mjs [--expect-default <route>]",
    "",
    "Asserts GUI route selector options map to documented runtime launcher switches."
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
      if (!value) throw new RouteSelectorContractError("--expect-default requires a value");
      options.expectedDefault = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--expect-default=")) {
      const value = arg.slice("--expect-default=".length);
      if (!value) throw new RouteSelectorContractError("--expect-default requires a value");
      options.expectedDefault = value;
      continue;
    }
    throw new RouteSelectorContractError(`unknown argument: ${arg}`);
  }
  return options;
}

function loadRoutes(appDir) {
  const sourcePath = path.join(appDir, "src", "runtime-routes.ts");
  if (!fs.existsSync(sourcePath)) throw new RouteSelectorContractError(`route source missing: ${sourcePath}`);
  const source = fs.readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 }
  });
  const sandbox = {};
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  if (!sandbox.NwrGuiRuntimeRoutes) throw new RouteSelectorContractError("NwrGuiRuntimeRoutes namespace was not created");
  return sandbox.NwrGuiRuntimeRoutes;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeSwitches(values) {
  return values.join(" ");
}

function detectManualBridgeLauncher(sourceText) {
  const normalized = sourceText.replace(/\s+/g, " ");
  if (!/if\s*\(\$BgBridgeManual\)\s*\{[\s\S]*?launch-bg-bridge-runtime\.ps1/.test(normalized)) {
    throw new RouteSelectorContractError("launch-runtime.ps1 does not expose the manual bg bridge preparation switch");
  }
  if (!/-PrepareOnly/.test(normalized)) {
    throw new RouteSelectorContractError("manual bg bridge path must prepare only and leave Game.exe startup to the user");
  }
  return "manual-bg-bridge";
}

function assertNoExtraNames(guiRoutes, metadataRoutes) {
  const guiNames = new Set(guiRoutes.map((route) => route.name));
  const metadataNames = new Set(metadataRoutes);
  const extraGui = Array.from(guiNames).filter((name) => !metadataNames.has(name));
  const missingGui = Array.from(metadataNames).filter((name) => !guiNames.has(name));
  assert(extraGui.length === 0, `GUI exposes undocumented routes: ${extraGui.join(", ")}`);
  assert(missingGui.length === 0, `GUI is missing documented routes: ${missingGui.join(", ")}`);
}

function assertRouteDetails(guiRoutes, metadata) {
  for (const route of guiRoutes) {
    const detail = metadata.routeDetails[route.name];
    assert(detail, `metadata missing route ${route.name}`);
    assert(route.label === detail.label, `${route.name} label drifted from metadata`);
    assert(route.default === detail.default, `${route.name} default flag drifted from metadata`);
    assert(normalizeSwitches(route.powershellSwitches) === normalizeSwitches(detail.powershellSwitches), `${route.name} switches drifted from metadata`);
    assert(route.launcher === detail.launcher, `${route.name} launcher drifted from metadata`);
    assert(route.riskNote === detail.riskNote, `${route.name} risk note drifted from metadata`);
    if (route.name === "manual-bg-bridge") {
      assert(/start-manual-bg-bridge\.cmd/.test(route.riskNote), `${route.name} risk note must tell the user which prepared launcher to start`);
      assert(/手动 bridge|background bridge/i.test(route.riskNote), `${route.name} risk note must identify the generated bridge route`);
      assert(/不会启动根目录 Game\.exe|does not start Game\.exe/i.test(route.riskNote), `${route.name} risk note must say prepare does not start root Game.exe`);
      assert(/无法后附加|cannot be attached/i.test(route.riskNote), `${route.name} risk note must explain already-running normal launch cannot be attached`);
    }
  }
}

function assertLaunchArgs(runtimeRoutes) {
  const base = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "launch-runtime.ps1", "-GameRoot", "C:/game"];
  for (const route of runtimeRoutes.routeOptions()) {
    const args = runtimeRoutes.launchArguments(base, route.name);
    const tail = args.slice(base.length);
    assert(normalizeSwitches(tail) === normalizeSwitches(route.powershellSwitches), `${route.name} launch args should append exactly its switches`);
    const diagnostic = runtimeRoutes.diagnosticModel(route.name);
    assert(diagnostic.routeName === route.name, `${route.name} diagnostic route mismatch`);
    assert(diagnostic.switchText === (route.powershellSwitches.length ? route.powershellSwitches.join(" ") : "(none)"), `${route.name} diagnostic switch text mismatch`);
  }
}

function run() {
  const options = parseOptions(process.argv.slice(2));
  if (options === null) return;
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(testsDir, "..");
  const modkitDir = path.resolve(appDir, "..", "..");
  const runtimeRoutes = loadRoutes(appDir);
  const metadata = readJson(path.join(appDir, "protocol-metadata.json"));
  const guiRoutes = runtimeRoutes.routeOptions();
  const defaultRoute = runtimeRoutes.defaultRouteName();
  const launcherDefault = detectManualBridgeLauncher(fs.readFileSync(path.join(modkitDir, "tools", "launch-runtime.ps1"), "utf8"));

  assertNoExtraNames(guiRoutes, metadata.supportedRoutes);
  assertRouteDetails(guiRoutes, metadata);
  assertLaunchArgs(runtimeRoutes);
  const expectedDefault = options.expectedDefault ?? launcherDefault;
  assert(defaultRoute === expectedDefault, `GUI default ${defaultRoute} must match expected default ${expectedDefault}`);
  assert(defaultRoute === launcherDefault, `GUI default ${defaultRoute} must match the manual bridge launcher route ${launcherDefault}`);
  assert(runtimeRoutes.normalizeRouteName("unknown-route") === defaultRoute, "unknown routes should normalize to the default route");

  console.log("Runtime route selector contract");
  console.log(`defaultRoute: ${defaultRoute}`);
  for (const route of guiRoutes) {
    const switches = route.powershellSwitches.length ? route.powershellSwitches.join(" ") : "(none)";
    console.log(`${route.name}: switches=${switches}; label=${route.label}`);
  }
}

try {
  run();
} catch (error) {
  if (error instanceof RouteSelectorContractError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
