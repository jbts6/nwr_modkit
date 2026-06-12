import fs from "node:fs";
import path from "node:path";
import { parseDataFileText } from "./data-codec.mjs";
import { decodeSaveText } from "./save-codec.mjs";
import { resolveGameRoot, resolveProjectRootFromTool } from "./modkit-config.mjs";

const projectRoot = resolveProjectRootFromTool(import.meta.url);
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const gameRoot = resolveGameRoot(projectRoot, args["game-root"] || "");
const savePath = path.resolve(
  args.save || path.join(gameRoot, "www", "save", "file1.rpgsave")
);
const dataDir = path.join(gameRoot, "www", "data");

const system = loadData("System.json");
const items = loadData("Items.json");
const armors = loadData("Armors.json");
const actors = loadData("Actors.json");
const mapInfos = loadData("MapInfos.json");
const save = decodeSaveText(fs.readFileSync(savePath, "utf8"));

const variables = asArray(save.variables?._data);
const switches = asArray(save.switches?._data);
const party = save.party || {};
const partyActorIds = asArray(party._actors).filter(value => value != null);

const directTransferChecks = [
  {
    commonEventId: 334,
    name: "modified armor count",
    source: dbName(armors, 400),
    value: bagCount(party._armors, 400),
    limit: 3,
    operator: ">="
  },
  {
    commonEventId: 337,
    name: "modified item count",
    source: dbName(items, 656),
    value: bagCount(party._items, 656),
    limit: 200,
    operator: ">="
  },
  {
    commonEventId: 338,
    name: "modified item count",
    source: dbName(items, 653),
    value: bagCount(party._items, 653),
    limit: 200,
    operator: ">="
  },
  {
    commonEventId: 339,
    name: "modified item count",
    source: dbName(items, 654),
    value: bagCount(party._items, 654),
    limit: 80,
    operator: ">="
  },
  {
    commonEventId: 340,
    name: "modified gold",
    source: "party gold",
    value: Number(party._gold || 0),
    limit: 9000000,
    operator: ">="
  },
  {
    commonEventId: 341,
    name: "modified merit variable",
    source: variableName(29),
    value: Number(variables[29] || 0),
    limit: 5000,
    operator: ">="
  },
  {
    commonEventId: 342,
    name: "modified item count",
    source: dbName(items, 730),
    value: bagCount(party._items, 730),
    limit: 2,
    operator: ">="
  },
  {
    commonEventId: 343,
    name: "modified item count duplicate",
    source: dbName(items, 730),
    value: bagCount(party._items, 730),
    limit: 2,
    operator: ">="
  },
  {
    commonEventId: 344,
    name: "runtime actor param check",
    source: `${dbName(actors, 2)} param(9)`,
    value: null,
    limit: 19996,
    operator: ">=",
    unknown: true,
    note: "This is computed by Game_Actor.param(9) at runtime; use runtime tracing if this is the suspected hit."
  },
  {
    commonEventId: 405,
    name: "actor in party without required item",
    source: `${dbName(actors, 16)} requires ${dbName(items, 59)}`,
    value: partyActorIds.includes(16) && bagCount(party._items, 59) <= 0,
    limit: true,
    operator: "===",
    boolean: true
  }
].map(finalizeCheck);

const switchOnlyChecks = [
  {
    commonEventId: 335,
    name: "growth injection use count",
    source: variableName(210),
    value: Number(variables[210] || 0),
    limit: 99,
    operator: ">="
  },
  {
    commonEventId: 336,
    name: "injection item count",
    source: dbName(items, 45),
    value: bagCount(party._items, 45),
    limit: 99,
    operator: ">="
  },
  actorRequiresItem(403, 16, 49),
  actorRequiresItem(406, 57, 819),
  actorRequiresItem(407, 48, 73),
  actorRequiresItem(571, 57, 101),
  actorRequiresItem(572, 31, 860)
].map(finalizeCheck);

