import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(toolDir, "..");
const bridgeDir = path.join(projectRoot, "runtime", "bridge-state");
const commandPath = path.join(bridgeDir, "commands.jsonl");
const statePath = path.join(bridgeDir, "state.json");
const eventPath = path.join(bridgeDir, "events.jsonl");

const ALLOW_GUARDED_FLAGS = new Set(["--allow-guarded", "--unsafe"]);
const NORMAL_COMMAND_TYPES = new Set(`
  ping runtime.inspect runtime.search data.dump
  trainer.options.get trainer.hooks.info map.current trainer.options.set
`.trim().split(/\s+/));
const GUARDED_COMMAND_TYPES = new Set(`
  gold.add gold.set variable.set switch.set item.add actor.unlock actor.add actor.remove
  actor.recover actor.level.set actor.exp.add actor.vitals.set actor.param.add actor.name.set
  actor.skill.learn actor.skill.forget party.recover battle.killEnemies
  battle.escape map.transfer commonEvent.run save
  title.refresh
`.trim().split(/\s+/));

function usage() {
  console.log(`Usage:
  node trainer-send.mjs [--allow-guarded|--unsafe] <command> [args...]

Status:
  node trainer-send.mjs status

Normal read-only commands:
  node trainer-send.mjs ping
  node trainer-send.mjs runtime.search gold map save actor item
  node trainer-send.mjs runtime.inspect window.TK.$ 300
  node trainer-send.mjs data.dump
  node trainer-send.mjs data.dump Items,System,MapInfos
  node trainer-send.mjs trainer.options.get
  node trainer-send.mjs trainer.hooks.info
  node trainer-send.mjs map.current

Normal reversible mutation:
  node trainer-send.mjs trainer.options.set expRate=2 goldRate=2 dropRate=3 noSkillCost=true oneHitKill=false invincible=false

Guarded commands require --allow-guarded or --unsafe and may mutate scene, save, map, battle, party, or items:
  node trainer-send.mjs --allow-guarded gold.add 10000
  node trainer-send.mjs --allow-guarded gold.set 999999
  node trainer-send.mjs --allow-guarded variable.set 12 999
  node trainer-send.mjs --allow-guarded switch.set 34 true
  node trainer-send.mjs --allow-guarded item.add item 5 10
  node trainer-send.mjs --allow-guarded item.add weapon 1 1
  node trainer-send.mjs --allow-guarded item.add armor 1 1
  node trainer-send.mjs --allow-guarded actor.unlock 1
  node trainer-send.mjs --allow-guarded actor.add 1
  node trainer-send.mjs --allow-guarded actor.remove 1
  node trainer-send.mjs --allow-guarded actor.recover 1
  node trainer-send.mjs --allow-guarded actor.name.set 1 Hero
  node trainer-send.mjs --allow-guarded actor.level.set 1 20
  node trainer-send.mjs --allow-guarded actor.exp.add 1 1000
  node trainer-send.mjs --allow-guarded actor.vitals.set 1 999 999 100
  node trainer-send.mjs --allow-guarded actor.skill.learn 1 10
  node trainer-send.mjs --allow-guarded actor.skill.forget 1 10
  node trainer-send.mjs --allow-guarded actor.param.add 1 2 50
  node trainer-send.mjs --allow-guarded party.recover
  node trainer-send.mjs --allow-guarded battle.killEnemies
  node trainer-send.mjs --allow-guarded battle.escape
  node trainer-send.mjs --allow-guarded map.transfer 5 10 12
  node trainer-send.mjs --allow-guarded commonEvent.run 10
  node trainer-send.mjs --allow-guarded save 1
  node trainer-send.mjs --allow-guarded title.refresh`);
}

function parseValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  const number = Number(value);
  if (Number.isFinite(number) && String(number) === String(value)) return number;
  return value;
}

function parseKeyValueArgs(parts) {
  const options = {};
  for (const part of parts) {
    const index = String(part).indexOf("=");
    if (index <= 0) continue;
    options[String(part).slice(0, index)] = parseValue(String(part).slice(index + 1));
  }
  return options;
}

