import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

class BuildTopologyError extends Error {
  constructor(message) {
    super(message);
    this.name = "BuildTopologyError";
  }
}

const require = createRequire(import.meta.url);

function usage() {
  return [
    "Usage: node tests/build-topology.mjs [--expect-out-file <path>]",
    "",
    "Verifies the NW GUI TypeScript build emits the single app.js entry without a bundler."
  ].join("\n");
}

function parseOptions(argv) {
  const options = { expectedOutFile: "app.js" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      console.log(usage());
      process.exitCode = 0;
      return null;
    }
    if (arg === "--expect-out-file") {
      const value = argv[index + 1];
      if (!value) throw new BuildTopologyError("--expect-out-file requires a value");
      options.expectedOutFile = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--expect-out-file=")) {
      const value = arg.slice("--expect-out-file=".length);
      if (!value) throw new BuildTopologyError("--expect-out-file requires a value");
      options.expectedOutFile = value;
      continue;
    }
    throw new BuildTopologyError(`unknown argument: ${arg}`);
  }
  return options;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function assert(condition, message) {
  if (!condition) throw new BuildTopologyError(message);
}

function assetPath(assetUrl) {
  const delimiterIndex = assetUrl.search(/[?#]/u);
  return delimiterIndex === -1 ? assetUrl : assetUrl.slice(0, delimiterIndex);
}

function findAssetRefs(html, tagName, attrName) {
  const refs = [];
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, "giu");
  const attrPattern = new RegExp(`\\b${attrName}\\s*=\\s*(["'])(.*?)\\1`, "iu");
  for (const match of html.matchAll(tagPattern)) {
    const attrMatch = match[0].match(attrPattern);
    if (attrMatch) refs.push(attrMatch[2]);
  }
  return refs;
}

function runTsc(projectPath, cwd) {
  const tscPath = require.resolve("typescript/bin/tsc");
  const result = spawnSync(process.execPath, [tscPath, "-p", projectPath], {
    cwd,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new BuildTopologyError(
      [`tsc build spike failed with exit ${result.status}`, result.stdout, result.stderr].join("\n")
    );
  }
}

function runBuildSpike(appDir) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nwr-gui-topology-"));
  try {
    const spikeSrc = path.join(tempRoot, "src");
    fs.mkdirSync(spikeSrc, { recursive: true });
    fs.writeFileSync(path.join(spikeSrc, "00-first.ts"), "var BUILD_TOPOLOGY_SPIKE = 'first';\n", "utf8");
    fs.writeFileSync(path.join(spikeSrc, "10-second.ts"), "BUILD_TOPOLOGY_SPIKE += ':second';\n", "utf8");
    fs.writeFileSync(
      path.join(tempRoot, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            module: "none",
            outFile: "app.js",
            strict: true
          },
          files: ["src/00-first.ts", "src/10-second.ts"]
        },
        null,
        2
      ),
      "utf8"
    );
    runTsc(path.join(tempRoot, "tsconfig.json"), appDir);
    const output = readText(path.join(tempRoot, "app.js"));
    const firstIndex = output.indexOf("BUILD_TOPOLOGY_SPIKE = 'first'");
    const secondIndex = output.indexOf("BUILD_TOPOLOGY_SPIKE += ':second'");
    assert(firstIndex >= 0, "build spike missing first source output");
    assert(secondIndex > firstIndex, "build spike did not preserve source order into app.js");
    return { outputBytes: Buffer.byteLength(output), tempRoot };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function run() {
  const options = parseOptions(process.argv.slice(2));
  if (options === null) return;

  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(testsDir, "..");
  const modkitDir = path.resolve(appDir, "..", "..");
  const tsconfig = readJson(path.join(appDir, "tsconfig.json"));
  const indexHtml = readText(path.join(appDir, "index.html"));
  const launcher = readText(path.join(modkitDir, "tools", "launch-gui.ps1"));

  assert(tsconfig.compilerOptions?.module === "none", "tsconfig must keep module none for NW script output");
  assert(tsconfig.compilerOptions?.outFile === options.expectedOutFile, `tsconfig must emit outFile ${options.expectedOutFile}`);
  assert(Array.isArray(tsconfig.files) && tsconfig.files.includes("app.ts"), "tsconfig must include app.ts");
  const scriptRefs = findAssetRefs(indexHtml, "script", "src");
  const entryScript = scriptRefs.find((ref) => assetPath(ref) === options.expectedOutFile);
  assert(entryScript, `index.html must load generated ${options.expectedOutFile}`);
  assert(launcher.includes('$AppSrc = Join-Path $Gui "src"'), "launch-gui.ps1 must know the src source directory");
  assert(launcher.includes('Get-ChildItem -LiteralPath $AppSrc -Filter "*.ts" -File -Recurse'), "launch-gui.ps1 must watch src TypeScript files");

  const spike = runBuildSpike(appDir);
  const appJsPath = path.join(appDir, "app.js");
  const appJsStats = fs.statSync(appJsPath);

  console.log("GUI build topology");
  console.log(`tsconfig module: ${tsconfig.compilerOptions.module}`);
  console.log(`tsconfig outFile: ${tsconfig.compilerOptions.outFile}`);
  console.log(`index entry: ${entryScript}`);
  console.log(`launcher watches src: yes`);
  console.log(`build spike output bytes: ${spike.outputBytes}`);
  console.log(`app.js bytes: ${appJsStats.size}`);
  console.log(`app.js mtimeMs: ${Math.trunc(appJsStats.mtimeMs)}`);
}

try {
  run();
} catch (error) {
  if (error instanceof BuildTopologyError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
