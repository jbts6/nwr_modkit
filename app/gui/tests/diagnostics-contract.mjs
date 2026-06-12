import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

class DiagnosticsContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "DiagnosticsContractError";
  }
}

const require = createRequire(import.meta.url);
const ts = require("typescript");
const REMOVED_DOMAIN = ["fi", "sh", "ing"].join("");
const REMOVED_COMMAND_PREFIX = [REMOVED_DOMAIN, ""].join(".");
const REMOVED_LABEL = `${REMOVED_DOMAIN[0].toUpperCase()}${REMOVED_DOMAIN.slice(1)}`;

function assert(condition, message) {
  if (!condition) throw new DiagnosticsContractError(message);
}

function loadNamespaces(appDir) {
  const sources = [
    path.join(appDir, "src", "bridge-commands.ts"),
    path.join(appDir, "src", "bridge-io.ts"),
    path.join(appDir, "src", "diagnostics.ts")
  ];
  const sandbox = {};
  for (const sourcePath of sources) {
    if (!fs.existsSync(sourcePath)) throw new DiagnosticsContractError(`diagnostic source missing: ${sourcePath}`);
    const source = fs.readFileSync(sourcePath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 }
    });
    vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  }
  assert(sandbox.NwrGuiBridgeCommands, "NwrGuiBridgeCommands namespace was not created");
  assert(sandbox.NwrGuiBridgeIO, "NwrGuiBridgeIO namespace was not created");
  assert(sandbox.NwrGuiDiagnostics, "NwrGuiDiagnostics namespace was not created");
  return {
    commands: sandbox.NwrGuiBridgeCommands,
    bridgeIo: sandbox.NwrGuiBridgeIO,
    diagnostics: sandbox.NwrGuiDiagnostics
  };
}

function evidenceRows(appDir) {
  const rootDir = path.resolve(appDir, "..", "..", "..");
  const evidencePath = path.join(rootDir, ".omo", "evidence", "runtime-gate-feature-audit.json");
  if (!fs.existsSync(evidencePath)) throw new DiagnosticsContractError(`A1 evidence missing: ${evidencePath}`);
  return JSON.parse(fs.readFileSync(evidencePath, "utf8"));
}

function assertA1BackedDefinitions(diagnostics, rows) {
  const byControl = new Map(rows.map((row) => [String(row.controlId), row]));
  assert(diagnostics.DIAGNOSTICS.length >= 7, "expected read-only diagnostics for R2/A1 candidate commands");
  for (const definition of diagnostics.DIAGNOSTICS) {
    assert(!String(definition.id).startsWith(REMOVED_COMMAND_PREFIX), `removed diagnostic must be absent: ${definition.id}`);
    assert(!String(definition.commandType).startsWith(REMOVED_COMMAND_PREFIX), `removed diagnostic command must be absent: ${definition.commandType}`);
    assert(!String(definition.label).includes(REMOVED_LABEL), `removed diagnostic label must be absent: ${definition.label}`);
    const row = byControl.get(definition.a1ControlId);
    assert(row, `missing A1 row for ${definition.id}`);
    assert(row.commandType === definition.commandType, `${definition.id} command type does not match A1`);
    assert(row.actionAllowed === true, `${definition.id} should be actionAllowed in A1`);
    assert(["candidate-add", "keep"].includes(row.classification), `${definition.id} has unsupported A1 classification ${row.classification}`);
    assert((row.eventIds || []).length > 0, `${definition.id} should have live A1 event evidence`);
    assert(definition.mutates === false, `${definition.id} must be non-mutating`);
  }
}

function assertCommandBuilders(diagnostics) {
  const types = diagnostics.DIAGNOSTICS.map((definition) => diagnostics.commandForDiagnostic(definition.id).type);
  const removedDiagnostic = ["hangup", "info"].join(".");
  const expected = [
    "ping", "runtime.inspect", "runtime.search", "trainer.options.get",
    "trainer.hooks.info", "data.dump", "map.current"
  ];
  for (const type of expected) assert(types.includes(type), `missing diagnostic command ${type}`);
  assert(!types.includes(removedDiagnostic), "removed hangup diagnostic must not be exposed as a diagnostic control");
  const removedTypes = types.filter((type) => String(type).startsWith(REMOVED_COMMAND_PREFIX));
  assert(removedTypes.length === 0, `removed diagnostics must not be exposed: ${removedTypes.join(", ")}`);
}

