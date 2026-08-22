import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const guiDir = path.resolve(here, "..");
const projectRoot = path.resolve(guiDir, "..", "..");
const bridgeSource = fs.readFileSync(path.join(projectRoot, "runtime", "bridge", "page-bridge.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(guiDir, "package.json"), "utf8"));

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
const blockReason = functionBlock(bridgeSource, "quickLoadBlockReason");
const tryLoad = functionBlock(bridgeSource, "tryQuickLoad");
const hotkeys = functionBlock(bridgeSource, "installQuickLoadHotkey");
const collectState = functionBlock(bridgeSource, "collectState");
const overlay = functionBlock(bridgeSource, "installInGameOverlay");

assert(/version: "0\.2\.35"/.test(bridgeSource), "bridge version must be 0.2.35");
assert(/quickLoadEnabled:\s*true/.test(bridgeSource), "quick load must default to enabled");
assert(setOptions.includes("quickLoadEnabled"), "quickLoadEnabled must flow through trainer.options.set");
assert(blockReason.includes("fs.existsSync(saveFilePath(1))"), "quick load must require slot 1 to exist");
assert(!blockReason.includes("isSaveEnabled"), "quick load must not require save permission");
assert(blockReason.includes("isMapScene") && blockReason.includes("loadGame"), "quick load guards must mirror quick save scene checks");
assert(tryLoad.includes(".loadGame("), "quick load must call DataManager.loadGame");
assert(tryLoad.includes("onAfterLoad"), "quick load must finish load side effects");
assert(tryLoad.includes("goto("), "quick load must return to the map scene");
assert(tryLoad.includes(".then(") && tryLoad.includes("catch"), "quick load must tolerate promise results");
assert(hotkeys.includes('event.key === "F8"'), "quick load hotkey must be F8");
assert(hotkeys.includes('tagName === "INPUT"') && hotkeys.includes("target.isContentEditable"), "quick load hotkey must ignore editable controls");
assert(hotkeys.includes("quickLoadLastTriggerAt"), "quick load hotkey must debounce");
assert(collectState.includes("quickLoad: { ...bridge.quickLoad }"), "collectState must expose quickLoad state");
assert(collectState.includes("bridgeStartedAt: bridge.startedAtMs"), "collectState must expose bridgeStartedAt for session detection");
assert(bridgeSource.includes("installQuickLoadHotkey();"), "quick load hotkey must be installed at startup");
assert(overlay.includes('event.key === "F6"') && !overlay.includes('event.key === "F8"'), "overlay toggle must move to F6");
assert(/bridgeConfig\.overlay === true/.test(bridgeSource), "in-game overlay must be opt-in");
assert(packageJson.scripts["test:quick-session"] === "node tests/quick-load-session-contract.mjs", "package must expose test:quick-session");

console.log("quick load runtime contract OK");
