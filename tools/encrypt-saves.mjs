import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeSaveText, encodeSaveText, stableJson } from "./save-codec.mjs";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(toolDir, "..");

function parseArgs(argv) {
  const options = {
    inputDir: path.join(projectRoot, "output", "extract", "save"),
    outputDir: path.join(projectRoot, "output", "repack", "save"),
    ids: null,
    includeConfig: true
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") options.inputDir = path.resolve(argv[++i]);
    else if (arg === "--output") options.outputDir = path.resolve(argv[++i]);
    else if (arg === "--ids") options.ids = argv[++i].split(",").map(x => Number(x.trim())).filter(Number.isFinite);
    else if (arg === "--no-config") options.includeConfig = false;
    else if (!arg.startsWith("--") && !options._posInput) {
      options.inputDir = path.resolve(arg);
      options._posInput = true;
    } else if (!arg.startsWith("--") && !options._posOutput) {
      options.outputDir = path.resolve(arg);
      options._posOutput = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeOne(inputDir, outputDir, baseName) {
  const inputPath = path.join(inputDir, `${baseName}.json`);
  if (!fs.existsSync(inputPath)) return null;
  const value = readJson(inputPath);
  const text = encodeSaveText(value);
  const outputPath = path.join(outputDir, `${baseName}.rpgsave`);
  fs.writeFileSync(outputPath, text, "utf8");
  const roundTrip = decodeSaveText(text);
  return {
    name: `${baseName}.rpgsave`,
    source: inputPath,
    output: outputPath,
    outputLength: text.length,
    verified: stableJson(roundTrip) === stableJson(value)
  };
}

function inferBases(inputDir, options) {
  const bases = [];
  if (options.includeConfig) bases.push("config");
  bases.push("global");
  if (options.ids) {
    for (const id of options.ids) {
      if (id === 0) bases.push("global");
      else bases.push(`file${id}`);
    }
  } else {
    for (const name of fs.readdirSync(inputDir).sort()) {
      const match = name.match(/^(file\d+)\.json$/i);
      if (match) bases.push(match[1]);
    }
  }
  return Array.from(new Set(bases));
}

const options = parseArgs(process.argv.slice(2));
fs.mkdirSync(options.outputDir, { recursive: true });

const results = inferBases(options.inputDir, options)
  .map(base => writeOne(options.inputDir, options.outputDir, base))
  .filter(Boolean);

const failures = results.filter(item => !item.verified);
fs.writeFileSync(path.join(options.outputDir, "_repack-report.json"), `${JSON.stringify({
  inputDir: options.inputDir,
  outputDir: options.outputDir,
  count: results.length,
  results
}, null, 2)}\n`, "utf8");

if (failures.length) {
  throw new Error(`verification failed for: ${failures.map(x => x.name).join(", ")}`);
}

for (const result of results) {
  console.log(`${result.name}\t${result.outputLength}\tverified=${result.verified}`);
}
console.log(`Wrote ${results.length} files to ${options.outputDir}`);
