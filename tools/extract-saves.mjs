import fs from "node:fs";
import path from "node:path";
import { resolveGameRoot, resolveProjectRootFromTool } from "./modkit-config.mjs";
import { decodeSaveText, stableJson } from "./save-codec.mjs";

const projectRoot = resolveProjectRootFromTool(import.meta.url);

function parseArgs(argv) {
  const options = {
    gameRoot: "",
    outputDir: path.join(projectRoot, "output", "extract", "save")
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--game-root") options.gameRoot = argv[++i] || "";
    else if (arg === "--output") options.outputDir = path.resolve(argv[++i] || options.outputDir);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const gameRoot = resolveGameRoot(projectRoot, options.gameRoot);
const saveDir = path.join(gameRoot, "www", "save");

if (!fs.existsSync(saveDir)) {
  throw new Error(`save directory not found: ${saveDir}`);
}

fs.rmSync(options.outputDir, { recursive: true, force: true });
fs.mkdirSync(options.outputDir, { recursive: true });

const results = [];
for (const entry of fs.readdirSync(saveDir).filter(name => /\.rpgsave$/i.test(name)).sort()) {
  const source = path.join(saveDir, entry);
  const baseName = entry.replace(/\.rpgsave$/i, "");
  const output = path.join(options.outputDir, `${baseName}.json`);
  const rawOutput = path.join(options.outputDir, `${baseName}.rpgsave.txt`);
  const text = fs.readFileSync(source, "utf8");
  const decoded = decodeSaveText(text);
  fs.writeFileSync(output, `${JSON.stringify(decoded, null, 2)}\n`, "utf8");
  fs.writeFileSync(rawOutput, text, "utf8");
  const verified = stableJson(decodeSaveText(text)) === stableJson(decoded);
  results.push({
    name: entry,
    source,
    output,
    rawOutput,
    sourceLength: text.length,
    jsonLength: fs.statSync(output).size,
    verified,
    keys: decoded && typeof decoded === "object" ? Object.keys(decoded).slice(0, 80) : []
  });
}

fs.writeFileSync(path.join(options.outputDir, "_extract-report.json"), `${JSON.stringify({
  gameRoot,
  saveDir,
  outputDir: options.outputDir,
  count: results.length,
  results
}, null, 2)}\n`, "utf8");

for (const result of results) {
  console.log(`${result.name}\t${result.jsonLength}\tverified=${result.verified}`);
}
console.log(`Extracted ${results.length} saves to ${options.outputDir}`);
