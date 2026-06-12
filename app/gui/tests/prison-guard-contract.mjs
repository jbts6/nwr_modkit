import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

class PrisonGuardContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "PrisonGuardContractError";
  }
}

function assert(condition, message) {
  if (!condition) throw new PrisonGuardContractError(message);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function assertSaveEditorSourceOfTruth(saveGuardSource) {
  for (const marker of ["armor-400", "switch-520", "actor-2-param-9", "CE342/343", "梦魇传送处提示", "Switch785"]) {
    assert(saveGuardSource.includes(marker), `save editor guard source is missing marker ${marker}`);
  }
}

function assertBridgeRuntimeGuard(bridgeSource) {
  for (const marker of [
    "function collectPrisonGuardReport",
    "prisonGuardReport: collectPrisonGuardReport()",
    "type === \"prison.repair\"",
    "armor-400",
    "switch-520",
    "actor-2-param-9",
    "CE342/343",
    "梦魇传送处提示",
    "Switch785"
  ]) {
    assert(bridgeSource.includes(marker), `manual bridge must expose prison guard marker ${marker}`);
  }
}

function assertGuiSurface(indexHtml, appSource, commandSource, tsconfig) {
  for (const marker of [
    "data-tool-section=\"prison\"",
    "id=\"prisonGuardSummary\"",
    "id=\"prisonGuardList\"",
    "id=\"prisonTriggerDetails\"",
    "CE334/337/338/339/340/341/342/343/344/405",
    "CE335/336/403/406/407/571/572",
    "终身监禁",
    "梦魇传送处提示",
    "Switch781/784/785/1067",
    "Map695",
    "Switch520",
    "actor(2).param(9)",
    "id=\"prisonRepairBtn\""
  ]) {
    assert(indexHtml.includes(marker), `GUI must expose prison guard surface marker ${marker}`);
  }
  assert(appSource.includes("NwrGuiPrisonGuards.applyPanel"), "app.ts must render live prison guard reports");
  assert(appSource.includes("NwrGuiBridgeCommands.prisonRepair"), "app.ts must send prison.repair from the repair button");
  assert(commandSource.includes("\"prison.repair\""), "bridge command builder must include prison.repair");
  assert(commandSource.includes("prisonRepair"), "bridge command builder must expose prisonRepair()");
  assert(tsconfig.files.includes("src/prison-guard-view.ts"), "tsconfig must compile prison guard view before app.ts");
}

function item(id, kind = "item") {
  return { id, kind, name: `${kind}-${id}` };
}

function fakeRuntime(projectRoot, gameRoot) {
  const dataItems = [];
  const dataArmors = [];
  for (const id of [45, 49, 59, 73, 101, 653, 654, 656, 730, 819, 860]) dataItems[id] = item(id);
  dataArmors[400] = item(400, "armor");

  const actors = {
    actor(id) {
      return {
        _actorId: id,
        _classId: 1,
        actorId() { return id; },
        name() { return `actor-${id}`; },
        param(paramId) { return id === 2 && paramId === 9 ? 19996 : 0; }
      };
    }
  };
  const party = {
    _gold: 9_000_000,
    _items: { 45: 99, 653: 200, 654: 80, 656: 200, 730: 2 },
    _armors: { 400: 3 },
    _weapons: {},
    _actors: [16, 57, 48, 31],
    gold() { return this._gold; },
    gainGold(amount) { this._gold = Math.max(0, this._gold + amount); },
    numItems(target) {
      const bag = target.kind === "armor" ? this._armors : this._items;
      return Number(bag[target.id] || 0);
    },
    gainItem(target, amount) {
      const bag = target.kind === "armor" ? this._armors : this._items;
      bag[target.id] = Math.max(0, Number(bag[target.id] || 0) + amount);
    },
    allMembers() { return this._actors.map((id) => actors.actor(id)); }
  };
  const variables = {
    _data: { 29: 5000, 210: 99 },
    value(id) { return this._data[id] || 0; },
    setValue(id, value) { this._data[id] = value; }
  };
  const switches = {
    _data: { 520: true },
    value(id) { return this._data[id] === true; },
    setValue(id, value) { this._data[id] = value === true; }
  };

  const window = {
    __codexBridgeConfig: {
      projectRoot,
      gameRoot,
      overlay: false,
      dataDumpHooks: false,
      savePathPatch: false,
      schedulers: false,
      trainerHooks: false,
      bridgeTickHooks: false
    },
    $gameParty: party,
    $gameVariables: variables,
    $gameSwitches: switches,
    $gameActors: actors,
    $gameMap: { mapId() { return 8; } },
    $gamePlayer: { x: 12, y: 34, direction: 2 },
    $dataItems: dataItems,
    $dataArmors: dataArmors,
    $dataWeapons: [],
    $dataSkills: [],
    $dataActors: [],
    $dataEnemies: [],
    $dataTroops: [],
    $dataMapInfos: [],
    StorageManager: null,
    TK: null
  };
  window.window = window;
  return { window, party, variables, switches };
}

function assertBridgeBehavior(bridgeSource) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nwr-prison-guard-"));
  const projectRoot = path.join(root, "nwr_modkit");
  const gameRoot = path.join(root, "game");
  fs.mkdirSync(path.join(gameRoot, "www", "save"), { recursive: true });
  fs.writeFileSync(path.join(gameRoot, "www", "save", "file1.rpgsave"), "fixture", "utf8");
  const runtime = fakeRuntime(projectRoot, gameRoot);
  const sandbox = {
    window: runtime.window,
    document: { title: "Fake Game" },
    location: { href: "http://runtime.test/" },
    process: {
      env: { DQ2_GAME_ROOT: gameRoot, DQ2_MODKIT_ROOT: projectRoot },
      cwd() { return gameRoot; }
    },
    require(name) {
      if (name === "fs") return fs;
      if (name === "path") return path;
      if (name === "timers") return { setInterval() { return { unref() {} }; } };
      if (name === "buffer") return { Buffer };
      throw new Error(`unexpected require ${name}`);
    },
    setTimeout() { return 0; },
    clearInterval() {},
    setInterval() { return 0; },
    requestAnimationFrame() {}
  };

  vm.runInNewContext(bridgeSource, sandbox, { filename: "page-bridge.js" });
  const bridgeDir = path.join(projectRoot, "runtime", "bridge-state");
  const statePath = path.join(bridgeDir, "state.json");
  const firstState = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const firstHits = new Set(firstState.prisonGuardReport.hits.map((check) => check.id));
  for (const id of ["armor-400", "item-656", "var-29", "switch-520", "actor-2-param-9"]) {
    assert(firstHits.has(id), `bridge prison report should detect ${id}`);
  }

  fs.writeFileSync(
    path.join(bridgeDir, "commands.jsonl"),
    `${JSON.stringify({ type: "prison.repair", commandId: "repair-1", ts: Date.now() + 1 })}\n`,
    "utf8"
  );
  runtime.window.__codexLocalTrainerBridge.__pollCommands();
  runtime.window.__codexLocalTrainerBridge.__writeState();
  const repairedState = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const repairedHits = new Set(repairedState.prisonGuardReport.hits.map((check) => check.id));
  for (const id of ["armor-400", "item-656", "var-29", "switch-520"]) {
    assert(!repairedHits.has(id), `prison.repair should clear fixable hit ${id}`);
  }
  assert(repairedHits.has("actor-2-param-9"), "runtime param(9) hit should remain a manual risk");
  assert(runtime.party._armors[400] === 2, "armor 400 should be lowered to the safe value");
  assert(runtime.party._items[656] === 199, "item 656 should be lowered to the safe value");
  assert(runtime.party._items[59] === 1, "missing key item 59 should be added");
  assert(runtime.variables._data[29] === 4999, "variable 29 should be lowered to the safe value");
  assert(runtime.switches._data[520] === false, "Switch520 should be cleared");
}

function run() {
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(testsDir, "..");
  const modkitDir = path.resolve(appDir, "..", "..");
  const saveEditorDir = path.resolve(appDir, "..", "save-editor");

  assertSaveEditorSourceOfTruth(readText(path.join(saveEditorDir, "src", "prisonGuards.ts")));
  const bridgeSource = readText(path.join(modkitDir, "runtime", "bridge", "page-bridge.js"));
  assertBridgeRuntimeGuard(bridgeSource);
  assertBridgeBehavior(bridgeSource);
  assertGuiSurface(
    readText(path.join(appDir, "index.html")),
    readText(path.join(appDir, "app.ts")),
    readText(path.join(appDir, "src", "bridge-commands.ts")),
    readJson(path.join(appDir, "tsconfig.json"))
  );

  console.log("Prison guard runtime contract");
  console.log("bridge report, GUI surface, and repair command are wired");
}

try {
  run();
} catch (error) {
  if (error instanceof PrisonGuardContractError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
