import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(appDir, "..", "..");
const bridgeSource = fs.readFileSync(path.join(projectRoot, "runtime", "bridge", "page-bridge.js"), "utf8");
const appSource = fs.readFileSync(path.join(appDir, "app.ts"), "utf8");
const indexHtml = fs.readFileSync(path.join(appDir, "index.html"), "utf8");
const guardrailSource = fs.readFileSync(path.join(appDir, "src", "command-guardrails.ts"), "utf8");

function createRuntime(root) {
  const gameRoot = path.join(root, "game");
  const modkitRoot = path.join(root, "nwr_modkit");
  fs.mkdirSync(path.join(gameRoot, "www", "save"), { recursive: true });
  const keydownListeners = [];
  const savedIds = [];

  function Game_Player() {
    this._through = false;
    this._transferring = false;
  }
  Game_Player.prototype.setThrough = function (value) {
    this.setThroughCalls.push(!!value);
    this._through = !!value;
  };
  Game_Player.prototype.isThrough = function () { return this._through; };
  Game_Player.prototype.setThroughCalls = [];
  Game_Player.prototype.isTransferring = function () { return this._transferring; };

  function Game_System() { this._saveEnabled = true; }
  Game_System.prototype.isSaveEnabled = function () { return this._saveEnabled !== false; };

  function Scene_Map() {}
  function Scene_Battle() {}

  const player = new Game_Player();
  player.setThroughCalls = [];
  const map = {
    mapId() { return 8; },
    isEventRunning() { return false; },
    _interpreter: { isRunning() { return false; } }
  };
  const system = new Game_System();
  const sceneManager = { _scene: new Scene_Map(), isSceneChanging() { return false; } };
  const dataManager = {
    saveGame(id) { savedIds.push(id); return true; }
  };
  const document = {
    title: "Fake Game",
    addEventListener(type, listener) { if (type === "keydown") keydownListeners.push(listener); },
    hasFocus() { return true; }
  };
  const window = {
    __codexBridgeConfig: {
      projectRoot: modkitRoot,
      gameRoot,
      overlay: false,
      dataDumpHooks: false,
      savePathPatch: false,
      schedulers: false,
      trainerHooks: false,
      bridgeTickHooks: false
    },
    Scene_Map,
    Scene_Battle,
    SceneManager: sceneManager,
    DataManager: dataManager,
    $gamePlayer: player,
    $gameMap: map,
    $gameSystem: system,
    SoundManager: { playSave() {} }
  };
  window.window = window;

  const sandbox = {
    window,
    document,
    location: { href: "http://runtime.test/" },
    process: { env: { DQ2_GAME_ROOT: gameRoot, DQ2_MODKIT_ROOT: modkitRoot }, cwd() { return gameRoot; } },
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
  return { gameRoot, modkitRoot, window, document, sceneManager, system, player, map, savedIds, keydownListeners, sandbox };
}

function dispatchKey(runtime, event) {
  const enriched = { preventDefault() {}, target: null, ...event };
  for (const listener of runtime.keydownListeners) listener(enriched);
}

function writeCommand(runtime, command) {
  const commandPath = path.join(runtime.modkitRoot, "runtime", "bridge-state", "commands.jsonl");
  fs.writeFileSync(commandPath, `${JSON.stringify(command)}\n`, "utf8");
  runtime.window.__codexLocalTrainerBridge.__pollCommands();
  runtime.window.__codexLocalTrainerBridge.__writeState();
}

function resetQuickSaveDebounce(runtime) {
  runtime.window.__codexLocalTrainerBridge.quickSaveLastTriggerAt = 0;
}

const runtime = createRuntime(fs.mkdtempSync(path.join(os.tmpdir(), "nwr-through-quick-save-")));
vm.runInNewContext(bridgeSource, runtime.sandbox, { filename: "page-bridge.js" });

writeCommand(runtime, { type: "trainer.options.set", options: { playerThrough: true }, commandId: "through-on", ts: Date.now() });
assert.equal(runtime.player._through, true, "playerThrough=true must enable player collision bypass");
let state = JSON.parse(fs.readFileSync(path.join(runtime.modkitRoot, "runtime", "bridge-state", "state.json"), "utf8"));
assert.equal(state.playerThroughActive, true, "bridge state must expose active player through status");
writeCommand(runtime, { type: "trainer.options.set", options: { playerThrough: false }, commandId: "through-off", ts: Date.now() + 1 });
assert.equal(runtime.player._through, false, "playerThrough=false must restore collision");
state = JSON.parse(fs.readFileSync(path.join(runtime.modkitRoot, "runtime", "bridge-state", "state.json"), "utf8"));
assert.equal(state.playerThroughActive, false, "bridge state must expose disabled player through status");
runtime.player._through = true;
runtime.window.__codexLocalTrainerBridge.__writeState();
state = JSON.parse(fs.readFileSync(path.join(runtime.modkitRoot, "runtime", "bridge-state", "state.json"), "utf8"));
assert.equal(state.playerThroughActive, true, "bridge state must report game-owned through state while the trainer option is off");
assert.equal(runtime.player.setThroughCalls.at(-1), false, "state collection must not repeatedly force through off");
runtime.player._through = false;

dispatchKey(runtime, { key: "`", code: "Backquote", repeat: false });
assert.deepEqual(runtime.savedIds, [1], "quick save must always target slot 1");

runtime.savedIds.length = 0;
writeCommand(runtime, { type: "trainer.options.set", options: { playerThrough: true }, commandId: "through-save", ts: Date.now() + 2 });
let resolvePendingSave;
runtime.window.DataManager.saveGame = id => {
  runtime.savedIds.push(id);
  runtime.saveObservedThrough = runtime.player._through;
  return new Promise(resolve => { resolvePendingSave = resolve; });
};
resetQuickSaveDebounce(runtime);
dispatchKey(runtime, { key: "~", code: "Backquote", repeat: false });
assert.deepEqual(runtime.savedIds, [1], "async quick save must start with slot 1");
assert.equal(runtime.saveObservedThrough, false, "quick save must not serialize trainer through state");
state = JSON.parse(fs.readFileSync(path.join(runtime.modkitRoot, "runtime", "bridge-state", "state.json"), "utf8"));
assert.equal(state.quickSave.inFlight, true, "async quick save must publish in-flight state");
resetQuickSaveDebounce(runtime);
dispatchKey(runtime, { key: "~", code: "Backquote", repeat: false });
assert.deepEqual(runtime.savedIds, [1], "in-flight quick save must block a concurrent second write");
resolvePendingSave(true);
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(runtime.savedIds, [1], "promise-based saveGame must still target slot 1");
assert.equal(runtime.player._through, true, "trainer through state must restore after save settles");
state = JSON.parse(fs.readFileSync(path.join(runtime.modkitRoot, "runtime", "bridge-state", "state.json"), "utf8"));
assert.equal(state.quickSave.lastResult, "success", "promise-based quick save must publish success state");
assert.equal(state.quickSave.inFlight, false, "settled quick save must clear in-flight state");

runtime.savedIds.length = 0;
runtime.sceneManager._scene = new runtime.window.Scene_Battle();
resetQuickSaveDebounce(runtime);
dispatchKey(runtime, { key: "~", code: "Backquote", repeat: false });
assert.deepEqual(runtime.savedIds, [], "battle scene must block quick save");

runtime.sceneManager._scene = new runtime.window.Scene_Map();
runtime.map.isEventRunning = () => true;
resetQuickSaveDebounce(runtime);
dispatchKey(runtime, { key: "~", code: "Backquote", repeat: false });
assert.deepEqual(runtime.savedIds, [], "running events must block quick save");

runtime.map.isEventRunning = () => false;
runtime.player._transferring = true;
resetQuickSaveDebounce(runtime);
dispatchKey(runtime, { key: "~", code: "Backquote", repeat: false });
assert.deepEqual(runtime.savedIds, [], "map transfer must block quick save");

runtime.player._transferring = false;
runtime.system._saveEnabled = false;
resetQuickSaveDebounce(runtime);
dispatchKey(runtime, { key: "~", code: "Backquote", repeat: false });
assert.deepEqual(runtime.savedIds, [], "disabled saving must block quick save");

runtime.system._saveEnabled = true;
resetQuickSaveDebounce(runtime);
dispatchKey(runtime, { key: "~", code: "Backquote", repeat: false, ctrlKey: true });
assert.deepEqual(runtime.savedIds, [], "modified key must not trigger quick save");

resetQuickSaveDebounce(runtime);
dispatchKey(runtime, { key: "~", code: "Backquote", repeat: true });
assert.deepEqual(runtime.savedIds, [], "repeated keydown must be ignored");

assert(indexHtml.includes('id="playerThroughBtn"'), "GUI must expose playerThroughBtn");
assert(indexHtml.includes('id="quickSaveBtn"'), "GUI must expose quickSaveBtn");
assert(indexHtml.includes("按 ~ 覆盖槽位 1"), "GUI must describe slot one quick save");
assert(appSource.includes("playerThrough"), "app.ts must toggle playerThrough");
assert(appSource.includes("quickSaveEnabled"), "app.ts must toggle quickSaveEnabled");
assert(guardrailSource.includes('action("playerThroughBtn"'), "guardrails must register playerThroughBtn");
assert(guardrailSource.includes('action("quickSaveBtn"'), "guardrails must register quickSaveBtn");
assert(bridgeSource.includes("playerThroughActive"), "bridge must expose playerThroughActive");
assert(bridgeSource.includes("quickSave"), "bridge must expose quickSave state");

console.log("through and quick save contract");
