import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBridgeCommandNamespace, sampleBridgeCommands } from "./command-builder-fixture.mjs";
import { assertApprovedDiagnosticCommands } from "./protocol-policy.mjs";

const GUI_SEND_COMMAND_PATTERN = /sendCommand\s*\(\s*\{[\s\S]*?type:\s*["']([^"']+)["']/g;
const BRIDGE_HANDLER_PATTERN = /\btype\s*===\s*["']([^"']+)["']/g;
const GUI_EXPECTED_VERSION_PATTERN = /\bEXPECTED_BRIDGE_VERSION\s*=\s*["']([^"']+)["']/;
const BRIDGE_VERSION_PATTERN = /\bversion:\s*["']([^"']+)["']/;

class ProtocolCheckError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProtocolCheckError";
  }
}

function usage() {
  return [
    "Usage: node tests/protocol-check.mjs [--expect-command <type>] [--expect-bridge-version <version>]",
    "",
    "Compares GUI-emitted bridge command types with the manual page bridge handlers.",
    "--expect-command adds an expected command type for negative QA fixtures.",
    "--expect-bridge-version overrides metadata for negative version fixtures."
  ].join("\n");
}

function parseOptions(argv) {
  const options = {
    extraCommands: [],
    bridgeVersionOverride: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      console.log(usage());
      process.exitCode = 0;
      return null;
    }
    if (arg === "--expect-command") {
      const value = argv[index + 1];
      if (!value) throw new ProtocolCheckError("--expect-command requires a value");
      options.extraCommands.push(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--expect-command=")) {
      const value = arg.slice("--expect-command=".length);
      if (!value) throw new ProtocolCheckError("--expect-command requires a value");
      options.extraCommands.push(value);
      continue;
    }
    if (arg === "--expect-bridge-version") {
      const value = argv[index + 1];
      if (!value) throw new ProtocolCheckError("--expect-bridge-version requires a value");
      options.bridgeVersionOverride = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--expect-bridge-version=")) {
      const value = arg.slice("--expect-bridge-version=".length);
      if (!value) throw new ProtocolCheckError("--expect-bridge-version requires a value");
      options.bridgeVersionOverride = value;
      continue;
    }
    throw new ProtocolCheckError(`unknown argument: ${arg}`);
  }
  return options;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function collectMatches(sourceText, pattern) {
  const values = new Set();
  for (const match of sourceText.matchAll(pattern)) {
    const value = match[1];
    if (value) values.add(value);
  }
  return values;
}

function sorted(values) {
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function difference(left, right) {
  return sorted(left).filter((value) => !right.has(value));
}

function formatList(values) { return values.length === 0 ? "none" : values.join(", "); }

function assertNonEmpty(name, values) { if (values.size === 0) throw new ProtocolCheckError(`${name} produced no command types`); }

function requireStringField(sourceName, value, fieldName) {
  if (typeof value !== "string" || value.length === 0) throw new ProtocolCheckError(`${sourceName} ${fieldName} is missing`);
  return value;
}

function requireStringArrayField(sourceName, value, fieldName) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new ProtocolCheckError(`${sourceName} ${fieldName} must be a non-empty string array`);
  }
  return value;
}

function parseFirstGroup(sourceName, sourceText, pattern, fieldName) {
  const match = pattern.exec(sourceText);
  if (!match || !match[1]) throw new ProtocolCheckError(`${sourceName} ${fieldName} is missing`);
  return match[1];
}

function parseProtocolMetadata(metadataPath) {
  const raw = readJson(metadataPath);
  return {
    expectedBridgeVersion: requireStringField("protocol metadata", raw.expectedBridgeVersion, "expectedBridgeVersion"),
    supportedRoutes: requireStringArrayField("protocol metadata", raw.supportedRoutes, "supportedRoutes"),
    diagnosticCommandNames: requireStringArrayField(
      "protocol metadata",
      raw.diagnosticCommandNames,
      "diagnosticCommandNames"
    )
  };
}

function collectGuiCommandTypes(appSource, builderCommands, extraCommands) {
  const commands = collectMatches(appSource, GUI_SEND_COMMAND_PATTERN);
  for (const command of builderCommands) {
    commands.add(command);
  }
  for (const command of extraCommands) {
    commands.add(command);
  }
  return commands;
}