function makeCommand(argv) {
  const type = argv[0];
  if (!type || type === "help" || type === "--help") return null;
  if (type === "status") return { statusOnly: true };
  if (type === "ping") return { type: "ping" };
  if (type === "gold.add") return { type, amount: Number(argv[1]) };
  if (type === "gold.set") return { type, value: Number(argv[1]) };
  if (type === "variable.set") return { type, id: Number(argv[1]), value: parseValue(argv[2]) };
  if (type === "switch.set") return { type, id: Number(argv[1]), value: parseValue(argv[2]) };
  if (type === "item.add") return { type, kind: argv[1] || "item", id: Number(argv[2]), amount: Number(argv[3] || 1) };
  if (type === "actor.unlock") return { type, id: Number(argv[1]) };
  if (type === "actor.add") return { type, id: Number(argv[1]) };
  if (type === "actor.remove") return { type, id: Number(argv[1]) };
  if (type === "actor.recover") return { type, id: Number(argv[1]) };
  if (type === "actor.level.set") return { type, id: Number(argv[1]), level: Number(argv[2]) };
  if (type === "actor.exp.add") return { type, id: Number(argv[1]), amount: Number(argv[2]) };
  if (type === "actor.vitals.set") return { type, id: Number(argv[1]), hp: parseValue(argv[2]), mp: parseValue(argv[3]), tp: parseValue(argv[4]) };
  if (type === "actor.param.add") return { type, id: Number(argv[1]), paramId: Number(argv[2]), value: Number(argv[3]) };
  if (type === "actor.name.set") return { type, id: Number(argv[1]), name: argv.slice(2).join(" ") };
  if (type === "actor.skill.learn") return { type, id: Number(argv[1]), skillId: Number(argv[2]) };
  if (type === "actor.skill.forget") return { type, id: Number(argv[1]), skillId: Number(argv[2]) };
  if (type === "battle.killEnemies") return { type, finish: argv[1] === undefined ? undefined : parseValue(argv[1]) };
  if (type === "battle.escape") return { type };
  if (type === "party.recover") return { type };
  if (type === "trainer.options.get") return { type };
  if (type === "trainer.hooks.info") return { type };
  if (type === "runtime.search") return { type, keywords: argv.slice(1).filter(Boolean) };
  if (type === "runtime.inspect") return { type, path: argv[1] || "window", maxKeys: argv[2] ? Number(argv[2]) : undefined };
  if (type === "data.dump") return { type, names: argv.slice(1).join(" ") };
  if (type === "map.current") return { type };
  if (type === "map.transfer") return { type, mapId: Number(argv[1]), x: Number(argv[2] || 0), y: Number(argv[3] || 0), direction: Number(argv[4] || 2), fade: Number(argv[5] || 0) };
  if (type === "commonEvent.run") return { type, id: Number(argv[1]) };
  if (type === "trainer.options.set") {
    return { type, options: parseKeyValueArgs(argv.slice(1)) };
  }
  if (type === "save") return { type, id: Number(argv[1] || 1) };
  if (type === "title.refresh") return { type };
  throw new Error(`unknown command: ${type}`);
}

function parseCliArgs(argv) {
  const commandArgs = [];
  let allowGuarded = false;
  for (const arg of argv) {
    if (ALLOW_GUARDED_FLAGS.has(arg)) {
      allowGuarded = true;
    } else {
      commandArgs.push(arg);
    }
  }
  return { commandArgs, allowGuarded };
}

function assertCommandAllowed(command, allowGuarded) {
  if (!command.type || NORMAL_COMMAND_TYPES.has(command.type)) return;
  if (!GUARDED_COMMAND_TYPES.has(command.type)) throw new Error(`unknown command: ${command.type}`);
  if (!allowGuarded) {
    throw new Error(`unsupported command without --allow-guarded: ${command.type}`);
  }
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

const parsedArgs = parseCliArgs(process.argv.slice(2));
let command;
try {
  command = makeCommand(parsedArgs.commandArgs);
  if (command) assertCommandAllowed(command, parsedArgs.allowGuarded);
} catch (error) {
  console.error(String(error && error.message || error));
  process.exit(1);
}

if (!command) {
  usage();
  process.exit(0);
}

if (command.statusOnly) {
  console.log(JSON.stringify(readJsonIfExists(statePath), null, 2));
  process.exit(0);
}

fs.mkdirSync(bridgeDir, { recursive: true });
command.commandId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
command.ts = Date.now();
fs.appendFileSync(commandPath, JSON.stringify(command) + "\n", "utf8");
console.log(`queued ${command.type} commandId=${command.commandId}`);

setTimeout(() => {
  const state = readJsonIfExists(statePath);
  console.log("state:");
  console.log(JSON.stringify(state, null, 2));
  if (fs.existsSync(eventPath)) {
    const lines = fs.readFileSync(eventPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
    const event = lines.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean).reverse().find(item => item.commandId === command.commandId);
    if (event) {
      console.log("event:");
      console.log(JSON.stringify(event, null, 2));
    }
  }
}, 700);
