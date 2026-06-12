import fs from "node:fs";
import path from "node:path";
import {
  createDataCryptoOptions,
  decryptDataObject,
  encryptDataObject
} from "./data-codec.mjs";
import { resolveProjectRootFromTool } from "./modkit-config.mjs";

const projectRoot = resolveProjectRootFromTool(import.meta.url);

function parseArgs(argv) {
  const options = {
    inputDir: path.join(projectRoot, "output", "extract", "data"),
    outputDir: path.join(projectRoot, "output", "repack", "data"),
    files: null,
    password: "",
    salt: "",
    keyHex: "",
    ivHex: ""
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") options.inputDir = path.resolve(argv[++i] || options.inputDir);
    else if (arg === "--output") options.outputDir = path.resolve(argv[++i] || options.outputDir);
    else if (arg === "--files") options.files = (argv[++i] || "").split(",").map(name => name.trim()).filter(Boolean);
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

function inferInputFiles(inputDir, explicitFiles) {
  const names = explicitFiles || fs.readdirSync(inputDir).filter(name => /\.json$/i.test(name)).sort();
  return names.filter(name => /\.json$/i.test(name) && !name.startsWith("_"));
}

const options = parseArgs(process.argv.slice(2));
const cryptoOptions = buildCryptoOptions(options);
const resolvedCrypto = createDataCryptoOptions(cryptoOptions);

if (!fs.existsSync(options.inputDir)) {
  throw new Error(`input directory not found: ${options.inputDir}`);
}

fs.mkdirSync(options.outputDir, { recursive: true });

const results = [];
for (const entry of inferInputFiles(options.inputDir, options.files)) {
  const source = path.join(options.inputDir, entry);
  if (!fs.existsSync(source)) {
    throw new Error(`input file not found: ${source}`);
  }
  const output = path.join(options.outputDir, entry);
  const value = JSON.parse(fs.readFileSync(source, "utf8"));
  const encrypted = encryptDataObject(value, cryptoOptions);
  fs.writeFileSync(output, encrypted, "utf8");
  const roundTrip = decryptDataObject(encrypted, cryptoOptions);
  results.push({
    name: entry,
    source,
    output,
    outputLength: encrypted.length,
    verified: stableJson(roundTrip) === stableJson(value)
  });
}

const report = {
  inputDir: options.inputDir,
  outputDir: options.outputDir,
  count: results.length,
  crypto: {
    algorithm: resolvedCrypto.algorithm,
    keyHex: resolvedCrypto.keyHex,
    ivHex: resolvedCrypto.ivHex
  },
  results
};

fs.writeFileSync(path.join(options.outputDir, "_repack-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const failures = results.filter(result => !result.verified);
if (failures.length) {
  throw new Error(`verification failed for: ${failures.map(result => result.name).join(", ")}`);
}

console.log(`Wrote ${results.length} encrypted data files to ${options.outputDir}`);
