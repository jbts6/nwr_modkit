import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBridgeCommandNamespace, sampleBridgeCommands } from "./command-builder-fixture.mjs";

class FeatureInventoryError extends Error {
  constructor(message) {
    super(message);
    this.name = "FeatureInventoryError";
  }
}
const REMOVED_DOMAIN = ["fi", "sh", "ing"].join("");
const REMOVED_COMMAND_PREFIX = [REMOVED_DOMAIN, ""].join(".");
const REMOVED_PANEL_PREFIX = [`panel:${REMOVED_DOMAIN}`, ""].join(":");

const ACTION_ROWS = [
  ["runtimeRoute", "Runtime bridge route selector", null, "local launch route"],
  ["selector:data-tool-tab", "Tool tab navigation", null, "local UI navigation"],
  ["toolSectionNav", "Tool section navigation", null, "local UI navigation"],
  ["launchBtn", "Launch runtime bridge", null, "runtime launcher"],
  ["openPreparedGameBtn", "Open prepared bridge game", null, "prepared manual launcher"],
  ["refreshBtn", "Refresh bridge state", null, "state refresh"],
  ["openBridgeBtn", "Open Bridge log directory", null, "local shell"],
  ["openSaveBtn", "Open save directory", null, "local shell"],
  ["backupSaveBtn", "Backup saves", null, "local filesystem"],
  ["clearEventsBtn", "Clear bridge event view", null, "local bridge-state"],
  ["goldSetBtn", "Set gold", "gold.set", "NwrGuiBridgeCommands.goldSet"],
  ["goldAddBtn", "Add gold", "gold.add", "NwrGuiBridgeCommands.goldAdd"],
  ["selector:data-gold-add", "Gold quick add buttons", "gold.add", "NwrGuiBridgeCommands.goldAdd"],
  ["selector:data-gold-set", "Gold MAX button", "gold.set", "NwrGuiBridgeCommands.goldSet"],
  ["variableSetBtn", "Write variable", "variable.set", "setVariable"],
  ["switchSetBtn", "Write switch", "switch.set", "setSwitch"],
  ["switchOnBtn", "Switch ON selector", null, "local switch value"],
  ["switchOffBtn", "Switch OFF selector", null, "local switch value"],
  ["itemAddBtn", "Add selected item", "item.add", "NwrGuiBridgeCommands.itemAdd"],
  ["actorUnlockBtn", "Unlock actor from active catalog", "actor.unlock", "unlockActor"],
  ["actorAddBtn", "Add actor to party", "actor.add", "NwrGuiBridgeCommands.actorAdd"],
  ["actorRemoveBtn", "Remove actor", "actor.remove", "NwrGuiBridgeCommands.actorRemove"],
  ["actorRecoverBtn", "Recover actor", "actor.recover", "NwrGuiBridgeCommands.actorRecover"],
  ["actorNameBtn", "Set actor name", "actor.name.set", "NwrGuiBridgeCommands.actorNameSet"],
  ["actorLevelBtn", "Set actor level", "actor.level.set", "NwrGuiBridgeCommands.actorLevelSet"],
  ["actorExpBtn", "Add actor EXP", "actor.exp.add", "NwrGuiBridgeCommands.actorExpAdd"],
  ["actorVitalsBtn", "Write actor vitals", "actor.vitals.set", "NwrGuiBridgeCommands.actorVitalsSet"],
  ["actorParamBtn", "Add actor parameter", "actor.param.add", "NwrGuiBridgeCommands.actorParamAdd"],
  ["actorSpBtn", "Add actor SP", "actor.jp.add", "NwrGuiBridgeCommands.actorJpAdd"],
  ["actorAllocationPointsBtn", "Add actor attribute points", "actor.allocationPoints.add", "NwrGuiBridgeCommands.actorAllocationPointsAdd"],
  ["skillLearnBtn", "Learn actor skill", "actor.skill.learn", "NwrGuiBridgeCommands.actorSkillLearn"],
  ["skillForgetBtn", "Forget actor skill", "actor.skill.forget", "NwrGuiBridgeCommands.actorSkillForget"],
  ["ratesApplyBtn", "Apply trainer rates", "trainer.options.set", "sendOptions"],
  ["selector:data-rate", "Trainer rate presets", "trainer.options.set", "sendOptions"],
  ["noCostBtn", "Toggle no skill cost", "trainer.options.set", "sendOptions"],
  ["oneHitKillBtn", "Toggle one hit kill", "trainer.options.set", "sendOptions"],
  ["invincibleBtn", "Toggle invincible", "trainer.options.set", "sendOptions"],
  ["battleKillBtn", "Kill battle enemies", "battle.killEnemies", "NwrGuiBridgeCommands.battleKillEnemies"],
  ["battleEscapeBtn", "Battle escape", "battle.escape", "NwrGuiBridgeCommands.battleEscape"],
  ["partyRecoverBtn", "Recover party", "party.recover", "NwrGuiBridgeCommands.partyRecover"],
  ["prisonRepairBtn", "Repair prison guard risks", "prison.repair", "NwrGuiBridgeCommands.prisonRepair"],
  ["mapTransferBtn", "Transfer map", "map.transfer", "transferMap"],
  ["recordPositionBtn", "Record current position", null, "local current state snapshot"],
  ["returnPositionBtn", "Return recorded position", "map.transfer", "transferMap"],
  ["commonEventRunBtn", "Run common event", "commonEvent.run", "runCommonEvent"],
  ["saveGameBtn", "Save game", "save", "NwrGuiBridgeCommands.save"],
  ["titleRefreshBtn", "Refresh title", "title.refresh", "NwrGuiBridgeCommands.titleRefresh"],
  ["customSendBtn", "Send custom JSON command", "custom", "JSON.parse + sendCommand"]
];

