import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

class BridgeIoContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "BridgeIoContractError";
  }
}

const require = createRequire(import.meta.url);
const ts = require("typescript");

function usage() {
  return [
    "Usage: node tests/bridge-io-contract.mjs [--expect-type <command-type>]",
    "",
    "Runs the bridge IO module against a temp bridge-state directory."
  ].join("\n");
}

function parseOptions(argv) {
  const options = { expectedType: "ping" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      console.log(usage());
      process.exitCode = 0;
      return null;
    }
    if (arg === "--expect-type") {
      const value = argv[index + 1];
      if (!value) throw new BridgeIoContractError("--expect-type requires a value");
      options.expectedType = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--expect-type=")) {
      const value = arg.slice("--expect-type=".length);
      if (!value) throw new BridgeIoContractError("--expect-type requires a value");
      options.expectedType = value;
      continue;
    }
    throw new BridgeIoContractError(`unknown argument: ${arg}`);
  }
  return options;
}

function assert(condition, message) {
  if (!condition) throw new BridgeIoContractError(message);
}

function loadBridgeIo(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    throw new BridgeIoContractError(`bridge IO source missing: ${sourcePath}`);
  }
  const source = fs.readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2020
    }
  });
  const sandbox = {};
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  const bridgeIo = sandbox.NwrGuiBridgeIO;
  if (!bridgeIo || typeof bridgeIo !== "object") {
    throw new BridgeIoContractError("NwrGuiBridgeIO namespace was not created");
  }
  return bridgeIo;
}

function run() {
  const options = parseOptions(process.argv.slice(2));
  if (options === null) return;

  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const sourcePath = path.resolve(testsDir, "..", "src", "bridge-io.ts");
  const bridgeIo = loadBridgeIo(sourcePath);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nwr-bridge-io-"));
  try {
    const paths = bridgeIo.createBridgePaths(path, tempRoot);
    let now = 1000;
    const payload = bridgeIo.sendCommand(
      fs,
      paths,
      { type: "ping", value: 7 },
      () => now++,
      () => 0.5
    );
    const commandText = fs.readFileSync(paths.commandPath, "utf8");
    const commandLines = commandText.trim().split(/\r?\n/);
    const written = JSON.parse(commandLines[0]);

    assert(commandLines.length === 1, "expected one JSONL command line");
    assert(written.type === options.expectedType, `expected command type ${options.expectedType}, got ${written.type}`);
    assert(written.commandId === "1000-8", `unexpected commandId ${written.commandId}`);
    assert(written.ts === 1001, `unexpected ts ${written.ts}`);
    assert(payload.commandId === written.commandId, "returned payload commandId must match written payload");

    fs.writeFileSync(paths.eventPath, '{"type":"ok"}\nnot-json\n{"type":"done"}\n', "utf8");
    const events = bridgeIo.readEvents(fs, paths);
    assert(events.length === 2, `expected two parsed events, got ${events.length}`);
    bridgeIo.clearEvents(fs, paths);
    assert(fs.readFileSync(paths.eventPath, "utf8") === "", "clearEvents must truncate events file");

    console.log("Bridge IO contract");
    console.log(`bridgeDir: ${paths.bridgeDir}`);
    console.log(`commandPath: ${paths.commandPath}`);
    console.log(`eventPath: ${paths.eventPath}`);
    console.log(`statePath: ${paths.statePath}`);
    console.log(`jsonlLine: ${JSON.stringify(written)}`);
    console.log(`eventsParsed: ${events.length}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  run();
} catch (error) {
  if (error instanceof BridgeIoContractError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