function assertPingJsonlWrite(bridgeIo, diagnostics) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nwr-diagnostics-"));
  try {
    const paths = bridgeIo.createBridgePaths(path, tempRoot);
    const payload = bridgeIo.sendCommand(
      fs,
      paths,
      diagnostics.commandForDiagnostic("ping"),
      () => 2000,
      () => 0.25
    );
    const written = JSON.parse(fs.readFileSync(paths.commandPath, "utf8").trim());
    assert(payload.type === "ping", "ping payload should be returned");
    assert(written.type === "ping", "ping JSONL command should be written without game globals");
    assert(written.commandId === "2000-4", `unexpected ping commandId ${written.commandId}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function assertUiControls(appDir, diagnostics) {
  const indexHtml = fs.readFileSync(path.join(appDir, "index.html"), "utf8");
  const appTs = fs.readFileSync(path.join(appDir, "app.ts"), "utf8");
  for (const definition of diagnostics.DIAGNOSTICS) {
    const marker = `data-diagnostic-command="${definition.id}"`;
    assert(indexHtml.includes(marker), `missing UI diagnostic button ${marker}`);
  }
  const removedDiagnosticMarker = `data-diagnostic-command="${["hangup", "info"].join(".")}"`;
  assert(!indexHtml.includes(removedDiagnosticMarker), "removed hangup diagnostic must not be exposed in diagnostics UI");
  const removedDiagnosticMarkers = [...indexHtml.matchAll(/data-diagnostic-command="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value) => String(value).startsWith(REMOVED_COMMAND_PREFIX));
  assert(removedDiagnosticMarkers.length === 0, `removed diagnostic buttons must be absent: ${removedDiagnosticMarkers.join(", ")}`);
  assert(indexHtml.includes('id="openDiagnosticsBtn"'), "sidebar diagnostics shortcut should keep Debug diagnostics reachable");
  assert(indexHtml.includes('href="styles.css?v=manual-workbench-v4"'), "styles.css should be cache-busted for NW local reloads");
  assert(indexHtml.includes('src="app.js?v=manual-workbench-v4"'), "app.js should be cache-busted for NW local reloads");
  assert(indexHtml.includes('class="active" data-tool-tab="core"'), "Core tab should be the default operator surface");
  assert(appTs.includes('let activeToolTab = "core";'), "GUI should boot into common runtime controls");
  assert(appTs.includes("activateTab(activeToolTab);"), "startup should respect the bridge-first default tab");
  assert(!appTs.includes('activateTab("debug");'), "startup must not force the Debug tab over common controls");
}

function assertToolNavigationReachable(appDir) {
  const indexHtml = fs.readFileSync(path.join(appDir, "index.html"), "utf8");
  const styles = fs.readFileSync(path.join(appDir, "styles.css"), "utf8");
  const tabMatches = [...indexHtml.matchAll(/data-tool-tab="([^"]+)"/g)].map((match) => match[1]);
  const toolNavRules = [...styles.matchAll(/\.tool-nav\s*\{[^}]+\}/g)].map((match) => match[0]);
  const expectedTabs = ["core", "catalog", "world", "misc", "debug"];
  for (const tab of expectedTabs) assert(tabMatches.includes(tab), `missing top-level tool tab ${tab}`);
  assert(toolNavRules.length > 0, "missing .tool-nav CSS rules");
  for (const rule of toolNavRules) {
    assert(!rule.includes("auto-fit"), "tool-nav must not wrap tabs under the sticky section nav");
    assert(!rule.includes("repeat(2"), "tool-nav must not switch to a 2-column wrapped layout");
  }
  assert(toolNavRules.some((rule) => rule.includes("grid-template-columns: repeat(5, minmax(72px, 1fr));")), "tool-nav should keep all 5 tabs visible in one compact row");
  assert(toolNavRules.some((rule) => rule.includes("overflow-x: auto;")), "tool-nav should remain reachable when the window is narrow");
}

function run() {
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(testsDir, "..");
  const namespaces = loadNamespaces(appDir);
  assertA1BackedDefinitions(namespaces.diagnostics, evidenceRows(appDir));
  assertCommandBuilders(namespaces.diagnostics);
  assertUiControls(appDir, namespaces.diagnostics);
  assertToolNavigationReachable(appDir);
  assertPingJsonlWrite(namespaces.bridgeIo, namespaces.diagnostics);
  console.log(`diagnostics: ${namespaces.diagnostics.DIAGNOSTICS.length} read-only commands backed by A1 evidence`);
}

try {
  run();
} catch (error) {
  if (error instanceof DiagnosticsContractError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