const BACKLOG_ROWS = [
  ["candidate:ping", "Bridge ping diagnostic", "ping", "custom JSON / diagnostic candidate"],
  ["candidate:runtime.inspect", "Runtime inspect diagnostic", "runtime.inspect", "custom JSON / diagnostic candidate"],
  ["candidate:runtime.search", "Runtime search diagnostic", "runtime.search", "custom JSON / diagnostic candidate"],
  ["candidate:trainer.options.get", "Trainer options diagnostic", "trainer.options.get", "custom JSON / diagnostic candidate"],
  ["candidate:trainer.hooks.info", "Trainer hook diagnostic", "trainer.hooks.info", "custom JSON / audit candidate"],
  ["candidate:data.dump", "Runtime data dump diagnostic", "data.dump", "custom JSON / audit candidate"],
  ["candidate:map.current", "Current map diagnostic", "map.current", "custom JSON / audit candidate"]
];
const REQUIRED_USER_COMMAND_TYPES = [
  "item.add",
  "actor.add",
  "actor.unlock",
  "actor.remove",
  "actor.recover",
  "actor.name.set",
  "actor.level.set",
  "actor.exp.add",
  "actor.vitals.set",
  "actor.param.add",
  "actor.jp.add",
  "actor.allocationPoints.add",
  "actor.skill.learn",
  "actor.skill.forget",
  "variable.set",
  "switch.set",
  "trainer.options.get",
  "trainer.hooks.info",
  "trainer.options.set",
  "prison.repair"
];

function usage() {
  return [
    "Usage: node tests/gui-feature-inventory.mjs [--json]",
    "",
    "Builds a static GUI feature/control inventory and verifies command-builder coverage."
  ].join("\n");
}

function parseOptions(argv) {
  const options = { json: false };
  for (const arg of argv) {
    if (arg === "--help") {
      console.log(usage());
      process.exitCode = 0;
      return null;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    throw new FeatureInventoryError(`unknown argument: ${arg}`);
  }
  return options;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function cleanText(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function attrValue(tag, attrName) {
  const match = tag.match(new RegExp(`${attrName}="([^"]*)"`, "i"));
  return match ? match[1] : "";
}

function collectPanels(indexHtml) {
  return Array.from(indexHtml.matchAll(/<article\b[^>]*data-tool-panel="[^"]+"[^>]*>/g)).map((match) => {
    const tag = match[0];
    return {
      controlId: `panel:${attrValue(tag, "data-tool-panel")}:${attrValue(tag, "data-tool-section")}`,
      labelOrSource: attrValue(tag, "data-tool-label") || attrValue(tag, "data-tool-section"),
      panel: attrValue(tag, "data-tool-panel"),
      section: attrValue(tag, "data-tool-section"),
      commandType: null,
      builder: null,
      source: "index.html panel"
    };
  });
}

function collectHtmlButtons(indexHtml) {
  return Array.from(indexHtml.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)).map((match) => ({
    id: attrValue(match[1], "id") || null,
    label: cleanText(match[2]),
    raw: match[0]
  }));
}

function assertControlExists(indexHtml, row) {
  const [controlId] = row;
  if (controlId.startsWith("candidate:")) return;
  if (controlId.startsWith("selector:data-")) {
    const dataName = controlId.slice("selector:".length).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    if (!indexHtml.includes(dataName)) throw new FeatureInventoryError(`missing selector control ${controlId}`);
    return;
  }
  if (!new RegExp(`id="${controlId}"`).test(indexHtml)) {
    throw new FeatureInventoryError(`missing HTML control id ${controlId}`);
  }
}

function assertSourceReferences(appSource, row) {
  const [controlId, , commandType, builder] = row;
  if (controlId.startsWith("candidate:")) return;
  if (!commandType) return;
  if (commandType === "custom") {
    if (!appSource.includes("JSON.parse") || !appSource.includes('sendCommand(command, "customSendBtn")')) {
      throw new FeatureInventoryError(`missing custom command sender implementation for ${controlId}`);
    }
    return;
  }
  if (builder && !appSource.includes(builder)) {
    throw new FeatureInventoryError(`missing app.ts source reference for ${controlId}: ${builder}`);
  }
  if (!appSource.includes(commandType) && !appSource.includes(builder)) {
    throw new FeatureInventoryError(`missing app.ts command reference for ${controlId}: ${commandType}`);
  }
}

function assertLaunchHeaderLayout(indexHtml, styles) {
  if (!indexHtml.includes('id="launchBtn"')) {
    throw new FeatureInventoryError("launch button must stay in the topbar action surface");
  }
  const topActionsBlock = styles.match(/\.top-actions\s*\{([^}]*)\}/);
  const routePickerBlock = styles.match(/\.route-picker\s*\{([^}]*)\}/);
  if (!topActionsBlock || !/width:\s*100%\s*;/.test(topActionsBlock[1]) || !/flex-wrap:\s*wrap\s*;/.test(topActionsBlock[1])) {
    throw new FeatureInventoryError("topbar actions must occupy the full header row and wrap controls");
  }
  if (!routePickerBlock || !/min-width:\s*0\s*;/.test(routePickerBlock[1])) {
    throw new FeatureInventoryError("route picker must have min-width: 0 so it cannot push launch controls off-screen");
  }
}

