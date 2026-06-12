import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

class RuntimeStateContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "RuntimeStateContractError";
  }
}

const require = createRequire(import.meta.url);
const ts = require("typescript");

function assert(condition, message) {
  if (!condition) throw new RuntimeStateContractError(message);
}

function usage() {
  return [
    "Usage: node tests/runtime-state-contract.mjs [--expect-status <case>:<text>]",
    "",
    "Asserts runtime state and event rendering models for bridge-first GUI status."
  ].join("\n");
}

function parseOptions(argv) {
  const options = { extraStatus: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      console.log(usage());
      process.exitCode = 0;
      return null;
    }
    if (arg === "--expect-status") {
      const value = argv[index + 1];
      if (!value) throw new RuntimeStateContractError("--expect-status requires a value");
      options.extraStatus = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--expect-status=")) {
      const value = arg.slice("--expect-status=".length);
      if (!value) throw new RuntimeStateContractError("--expect-status requires a value");
      options.extraStatus = value;
      continue;
    }
    throw new RuntimeStateContractError(`unknown argument: ${arg}`);
  }
  return options;
}

function loadNamespace(appDir) {
  const sources = [
    path.join(appDir, "src", "runtime-state.ts"),
    path.join(appDir, "src", "runtime-events.ts")
  ];
  const sandbox = {};
  for (const sourcePath of sources) {
    if (!fs.existsSync(sourcePath)) throw new RuntimeStateContractError(`runtime state source missing: ${sourcePath}`);
    const source = fs.readFileSync(sourcePath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 }
    });
    vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  }
  if (!sandbox.NwrGuiRuntimeState) throw new RuntimeStateContractError("NwrGuiRuntimeState namespace was not created");
  if (!sandbox.NwrGuiRuntimeEvents) throw new RuntimeStateContractError("NwrGuiRuntimeEvents namespace was not created");
  return { state: sandbox.NwrGuiRuntimeState, events: sandbox.NwrGuiRuntimeEvents };
}

function statusCases(now) {
  return [
    { name: "disconnected", input: null, text: "未连接", kind: "idle", className: "status status-idle", bridge: "等待 bridge" },
    { name: "stale", input: { ts: now - 9000, bridgeVersion: "0.2.32", hasParty: true }, text: "离线", kind: "idle", className: "status status-idle", bridge: "上次状态" },
    { name: "version", input: { ts: now, bridgeVersion: "0.2.30", hasParty: true }, text: "需重启", kind: "error", className: "status status-error", bridge: "已注入 v0.2.30 -> v0.2.32" },
    { name: "lastError", input: { ts: now, bridgeVersion: "0.2.32", hasParty: true, lastError: "boom" }, text: "有错误", kind: "error", className: "status status-error", bridge: "已注入 v0.2.32" },
    { name: "loading", input: { ts: now, bridgeVersion: "0.2.32", hasParty: false, storagePatched: true }, text: "加载中", kind: "idle", className: "status status-idle", bridge: "已接入 v0.2.32" },
    { name: "connected", input: { ts: now, bridgeVersion: "0.2.32", hasParty: true, gold: 123, saveDirExists: true, currentMap: { mapId: 7, x: 3, y: 4 } }, text: "已连接", kind: "online", className: "status status-online", bridge: "已注入 v0.2.32" }
  ];
}

function assertStatusModels(runtimeState, options) {
  const now = 10_000;
  const cases = statusCases(now);
  for (const item of cases) {
    const view = runtimeState.stateView(item.input, { expectedBridgeVersion: "0.2.32", now });
    assert(view.status.text === item.text, `${item.name} status text expected ${item.text}, got ${view.status.text}`);
    assert(view.status.kind === item.kind, `${item.name} status kind expected ${item.kind}, got ${view.status.kind}`);
    assert(view.status.className === item.className, `${item.name} class expected ${item.className}, got ${view.status.className}`);
    assert(view.bridgeText === item.bridge, `${item.name} bridge expected ${item.bridge}, got ${view.bridgeText}`);
  }
  if (options.extraStatus) {
    const [caseName, expected] = options.extraStatus.split(":");
    const found = cases.find((item) => item.name === caseName);
    if (!found) throw new RuntimeStateContractError(`unknown status case ${caseName}`);
    const view = runtimeState.stateView(found.input, { expectedBridgeVersion: "0.2.32", now });
    assert(view.status.text === expected, `${caseName} status text expected ${expected}, got ${view.status.text}`);
  }
  const connected = runtimeState.stateView(cases.find((item) => item.name === "connected").input, { expectedBridgeVersion: "0.2.32", now });
  assert(connected.partyState === "可用", "connected party state should be available");
  assert(connected.saveState === "已识别", "connected save state should be recognized");
  assert(connected.mapState === "7 (3, 4)", "connected map state should include coordinates");
}

function assertEventRendering(runtimeEvents) {
  const empty = runtimeEvents.eventListHtml([], (ts) => String(ts));
  assert(empty.includes("暂无事件"), "empty event list should show current empty message");
  const html = runtimeEvents.eventListHtml([
    { ts: 1, type: "ping", ok: true, payload: { value: "<ok>" } },
    { ts: 2, type: "save", ok: false, payload: { reason: "bad" } }
  ], (ts) => `T${ts}`);
  assert(html.indexOf("save FAIL") < html.indexOf("ping OK"), "event list should render newest first");
  assert(html.includes("&lt;ok&gt;"), "event payloads should be HTML escaped");
  assert(html.includes("event fail"), "failed events should get fail class");
}

function assertRemovedStateSurface(appDir, runtimeState) {
  const removedDomain = ["fi", "sh", "ing"].join("");
  const titleRemovedDomain = `${removedDomain[0].toUpperCase()}${removedDomain.slice(1)}`;
  const removedTerms = [
    `${removedDomain}.`,
    titleRemovedDomain,
    [String.fromCharCode(0x9493), "鱼"].join(""),
    ["鱼", "具"].join(""),
    ["鱼", "池"].join("")
  ];
  const view = runtimeState.stateView({
    ts: 10_000,
    bridgeVersion: "0.2.32",
    hasParty: true,
    [removedDomain]: { variables: { count: 99 } },
    [`${removedDomain}Options`]: { autoSuccess: true },
    [`${removedDomain}Stats`]: { last: { name: "legacy" } }
  }, { expectedBridgeVersion: "0.2.32", now: 10_000 });
  const rendered = JSON.stringify(view);
  for (const term of removedTerms) {
    assert(!rendered.includes(term), `runtime state view must not render removed term ${term}`);
  }
  for (const fileName of ["app.ts", "index.html", "styles.css"]) {
    const source = fs.readFileSync(path.join(appDir, fileName), "utf8");
    for (const term of removedTerms) {
      assert(!source.includes(term), `${fileName} must not expose removed runtime state term ${term}`);
    }
  }
}

function run() {
  const options = parseOptions(process.argv.slice(2));
  if (options === null) return;
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(testsDir, "..");
  const namespaces = loadNamespace(appDir);
  assertStatusModels(namespaces.state, options);
  assertEventRendering(namespaces.events);
  assertRemovedStateSurface(appDir, namespaces.state);
  console.log("Runtime state contract");
  for (const item of statusCases(10_000)) {
    const view = namespaces.state.stateView(item.input, { expectedBridgeVersion: "0.2.32", now: 10_000 });
    console.log(`${item.name}: ${view.status.className} / ${view.status.text} / ${view.bridgeText}`);
  }
  console.log("events: empty and newest-first escaped rendering ok");
}

try {
  run();
} catch (error) {
  if (error instanceof RuntimeStateContractError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