const report = {
  savePath,
  currentMap: {
    id: save.map?._mapId ?? null,
    name: mapInfos[save.map?._mapId]?.name ?? null,
    x: save.player?._x ?? null,
    y: save.player?._y ?? null
  },
  prisonMap: {
    id: 695,
    name: mapInfos[695]?.name ?? null,
    transferX: 4,
    transferY: 4
  },
  punishmentSwitch: {
    id: 520,
    name: system.switches?.[520] ?? null,
    value: Boolean(switches[520])
  },
  party: {
    gold: Number(party._gold || 0),
    actorIds: partyActorIds
  },
  directTransferChecks,
  switchOnlyChecks,
  hits: [
    ...directTransferChecks.filter(check => check.hit),
    ...switchOnlyChecks.filter(check => check.hit)
  ]
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

function loadData(name) {
  return parseDataFileText(fs.readFileSync(path.join(dataDir, name), "utf8"));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value["@a"])) return value["@a"];
  return [];
}

function bagCount(bag, id) {
  return Number((bag && bag[String(id)]) || 0);
}

function dbName(db, id) {
  const value = db?.[id];
  const name = value?.name ? String(value.name) : "(blank)";
  return `${name} #${id}`;
}

function variableName(id) {
  const name = system.variables?.[id] ? String(system.variables[id]) : "(blank)";
  return `${name} variable #${id}`;
}

function actorRequiresItem(commonEventId, actorId, itemId) {
  return {
    commonEventId,
    name: "actor in party without required item",
    source: `${dbName(actors, actorId)} requires ${dbName(items, itemId)}`,
    value: partyActorIds.includes(actorId) && bagCount(party._items, itemId) <= 0,
    limit: true,
    operator: "===",
    boolean: true
  };
}

function finalizeCheck(check) {
  if (check.unknown) {
    return { ...check, hit: null };
  }
  if (check.boolean) {
    return { ...check, hit: check.value === check.limit };
  }
  return { ...check, hit: compare(Number(check.value), Number(check.limit), check.operator) };
}

function compare(left, right, operator) {
  if (operator === ">=") return left >= right;
  if (operator === ">") return left > right;
  if (operator === "<=") return left <= right;
  if (operator === "<") return left < right;
  if (operator === "===") return left === right;
  return false;
}

function printReport(report) {
  console.log(`Save: ${report.savePath}`);
  console.log(`Current map: ${report.currentMap.id} ${report.currentMap.name || ""} (${report.currentMap.x}, ${report.currentMap.y})`);
  console.log(`Prison map: ${report.prisonMap.id} ${report.prisonMap.name || ""} (${report.prisonMap.transferX}, ${report.prisonMap.transferY})`);
  console.log(`Punishment switch: ${report.punishmentSwitch.id} ${report.punishmentSwitch.name || ""} = ${report.punishmentSwitch.value}`);
  console.log("");
  console.log("Direct prison transfer checks:");
  for (const check of report.directTransferChecks) printCheck(check);
  console.log("");
  console.log("Punishment-switch-only checks:");
  for (const check of report.switchOnlyChecks) printCheck(check);
  console.log("");
  const hits = report.hits.filter(check => check.hit);
  console.log(`Hits: ${hits.length ? hits.map(check => `CE${check.commonEventId} ${check.source}`).join("; ") : "none"}`);
}

function printCheck(check) {
  const status = check.hit === null ? "UNKNOWN" : check.hit ? "HIT" : "OK";
  const value = check.unknown ? "runtime" : check.value;
  console.log(`[${status}] CE${check.commonEventId} ${check.name}: ${check.source}; value=${value}; limit ${check.operator} ${check.limit}`);
  if (check.note) console.log(`      ${check.note}`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      parsed[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    i += 1;
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node ./nwr_modkit/tools/diagnose-prison-checks.mjs --game-root .
  node ./nwr_modkit/tools/diagnose-prison-checks.mjs --save ./www/save/file1.rpgsave --json
`);
}