function collectBridgeHandlers(bridgeSource) {
  return collectMatches(bridgeSource, BRIDGE_HANDLER_PATTERN);
}

function buildReport(guiCommands, inlineCommands, builderCommands, mainHandlers, versions, metadata) {
  const missingFromMain = difference(guiCommands, mainHandlers);
  const missingDiagnosticsFromMain = difference(new Set(metadata.diagnosticCommandNames), mainHandlers);
  const versionMismatches = Object.entries(versions)
    .filter(([, version]) => version !== metadata.expectedBridgeVersion)
    .map(([name, version]) => `${name}=${version}`);

  const lines = [
    "Bridge protocol characterization",
    `Expected bridge version: ${metadata.expectedBridgeVersion}`,
    `GUI expected bridge version: ${versions.gui}`,
    `Manual bridge version: ${versions.main}`,
    `Supported routes: ${metadata.supportedRoutes.join(", ")}`,
    `Diagnostic commands: ${metadata.diagnosticCommandNames.join(", ")}`,
    `GUI inline command types: ${inlineCommands.size}`,
    `GUI builder command types: ${builderCommands.size}`,
    `GUI command types: ${guiCommands.size}`,
    `Manual bridge handlers: ${mainHandlers.size}`,
    `Missing GUI commands in manual bridge: ${formatList(missingFromMain)}`,
    `Missing diagnostic commands in manual bridge: ${formatList(missingDiagnosticsFromMain)}`,
    `Version mismatches: ${formatList(versionMismatches)}`,
    "",
    "GUI commands:",
    ...sorted(guiCommands).map((command) => `- ${command}`)
  ];

  return {
    lines,
    missingFromMain,
    missingDiagnosticsFromMain,
    versionMismatches
  };
}

function failIfProtocolDrift(report) {
  const failures = [];
  if (report.missingFromMain.length > 0) {
    failures.push(`GUI commands missing from manual bridge: ${formatList(report.missingFromMain)}`);
  }
  if (report.missingDiagnosticsFromMain.length > 0) {
    failures.push(`diagnostic commands missing from manual bridge: ${formatList(report.missingDiagnosticsFromMain)}`);
  }
  if (report.versionMismatches.length > 0) {
    failures.push(`bridge version mismatch: ${formatList(report.versionMismatches)}`);
  }
  if (failures.length > 0) throw new ProtocolCheckError(failures.join("\n"));
}

function run() {
  const options = parseOptions(process.argv.slice(2));
  if (options === null) return;

  const guiDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(guiDir, "..");
  const modkitDir = path.resolve(appDir, "..", "..");
  const metadata = parseProtocolMetadata(path.join(appDir, "protocol-metadata.json"));
  assertApprovedDiagnosticCommands(metadata.diagnosticCommandNames);
  const expectedBridgeVersion = options.bridgeVersionOverride ?? metadata.expectedBridgeVersion;
  const appSource = readText(path.join(appDir, "app.ts"));
  const bridgeCommandSource = path.join(appDir, "src", "bridge-commands.ts");
  const mainBridgeSource = readText(path.join(modkitDir, "runtime", "bridge", "page-bridge.js"));

  const inlineCommands = collectGuiCommandTypes(appSource, new Set(), []);
  const builderCommands = new Set(
    sampleBridgeCommands(loadBridgeCommandNamespace(bridgeCommandSource)).map((command) => command.type)
  );
  const guiCommands = collectGuiCommandTypes(appSource, builderCommands, options.extraCommands);
  const mainHandlers = collectBridgeHandlers(mainBridgeSource);
  const versions = {
    gui: parseFirstGroup("GUI source", appSource, GUI_EXPECTED_VERSION_PATTERN, "EXPECTED_BRIDGE_VERSION"),
    main: parseFirstGroup("manual bridge", mainBridgeSource, BRIDGE_VERSION_PATTERN, "version")
  };
  assertNonEmpty("GUI command scan", guiCommands);
  assertNonEmpty("GUI builder command scan", builderCommands);
  assertNonEmpty("Manual bridge handler scan", mainHandlers);

  const report = buildReport(guiCommands, inlineCommands, builderCommands, mainHandlers, versions, {
    ...metadata,
    expectedBridgeVersion
  });
  console.log(report.lines.join("\n"));
  failIfProtocolDrift(report);
}

try {
  run();
} catch (error) {
  if (error instanceof ProtocolCheckError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
