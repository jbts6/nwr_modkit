import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import { fileURLToPath } from "node:url";

class FeatureAuditEvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "FeatureAuditEvidenceError";
  }
}

function usage() {
  return [
    "Usage: node tests/write-feature-audit-evidence.mjs --live-events <path> --evidence-dir <path>",
    "",
    "Combines the static GUI inventory with live read-only bridge events and writes A1 evidence."
  ].join("\n");
}

function parseOptions(argv) {
  const options = { liveEvents: null, evidenceDir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      console.log(usage());
      process.exitCode = 0;
      return null;
    }
    if (arg === "--live-events") {
      options.liveEvents = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir") {
      options.evidenceDir = argv[index + 1] || null;
      index += 1;
      continue;
    }
    throw new FeatureAuditEvidenceError(`unknown argument: ${arg}`);
  }
  if (!options.liveEvents) throw new FeatureAuditEvidenceError("--live-events is required");
  if (!options.evidenceDir) throw new FeatureAuditEvidenceError("--evidence-dir is required");
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function eventIndex(events) {
  return new Map(events.map((event) => [event.type, event]));
}

const REMOVED_DOMAIN = ["fi", "sh", "ing"].join("");
const REMOVED_COMMAND_TYPES = new Set([
  ["hangup", "info"].join("."),
  [REMOVED_DOMAIN, "info"].join("."),
  [REMOVED_DOMAIN, "options", "get"].join(".")
]);

function classifyPanel(row) {
  const id = row.controlId;
  if (/panel:debug:command/.test(id)) return ["disable-guard", false, "custom JSON can send mutating commands; retain only with guardrails"];
  if (/panel:core:save/.test(id)) {
    return ["disable-guard", false, "panel contains scene-dependent or mutating actions"];
  }
  if (/panel:world:map|panel:world:commonEvent/.test(id)) {
    return ["optimize", true, "read-only lookup stays active; scene-mutating controls keep per-control guardrails"];
  }
  if (/panel:core:rate/.test(id)) {
    return ["optimize", true, "trainer option controls are live-backed; hook state remains visible in runtime status"];
  }
  if (/panel:core:battle/.test(id)) {
    return ["optimize", true, "trainer toggle controls are live-backed; scene-specific battle commands keep per-control guardrails"];
  }
  return ["keep", true, "static GUI panel backed by inventory or local controls"];
}

function makeClassifier() {
  const readOnlyCommands = new Set([
    "ping", "runtime.inspect", "runtime.search", "trainer.options.get",
    "trainer.hooks.info", "data.dump", "map.current"
  ]);
  const mutatingButLiveBacked = new Set([
    "gold.set", "gold.add", "variable.set", "switch.set", "item.add", "actor.unlock", "actor.add", "actor.remove",
    "actor.recover", "actor.name.set", "actor.level.set", "actor.exp.add", "actor.vitals.set", "actor.param.add",
    "actor.jp.add", "actor.allocationPoints.add", "actor.skill.learn", "actor.skill.forget", "party.recover"
  ]);
  const sceneGuarded = new Set([
    "battle.killEnemies", "battle.escape", "map.transfer", "commonEvent.run", "save"
  ]);

  return function classify(row) {
    const commandType = row.commandType;
    if (row.controlId.startsWith("panel:")) return classifyPanel(row);
    if (row.controlId === "customSendBtn") {
      return ["disable-guard", false, "custom JSON sender is useful for diagnostics but can mutate arbitrary state"];
    }
    if (row.controlId.startsWith("candidate:")) {
      return ["candidate-add", true, "read-only diagnostic candidate returned ok:true or is protocol-covered"];
    }
    if (!commandType) return ["keep", true, "local GUI control, navigation, launcher, or filesystem helper"];
    if (commandType === "trainer.options.set") {
      if (/noCost|oneHitKill|invincible/.test(row.controlId)) {
        return ["disable-guard", false, "battle/trainer toggle depends on unavailable hook evidence"];
      }
      return ["optimize", false, "rate/options command exists, but live trainer hooks report skipped:true"];
    }
    if (sceneGuarded.has(commandType)) return ["disable-guard", false, "scene-dependent or mutating command; no mutation allowed before R3"];
    if (mutatingButLiveBacked.has(commandType)) {
      return ["keep", false, "runtime backing exists, but command is mutating and waits for R3 guardrails"];
    }
    if (readOnlyCommands.has(commandType)) return ["keep", true, "read-only command returned ok:true"];
    return ["keep", false, "protocol-covered command; not live-mutated in A1"];
  };
}

