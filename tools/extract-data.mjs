import fs from "node:fs";
import path from "node:path";
import {
  createDataCryptoOptions,
  parseDataFileText,
  stringifyDataObject
} from "./data-codec.mjs";
import { resolveGameRoot, resolveProjectRootFromTool } from "./modkit-config.mjs";

const projectRoot = resolveProjectRootFromTool(import.meta.url);

function parseArgs(argv) {
  const options = {
    gameRoot: "",
    inputDir: "",
    outputDir: path.join(projectRoot, "output", "extract", "data"),
    password: "",
    salt: "",
    keyHex: "",
    ivHex: ""
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--game-root") options.gameRoot = argv[++i] || "";
    else if (arg === "--input") options.inputDir = path.resolve(argv[++i] || options.inputDir);
    else if (arg === "--output") options.outputDir = path.resolve(argv[++i] || options.outputDir);
    else if (arg === "--password") options.password = argv[++i] || "";
    else if (arg === "--salt") options.salt = argv[++i] || "";
    else if (arg === "--key-hex") options.keyHex = argv[++i] || "";
    else if (arg === "--iv-hex") options.ivHex = argv[++i] || "";
    else throw new Error(`unknown argument: ${arg}`);
  }

  return options;
}

function stableJson(value) {
  return JSON.stringify(value);
}

function buildCryptoOptions(options) {
  const cryptoOptions = {};
  if (options.password) cryptoOptions.password = options.password;
  if (options.salt) cryptoOptions.salt = options.salt;
  if (options.keyHex) cryptoOptions.keyHex = options.keyHex;
  if (options.ivHex) cryptoOptions.ivHex = options.ivHex;
  return cryptoOptions;
}

const options = parseArgs(process.argv.slice(2));
const gameRoot = options.inputDir ? "" : resolveGameRoot(projectRoot, options.gameRoot);
const inputDir = options.inputDir || path.join(gameRoot, "www", "data");
const cryptoOptions = buildCryptoOptions(options);
const resolvedCrypto = createDataCryptoOptions(cryptoOptions);

if (!fs.existsSync(inputDir)) {
  throw new Error(`data directory not found: ${inputDir}`);
}

fs.rmSync(options.outputDir, { recursive: true, force: true });
fs.mkdirSync(options.outputDir, { recursive: true });

const results = [];
const failures = [];
for (const entry of fs.readdirSync(inputDir).filter(name => /\.json$/i.test(name)).sort()) {
  const source = path.join(inputDir, entry);
  const output = path.join(options.outputDir, entry);
  try {
    const sourceText = fs.readFileSync(source, "utf8");
    const value = parseDataFileText(sourceText, cryptoOptions);
    fs.writeFileSync(output, stringifyDataObject(value, { pretty: true }), "utf8");
    const roundTrip = JSON.parse(fs.readFileSync(output, "utf8"));
    results.push({
      name: entry,
      source,
      output,
      sourceLength: sourceText.length,
      jsonLength: fs.statSync(output).size,
      verified: stableJson(roundTrip) === stableJson(value)
    });
  } catch (error) {
    failures.push({
      name: entry,
      source,
      error: error && error.message ? error.message : String(error)
    });
  }
}

const report = {
  gameRoot: gameRoot || null,
  inputDir,
  outputDir: options.outputDir,
  count: results.length,
  failures,
  crypto: {
    algorithm: resolvedCrypto.algorithm,
    keyHex: resolvedCrypto.keyHex,
    ivHex: resolvedCrypto.ivHex
  },
  results
};

fs.writeFileSync(path.join(options.outputDir, "_extract-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (failures.length) {
  throw new Error(`failed to decrypt ${failures.length} data files; see ${path.join(options.outputDir, "_extract-report.json")}`);
}

const unverified = results.filter(result => !result.verified);
if (unverified.length) {
  throw new Error(`verification failed for: ${unverified.map(result => result.name).join(", ")}`);
}

console.log(`Extracted ${results.length} data files to ${options.outputDir}`);
