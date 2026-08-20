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
  return { gameRoot, modkitRoot, window, document, sceneManager, system, player, savedIds, keydownListeners, sandbox };
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

dispatchKey(runtime, { key: "~", code: "Backquote", repeat: false });
assert.deepEqual(runtime.savedIds, [1], "quick save must always target slot 1");

runtime.savedIds.length = 0;
runtime.sceneManager._scene = new runtime.window.Scene_Battle();
dispatchKey(runtime, { key: "~", code: "Backquote", repeat: false });
assert.deepEqual(runtime.savedIds, [], "battle scene must block quick save");

runtime.sceneManager._scene = new runtime.window.Scene_Map();
dispatchKey(runtime, { key: "~", code: "Backquote", repeat: true });
assert.deepEqual(runtime.savedIds, [], "repeated keydown must be ignored");

assert(indexHtml.includes('id="playerThroughBtn"'), "GUI must expose playerThroughBtn");
assert(indexHtml.includes('id="quickSaveBtn"'), "GUI must expose quickSaveBtn");
assert(appSource.includes("playerThrough"), "app.ts must toggle playerThrough");
assert(appSource.includes("quickSaveEnabled"), "app.ts must toggle quickSaveEnabled");
assert(guardrailSource.includes("playerThroughBtn"), "guardrails must register playerThroughBtn");
assert(guardrailSource.includes("quickSaveBtn"), "guardrails must register quickSaveBtn");
assert(bridgeSource.includes("playerThroughActive"), "bridge must expose playerThroughActive");
assert(bridgeSource.includes("quickSave"), "bridge must expose quickSave state");

console.log("through and quick save contract");