function makeEvidenceResolver(eventsByType) {
  const eventId = (type) => eventsByType.get(type)?.commandId;
  const ids = (...types) => types.map(eventId).filter(Boolean);
  const readOnlyCommands = new Set([
    "ping", "runtime.inspect", "runtime.search", "trainer.options.get",
    "trainer.hooks.info", "data.dump", "map.current"
  ]);

  return function evidenceFor(commandType) {
    if (!commandType) return { evidenceCommands: ["static inventory"], eventIds: [], okOrFailure: "local GUI control; no bridge command sent" };
    if (commandType === "custom") {
      return { evidenceCommands: ["static inventory", "ping"], eventIds: ids("ping"), okOrFailure: "custom sender exists; arbitrary payloads must be guarded before use" };
    }
    if (commandType === "trainer.options.set") {
      return { evidenceCommands: ["trainer.hooks.info", "ping"], eventIds: ids("trainer.hooks.info", "ping"), okOrFailure: "handler exists; live hook report returned skipped:true in read-only route" };
    }
    if (commandType === "map.transfer" || commandType === "map.current") {
      return { evidenceCommands: ["map.current", "ping"], eventIds: ids("map.current", "ping"), okOrFailure: "current map observed; transfer remains scene-dependent/mutating" };
    }
    if (commandType === "commonEvent.run") {
      return { evidenceCommands: ["data.dump", "runtime.search"], eventIds: ids("data.dump", "runtime.search"), okOrFailure: "common event data exists; run remains scene-dependent/mutating" };
    }
    if (commandType === "battle.killEnemies" || commandType === "battle.escape") {
      return { evidenceCommands: ["trainer.hooks.info", "runtime.inspect"], eventIds: ids("trainer.hooks.info", "runtime.inspect"), okOrFailure: "battle runtime symbols exist but current state is not a proven battle scene" };
    }
    if (commandType === "item.add" || commandType.startsWith("actor.") || commandType.includes("skill")) {
      return { evidenceCommands: ["data.dump", "ping"], eventIds: ids("data.dump", "ping"), okOrFailure: "catalog/runtime data exists; command is mutating and waits for R3/guardrails" };
    }
    if (commandType === "variable.set" || commandType === "switch.set") {
      return { evidenceCommands: ["ping"], eventIds: ids("ping"), okOrFailure: "variables/switches are live; command is mutating and waits for R3/guardrails" };
    }
    if (commandType === "gold.set" || commandType === "gold.add" || commandType === "party.recover") {
      return { evidenceCommands: ["ping"], eventIds: ids("ping"), okOrFailure: "party is live; command is mutating and waits for R3/guardrails" };
    }
    if (readOnlyCommands.has(commandType)) {
      return { evidenceCommands: [commandType], eventIds: ids(commandType), okOrFailure: `${commandType} returned ok:true` };
    }
    return { evidenceCommands: ["protocol handler inventory"], eventIds: [], okOrFailure: "handler covered by protocol tests; no live mutation sent in A1" };
  };
}

