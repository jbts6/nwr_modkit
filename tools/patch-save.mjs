import fs from "node:fs";
import path from "node:path";
import { resolveProjectRootFromTool } from "./modkit-config.mjs";

const projectRoot = resolveProjectRootFromTool(import.meta.url);

function parseArgs(argv) {
  const options = {
    slot: 1,
    input: "",
    output: "",
    gold: null,
    inventory: [],
    vars: [],
    switches: []
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--slot") options.slot = Number(argv[++i]);
    else if (arg === "--input") options.input = path.resolve(argv[++i]);
    else if (arg === "--output") options.output = path.resolve(argv[++i]);
    else if (arg === "--gold") options.gold = parseInteger(argv[++i], "gold");
    else if (arg === "--item") options.inventory.push(parsePair(argv[++i], "item", "item"));
    else if (arg === "--weapon") options.inventory.push(parsePair(argv[++i], "weapon", "weapon"));
    else if (arg === "--armor") options.inventory.push(parsePair(argv[++i], "armor", "armor"));
    else if (arg === "--var") options.vars.push(parsePair(argv[++i], "variable", "var", parseLooseValue));
    else if (arg === "--switch") options.switches.push(parsePair(argv[++i], "switch", "switch", parseBoolean));
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.slot) || options.slot < 1) {
    throw new Error("--slot must be a positive integer");
  }
  if (!options.input) {
    options.input = path.join(projectRoot, "output", "extract", "save", `file${options.slot}.json`);
  }
  if (!options.output) {
    options.output = path.join(projectRoot, "output", "edit", "save", `file${options.slot}.json`);
  }
  return options;
}

function parseInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer: ${value}`);
  return parsed;
}

function parsePair(text, label, kind, valueParser = parseInteger) {
  const match = String(text || "").match(/^(\d+)=(.+)$/);
  if (!match) throw new Error(`${label} expects id=value, got: ${text}`);
  return {
    kind,
    id: parseInteger(match[1], `${label} id`),
    value: valueParser(match[2], label)
  };
}

function parseBoolean(value, label) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${label} must be true or false: ${value}`);
}

function parseLooseValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function signatureFor(value) {
  const bytes = Buffer.from(String(value), "utf8");
  const result = {};
  for (let index = 0; index < bytes.length; index += 1) {
    result[index] = bytes[index];
  }
  return result;
}

function wrappedArray(owner, prop) {
  const wrapped = owner?.[prop];
  if (!wrapped || !Array.isArray(wrapped["@a"])) {
    throw new Error(`${prop} is not a wrapped array`);
  }
  return wrapped["@a"];
}

function setWrappedArrayValue(owner, dataProp, signProp, id, value) {
  const data = wrappedArray(owner, dataProp);
  const signs = wrappedArray(owner, signProp);
  data[id] = value;
  signs[id] = signatureFor(value);
}

function findInventorySignKey(signs, kind, id) {
  const suffix = String(id);
  return Object.keys(signs)
    .filter(key => key !== "@c")
    .find(key => key.startsWith(kind) && key.endsWith(suffix));
}

function setInventory(save, change) {
  const containerName = change.kind === "item" ? "_items" : change.kind === "weapon" ? "_weapons" : "_armors";
  const container = save.party?.[containerName];
  const signs = save.party?._numitemsSign;
  if (!container || !signs) throw new Error(`party inventory data is missing`);

  const key = String(change.id);
  const existingSignKey = findInventorySignKey(signs, change.kind, change.id);
  if (!existingSignKey && container[key] == null) {
    throw new Error(`${change.kind} ${change.id} is not already present; add it in runtime so the game can create its item name signature`);
  }

  if (change.value <= 0) {
    delete container[key];
    if (existingSignKey) delete signs[existingSignKey];
    return;
  }

  container[key] = change.value;
  if (existingSignKey) {
    signs[existingSignKey] = signatureFor(change.value);
  } else {
    throw new Error(`${change.kind} ${change.id} has no known signature key`);
  }
}

const options = parseArgs(process.argv.slice(2));
const save = JSON.parse(fs.readFileSync(options.input, "utf8"));
const summary = [];

if (options.gold !== null) {
  save.party._gold = options.gold;
  summary.push(`gold=${options.gold}`);
}

for (const change of options.inventory) {
  setInventory(save, change);
  summary.push(`${change.kind}${change.id}=${change.value}`);
}

for (const change of options.vars) {
  setWrappedArrayValue(save.variables, "_data", "_dataSign", change.id, change.value);
  summary.push(`var${change.id}=${JSON.stringify(change.value)}`);
}

for (const change of options.switches) {
  setWrappedArrayValue(save.switches, "_data", "_dataSign", change.id, change.value);
  summary.push(`switch${change.id}=${change.value}`);
}

fs.mkdirSync(path.dirname(options.output), { recursive: true });
fs.writeFileSync(options.output, `${JSON.stringify(save, null, 2)}\n`, "utf8");

console.log(`Patched ${options.output}`);
console.log(summary.length ? summary.join("\n") : "No changes requested");