function assertRatePanelSurface(indexHtml, appSource) {
  if (indexHtml.includes('id="skillRate"')) {
    throw new FeatureInventoryError("rate panel must not expose the removed skill proficiency rate input");
  }
  if (appSource.includes('numberValue("skillRate"')) {
    throw new FeatureInventoryError("rate sender must not read a removed skillRate input");
  }
  if (!indexHtml.includes("<span>积分</span>")) {
    throw new FeatureInventoryError("goldRate control should be labeled with the game currency unit 积分");
  }
}

function assertEnemyBookRemoved(indexHtml, appSource) {
  const leakedTerms = [
    "enemyBook",
    "unlockEnemyBookBtn",
    "progressEnemyBookUnlock",
    "progress.enemyBook.unlock",
    "敌人图鉴"
  ].filter((term) => indexHtml.includes(term) || appSource.includes(term));
  if (leakedTerms.length > 0) {
    throw new FeatureInventoryError(`enemy book GUI surface should be removed: ${[...new Set(leakedTerms)].join(", ")}`);
  }
}

function rowToObject(row, source) {
  const [controlId, labelOrSource, commandType, builder] = row;
  return { controlId, labelOrSource, commandType, builder, source };
}

function run() {
  const options = parseOptions(process.argv.slice(2));
  if (options === null) return;
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(testsDir, "..");
  const indexHtml = readText(path.join(appDir, "index.html"));
  const appSource = readText(path.join(appDir, "app.ts"));
  const styles = readText(path.join(appDir, "styles.css"));
  const commands = loadBridgeCommandNamespace(path.join(appDir, "src", "bridge-commands.ts"));
  const builderTypes = new Set(sampleBridgeCommands(commands).map((command) => command.type));

  assertLaunchHeaderLayout(indexHtml, styles);
  assertRatePanelSurface(indexHtml, appSource);
  assertEnemyBookRemoved(indexHtml, appSource);
  for (const row of ACTION_ROWS) {
    assertControlExists(indexHtml, row);
    assertSourceReferences(appSource, row);
  }

  const actionObjects = ACTION_ROWS.map((row) => rowToObject(row, "index.html/app.ts"));
  const backlogObjects = BACKLOG_ROWS.map((row) => rowToObject(row, "audit backlog"));
  const panelObjects = collectPanels(indexHtml);
  const rows = [...panelObjects, ...actionObjects, ...backlogObjects];
  const removedRows = rows.filter((row) => String(row.commandType || "").startsWith(REMOVED_COMMAND_PREFIX) || String(row.controlId || "").startsWith(REMOVED_PANEL_PREFIX));
  if (removedRows.length > 0) {
    throw new FeatureInventoryError(`removed operator surfaces must be absent: ${removedRows.map((row) => row.controlId).join(", ")}`);
  }
  const inventoryCommandTypes = new Set(rows.map((row) => row.commandType).filter((value) => value && value !== "custom"));
  const missingRequiredTypes = REQUIRED_USER_COMMAND_TYPES.filter((type) => !inventoryCommandTypes.has(type));
  if (missingRequiredTypes.length > 0) {
    throw new FeatureInventoryError(`required command types missing inventory rows: ${missingRequiredTypes.join(", ")}`);
  }
  const missingBuilderTypes = Array.from(builderTypes).filter((type) => !inventoryCommandTypes.has(type)).sort();
  if (missingBuilderTypes.length > 0) {
    throw new FeatureInventoryError(`builder command types missing inventory rows: ${missingBuilderTypes.join(", ")}`);
  }

  if (options.json) {
    console.log(JSON.stringify({ rows, htmlButtonCount: collectHtmlButtons(indexHtml).length }, null, 2));
    return;
  }

  console.log("GUI feature inventory");
  console.log(`panels: ${panelObjects.length}`);
  console.log(`htmlButtons: ${collectHtmlButtons(indexHtml).length}`);
  console.log(`actionRows: ${actionObjects.length}`);
  console.log(`backlogRows: ${backlogObjects.length}`);
  console.log(`builderCommandTypes: ${builderTypes.size}`);
  console.log(`inventoryCommandTypes: ${inventoryCommandTypes.size}`);
  console.log("missingBuilderTypes: none");
}

try {
  run();
} catch (error) {
  if (error instanceof FeatureInventoryError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
