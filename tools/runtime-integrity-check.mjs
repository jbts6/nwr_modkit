import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveGameRoot, resolveProjectRootFromTool } from "./modkit-config.mjs";

class RuntimeIntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = "RuntimeIntegrityError";
  }
}

const PROTECTED_FILES = ["package.json", "loading", "www/index.html", "www/loading.html"];
const BASELINE_HASHES = {
  "package.json": "d09286d164f1d2c43ee838ebad29435d14a40c7399da1b00fca0ec463ddb0d69",
  loading: "2402008c1b7b4eb662ac2e5569fc8b4ca8715f92a4721fb3619bf90983eabd29",
  "www/index.html": "030f687e8dc660af79da3c440888b069e15656acaa81730a01544c1af9c788c9",
  "www/loading.html": "fb73386ad0fdbce0cc2bff89d136ae04748dec7390c7b3abeb63785251439cf9"
};

function usage() {
  return [
    "Usage: node runtime-integrity-check.mjs [--game-root <path>] [--json] [--assert] [--check-target <path>]",
    "",
    "Reports protected boot-file hashes and generated runtime app link safety."
  ].join("\n");
}

function parseArgs(argv) {
  const options = { gameRoot: "", json: false, assert: false, checkTargets: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") return { ...options, help: true };
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--assert") {
      options.assert = true;
      continue;
    }
    if (arg === "--game-root") {
      const value = argv[index + 1];
      if (!value) throw new RuntimeIntegrityError("--game-root requires a value");
      options.gameRoot = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--game-root=")) {
      options.gameRoot = arg.slice("--game-root=".length);
      continue;
    }
    if (arg === "--check-target") {
      const value = argv[index + 1];
      if (!value) throw new RuntimeIntegrityError("--check-target requires a value");
      options.checkTargets.push(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--check-target=")) {
      options.checkTargets.push(arg.slice("--check-target=".length));
      continue;
    }
    throw new RuntimeIntegrityError(`unknown argument: ${arg}`);
  }
  return options;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function normalizeSlash(value) {
  return value.split(path.sep).join("/");
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function realpathIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.realpathSync.native(filePath) : null;
}

function statLink(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, isSymbolicLink: false, realpath: null };
  const stat = fs.lstatSync(filePath);
  return {
    exists: true,
    isSymbolicLink: stat.isSymbolicLink(),
    realpath: realpathIfExists(filePath)
  };
}

function protectedHashes(gameRoot) {
  return Object.fromEntries(
    PROTECTED_FILES.map((name) => [name, { path: path.join(gameRoot, name), sha256: sha256(path.join(gameRoot, name)) }])
  );
}

function buildReport(projectRoot, gameRoot) {
  const appRoot = path.join(projectRoot, "runtime", "game-app");
  const runtimeWww = path.join(appRoot, "www");
  const runtimeLoading = path.join(appRoot, "loading");
  return {
    projectRoot,
    gameRoot,
    protectedFiles: protectedHashes(gameRoot),
    runtimeApp: {
      appRoot,
      www: statLink(runtimeWww),
      loading: {
        path: runtimeLoading,
        exists: fs.existsSync(runtimeLoading),
        allowedGeneratedBootWrite: true
      }
    }
  };
}

function assertHashes(report) {
  const mismatches = Object.entries(report.protectedFiles)
    .filter(([name, data]) => data.sha256 !== BASELINE_HASHES[name])
    .map(([name]) => name);
  if (mismatches.length > 0) throw new RuntimeIntegrityError(`protected boot hash mismatch: ${mismatches.join(", ")}`);
}

function assertRuntimeWwwSafe(report) {
  const runtimeWww = report.runtimeApp.www;
  if (!runtimeWww.exists) return;
  const gameWww = fs.realpathSync.native(path.join(report.gameRoot, "www"));
  if (!runtimeWww.isSymbolicLink || runtimeWww.realpath !== gameWww) {
    throw new RuntimeIntegrityError("runtime/game-app/www must be a junction or symlink to the game www directory");
  }
}

function assertTargetSafe(projectRoot, gameRoot, target) {
  const absolute = path.resolve(process.cwd(), target);
  const runtimeWww = path.join(projectRoot, "runtime", "game-app", "www");
  const gameWww = fs.realpathSync.native(path.join(gameRoot, "www"));
  const runtimeWwwReal = realpathIfExists(runtimeWww);
  const realTarget = realpathIfExists(absolute);
  if (isInside(absolute, runtimeWww) && (runtimeWwwReal === gameWww || (realTarget && isInside(realTarget, gameWww)))) {
    throw new RuntimeIntegrityError(
      `Refusing target through runtime/game-app/www junction to root www: ${normalizeSlash(target)}`
    );
  }
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const projectRoot = resolveProjectRootFromTool(import.meta.url);
  const gameRoot = resolveGameRoot(projectRoot, options.gameRoot);
  const report = buildReport(projectRoot, gameRoot);
  for (const target of options.checkTargets) assertTargetSafe(projectRoot, gameRoot, target);
  if (options.assert) {
    assertHashes(report);
    assertRuntimeWwwSafe(report);
  }
  console.log(options.json ? JSON.stringify(report, null, 2) : "runtime integrity check passed");
}

try {
  run();
} catch (error) {
  if (error instanceof RuntimeIntegrityError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
