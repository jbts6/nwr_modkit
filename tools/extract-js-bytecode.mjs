import fs from "node:fs";
import path from "node:path";
import { resolveGameRoot, resolveProjectRootFromTool } from "./modkit-config.mjs";

const projectRoot = resolveProjectRootFromTool(import.meta.url);

function parseArgs(argv) {
  const options = {
    gameRoot: "",
    inputDir: "",
    outputDir: path.join(projectRoot, "output", "extract", "js-bytecode")
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--game-root") options.gameRoot = argv[++i] || "";
    else if (arg === "--input") options.inputDir = path.resolve(argv[++i] || options.inputDir);
    else if (arg === "--output") options.outputDir = path.resolve(argv[++i] || options.outputDir);
    else throw new Error(`unknown argument: ${arg}`);
  }

  return options;
}

function walkFiles(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(fullPath));
    else if (entry.isFile()) out.push(fullPath);
  }
  return out;
}

function isNwBytecode(buffer) {
  return buffer.length >= 8
    && buffer[0] === 0x03
    && buffer[1] === 0x04
    && buffer[2] === 0xde
    && buffer[3] === 0xc0;
}

function byteHead(buffer, count = 32) {
  return Array.from(buffer.subarray(0, Math.min(count, buffer.length)))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

const options = parseArgs(process.argv.slice(2));
const gameRoot = options.inputDir ? "" : resolveGameRoot(projectRoot, options.gameRoot);
const inputDir = options.inputDir || path.join(gameRoot, "www", "js");

if (!fs.existsSync(inputDir)) {
  throw new Error(`js directory not found: ${inputDir}`);
}

fs.rmSync(options.outputDir, { recursive: true, force: true });
fs.mkdirSync(options.outputDir, { recursive: true });

const results = [];
for (const source of walkFiles(inputDir).filter(file => /\.js$/i.test(file)).sort()) {
  const rel = path.relative(inputDir, source);
  const data = fs.readFileSync(source);
  const bytecode = isNwBytecode(data);
  const targetBase = bytecode ? path.join(options.outputDir, "bytecode") : path.join(options.outputDir, "plain");
  const target = bytecode
    ? path.join(targetBase, `${rel}.jsc`)
    : path.join(targetBase, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  results.push({
    path: rel.replaceAll(path.sep, "/"),
    source,
    output: target,
    length: data.length,
    type: bytecode ? "nw-v8-bytecode" : "plain-js",
    head: byteHead(data)
  });
}

const bytecodeCount = results.filter(item => item.type === "nw-v8-bytecode").length;
const plainCount = results.filter(item => item.type === "plain-js").length;
fs.writeFileSync(path.join(options.outputDir, "_js-report.json"), `${JSON.stringify({
  gameRoot: gameRoot || null,
  inputDir,
  outputDir: options.outputDir,
  total: results.length,
  bytecodeCount,
  plainCount,
  results
}, null, 2)}\n`, "utf8");

console.log(`Scanned ${results.length} .js files`);
console.log(`NW/V8 bytecode: ${bytecodeCount}`);
console.log(`Plain JS: ${plainCount}`);
console.log(`Wrote report to ${path.join(options.outputDir, "_js-report.json")}`);
