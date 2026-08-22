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
const inputGuard = functionBlock(bridgeSource, "installGameSpeedInputGuards");

assert(bridgeSource.includes(`const GAME_SPEED_LEVELS = [${SPEEDS.join(", ")}];`), "bridge speed levels must match the design");
assert(/gameSpeed:\s*1/.test(bridgeSource), "bridge must default gameSpeed to 1");
assert(/clampNumber\(options\.gameSpeed,\s*1,\s*10/.test(setOptions), "gameSpeed must clamp to 1..10");
assert(setOptions.includes("nearestGameSpeed"), "gameSpeed must align to a supported level");
assert(speedHook.includes('patchMethod(sceneManager, "updateMain"'), "speed hook must wrap SceneManager.updateMain");
assert(speedHook.includes("original.apply(this, args)"), "speed hook must preserve the original updateMain");
assert(speedHook.includes("this.changeScene()") && speedHook.includes("this.updateScene()"), "extra rounds must advance only scene logic");
assert(!speedHook.includes("renderScene") && !speedHook.includes("updateInputData"), "extra rounds must not render or resample input");
assert(speedHook.includes("try {") && speedHook.includes("catch (error)"), "speed hook must contain a failure boundary");
assert(speedHook.includes("gameSpeedInputSuppressed"), "extra rounds must suppress input edges");
assert(!speedHook.includes("Input.update("), "extra rounds must not resample input");
assert(inputGuard.includes("isTriggered") && inputGuard.includes("isRepeated"), "input guard must suppress trigger and repeat edges");
assert(inputGuard.includes("window.Input") && inputGuard.includes("window.TouchInput"), "input guard must cover keyboard and touch input");
assert(bridgeSource.includes("GAME_SPEED_MAX_ERROR_FRAMES = 30"), "degradation threshold must be 30 frames");
assert(hotkeys.includes('event.key === "]"') && hotkeys.includes('event.key === "["'), "speed hotkeys must use brackets");
assert(hotkeys.includes('tagName === "INPUT"') && hotkeys.includes("target.isContentEditable"), "speed hotkeys must ignore editable controls");
assert(collectState.includes("gameSpeed: { ...bridge.gameSpeed }"), "collectState must expose gameSpeed state");
assert(bridgeSource.includes("installGameSpeedHotkeys();"), "speed hotkeys must be installed at startup");
assert(packageJson.scripts["test:game-speed"] === "node tests/game-speed-contract.mjs", "package must expose test:game-speed");

const appSource = fs.readFileSync(path.join(guiDir, "app.ts"), "utf8");
const indexHtml = fs.readFileSync(path.join(guiDir, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(guiDir, "styles.css"), "utf8");
const guardrails = fs.readFileSync(path.join(guiDir, "src", "command-guardrails.ts"), "utf8");
const protocol = JSON.parse(fs.readFileSync(path.join(guiDir, "protocol-metadata.json"), "utf8"));
const htmlSpeeds = Array.from(indexHtml.matchAll(/data-game-speed="(\d+)"/g), (match) => Number(match[1]));

assert(appSource.includes(`const GAME_SPEED_LEVELS = [${SPEEDS.join(", ")}] as const;`), "GUI speed levels must match the bridge");
assert(JSON.stringify(htmlSpeeds) === JSON.stringify(SPEEDS), "HTML speed buttons must match the designed levels");
assert(indexHtml.includes('id="gameSpeedRow"') && indexHtml.includes('id="gameSpeedState"'), "speed row and state text must exist");
assert(appSource.includes('sendOptions({ gameSpeed: speed }, "selector:data-game-speed")'), "speed buttons must reuse trainer.options.set");
assert(appSource.includes("gameSpeed.degradedReason") && appSource.includes("gameSpeed.logicFps"), "GUI must render degraded state and measured logic FPS");
assert(guardrails.includes('action("selector:data-game-speed"') && guardrails.includes('"optimize"'), "speed selector must be registered as optimize");
assert(styles.includes(".game-speed-row"), "speed selector must have stable responsive layout");
assert(protocol.expectedBridgeVersion === "0.2.34", "GUI protocol metadata must require bridge 0.2.34");

console.log("game speed contract OK");
