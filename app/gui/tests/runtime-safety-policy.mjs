import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

class RuntimeSafetyPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "RuntimeSafetyPolicyError";
  }
}

function formatList(values) {
  return values.length === 0 ? "none" : values.join(", ");
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function assertIncludes(sourceName, source, terms) {
  const missing = terms.filter((term) => !source.includes(term));
  if (missing.length > 0) {
    throw new RuntimeSafetyPolicyError(`${sourceName} is missing safety terms: ${formatList(missing)}`);
  }
}

function assertBridgeDataDumpSafety(sourceName, source) {
  assertIncludes(sourceName, source, [
    "path.basename(decoded) === decoded",
    "function cleanDataDumpTargetName",
    "path.basename(cleanName) !== cleanName",
    "invalid data.dump target name",
    "dataDumpOutputRoots",
    "path.join(projectRoot, \"output\")",
    "path.join(gameRoot, \".omo\", \"evidence\")",
    "data.dump outputDir must be inside nwr_modkit/output or .omo/evidence",
    "function resolveDataDumpOutputDir",
    "isInsidePath(outputDir, root)",
    "resolveDataDumpOutputDir(command.outputDir)"
  ]);
  if (source.includes("path.join(projectRoot, \"runtime\"),")) {
    throw new RuntimeSafetyPolicyError(`${sourceName} must not allow data.dump output under nwr_modkit/runtime`);
  }
  if (/const\s+outputDir\s*=\s*command\.outputDir[\s\S]*?path\.resolve\(projectRoot,\s*String\(command\.outputDir\)\)[\s\S]*?:\s*dataDir/.test(source)) {
    throw new RuntimeSafetyPolicyError(`${sourceName} resolves data.dump outputDir directly without containment`);
  }
}

function assertRetiredSurfaceRemoved(sourceName, source) {
  const retiredTerms = [
    "offlineHunt",
    "progress.enemyBook.unlock",
    "enemyBook",
    "skillRate",
    "hangupSummary",
    "hangUp"
  ].filter((term) => source.includes(term));
  if (retiredTerms.length > 0) {
    throw new RuntimeSafetyPolicyError(`${sourceName} still contains retired runtime surface: ${formatList(retiredTerms)}`);
  }
}

function assertRetiredToolsRemoved(modkitDir) {
  const retiredPaths = [
    "runtime/bridge/content.js",
    "runtime/bridge/direct-command.js",
    "runtime/bridge/manifest.json",
    "runtime/extension",
    "runtime/extension-probe",
    "tools/cdp-command-pump.mjs",
    "tools/extension-bridge-server.mjs",
    "tools/inject-bridge-cdp.mjs",
    "tools/launch-cdp-runtime.ps1",
    "tools/launch-extension-runtime.ps1",
    "tools/launch-patched-html-runtime.ps1",
    "tools/launch-preload-runtime.ps1",
    "tools/launch-visible-runtime.ps1",
    "tools/launch-wrapper-runtime.ps1",
    "tools/runtime-smoke.mjs"
  ];
  const existing = retiredPaths.filter((relative) => fs.existsSync(path.join(modkitDir, relative)));
  if (existing.length > 0) throw new RuntimeSafetyPolicyError(`retired runtime files still exist: ${formatList(existing)}`);
}

function run() {
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const modkitDir = path.resolve(testsDir, "..", "..", "..");
  const bridgeSource = readText(path.join(modkitDir, "runtime", "bridge", "page-bridge.js"));
  assertBridgeDataDumpSafety("runtime/bridge/page-bridge.js", bridgeSource);
  assertRetiredSurfaceRemoved("runtime/bridge/page-bridge.js", bridgeSource);
  assertRetiredToolsRemoved(modkitDir);
  console.log("Runtime safety policy guards data.dump output and removed runtime surfaces");
}

try {
  run();
} catch (error) {
  if (error instanceof RuntimeSafetyPolicyError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