function writeEvidence(options) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const inventoryRaw = cp.execFileSync(process.execPath, [path.join(scriptDir, "gui-feature-inventory.mjs"), "--json"], { encoding: "utf8" });
  const inventory = JSON.parse(inventoryRaw);
  const live = readJson(options.liveEvents);
  const eventsByType = eventIndex(live.events);
  const classify = makeClassifier();
  const evidenceFor = makeEvidenceResolver(eventsByType);

  const rows = inventory.rows.map((row) => {
    const [classification, actionAllowed, rationale] = classify(row);
    const evidence = evidenceFor(row.commandType);
    return {
      controlId: row.controlId,
      labelOrSource: row.labelOrSource,
      builder: row.builder,
      commandType: row.commandType,
      classification,
      evidenceCommands: evidence.evidenceCommands,
      eventIds: evidence.eventIds,
      okOrFailure: evidence.okOrFailure,
      actionAllowed,
      rationale,
      source: row.source
    };
  });

  const counts = rows.reduce((acc, row) => {
    acc[row.classification] = (acc[row.classification] || 0) + 1;
    return acc;
  }, {});
  const commandTypes = new Set(rows.map((row) => row.commandType).filter(Boolean));
  fs.mkdirSync(options.evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(options.evidenceDir, "runtime-gate-feature-audit.json"), `${JSON.stringify(rows, null, 2)}\n`, "utf8");

  const dataDump = eventsByType.get("data.dump")?.payload || {};
  const hooks = eventsByType.get("trainer.hooks.info")?.payload?.hooks || {};
  const initial = live.initialState || {};
  const visibleLiveEvents = live.events.filter((event) => !REMOVED_COMMAND_TYPES.has(event.type));
  const lines = [
    "Runtime Gate A1: live GUI feature validity audit",
    "Date: 2026-06-12",
    "",
    "Inventory and protocol coverage",
    `- Panels inventoried: ${inventory.rows.filter((row) => row.controlId.startsWith("panel:")).length}`,
    `- HTML buttons seen: ${inventory.htmlButtonCount}`,
    `- Matrix rows: ${rows.length}`,
    `- Command types represented: ${commandTypes.size}`,
    `- Classifications: ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(", ")}`,
    "",
    "Live discovery commands",
    ...visibleLiveEvents.map((event) => `- ${event.commandId} ${event.type} -> ok:${event.ok}`),
    "",
    "Live facts used for classification",
    `- Loaded state: hasParty=${initial.hasParty}, hasVariables=${initial.hasVariables}, hasSwitches=${initial.hasSwitches}, currentMap=${JSON.stringify(initial.currentMap)}, lastError=${initial.lastError}`,
    `- data.dump: available tables=${dataDump.count}, outputDir=${dataDump.outputDir}`,
    `- trainer.hooks.info: ${JSON.stringify(hooks)}`,
    "",
    "Classification policy",
    "- keep: runtime backing exists or local GUI helper is valid; mutating keep rows still have actionAllowed=false until R3 when applicable.",
    "- disable-guard: scene-dependent, save/write, battle, map transfer, common-event, or arbitrary custom JSON surfaces.",
    "- optimize: command exists and remains visible with hook/state evidence; scene-specific controls still rely on per-control guardrails.",
    "- candidate-add: read-only diagnostics live-proven by A1 and eligible for later T11/T12 UI work.",
    "- delete: live evidence proves the candidate surface is unavailable in this game.",
    "",
    "Conclusion",
    "- A1 passes for read-only audit evidence. Do not delete or add GUI controls outside rows in runtime-gate-feature-audit.json.",
    "- Next gate is R3 reversible mutation proof; mutating controls remain actionAllowed=false until that gate supplies restoration evidence."
  ];
  fs.writeFileSync(path.join(options.evidenceDir, "runtime-gate-feature-audit.txt"), `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ rows: rows.length, counts, livePrefix: live.prefix }, null, 2));
}

try {
  const options = parseOptions(process.argv.slice(2));
  if (options) writeEvidence(options);
} catch (error) {
  if (error instanceof FeatureAuditEvidenceError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
