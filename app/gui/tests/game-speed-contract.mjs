import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const guiDir = path.resolve(here, "..");
const projectRoot = path.resolve(guiDir, "..", "..");
const bridgeSource = fs.readFileSync(path.join(projectRoot, "runtime", "bridge", "page-bridge.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(guiDir, "package.json"), "utf8"));
const SPEEDS = [1, 2, 3, 4, 6, 8, 10];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function functionBlock(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `missing function ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

const setOptions = functionBlock(bridgeSource, "setTrainerOptions");
const speedHook = functionBlock(bridgeSource, "patchGameSpeedHooks");
const hotkeys = functionBlock(bridgeSource, "installGameSpeedHotkeys");
const collectState = functionBlock(bridgeSource, "collectState");

assert(bridgeSource.includes(`const GAME_SPEED_LEVELS = [${SPEEDS.join(", ")}];`), "bridge speed levels must match the design");
assert(/gameSpeed:\s*1/.test(bridgeSource), "bridge must default gameSpeed to 1");
assert(/clampNumber\(options\.gameSpeed,\s*1,\s*10/.test(setOptions), "gameSpeed must clamp to 1..10");
assert(setOptions.includes("nearestGameSpeed"), "gameSpeed must align to a supported level");
assert(speedHook.includes('patchMethod(sceneManager, "updateMain"'), "speed hook must wrap SceneManager.updateMain");
assert(speedHook.includes("original.apply(this, args)"), "speed hook must preserve the original updateMain");
assert(speedHook.includes("this.changeScene()") && speedHook.includes("this.updateScene()"), "extra rounds must advance only scene logic");
assert(!speedHook.includes("renderScene") && !speedHook.includes("updateInputData"), "extra rounds must not render or resample input");
assert(speedHook.includes("try {") && speedHook.includes("catch (error)"), "speed hook must contain a failure boundary");
assert(bridgeSource.includes("GAME_SPEED_MAX_ERROR_FRAMES = 30"), "degradation threshold must be 30 frames");
assert(hotkeys.includes('event.key === "]"') && hotkeys.includes('event.key === "["'), "speed hotkeys must use brackets");
assert(hotkeys.includes('tagName === "INPUT"') && hotkeys.includes("target.isContentEditable"), "speed hotkeys must ignore editable controls");
assert(collectState.includes("gameSpeed: { ...bridge.gameSpeed }"), "collectState must expose gameSpeed state");
assert(bridgeSource.includes("installGameSpeedHotkeys();"), "speed hotkeys must be installed at startup");
assert(packageJson.scripts["test:game-speed"] === "node tests/game-speed-contract.mjs", "package must expose test:game-speed");

console.log("game speed runtime contract OK");
