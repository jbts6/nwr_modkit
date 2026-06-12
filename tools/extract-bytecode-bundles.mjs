import fs from "node:fs";
import path from "node:path";
import { resolveGameRoot, resolveProjectRootFromTool } from "./modkit-config.mjs";

const projectRoot = resolveProjectRootFromTool(import.meta.url);
const gameRoot = resolveGameRoot(projectRoot);
const outDir = path.join(projectRoot, "runtime", "save-harness");

const bytecodeFiles = [
  ["www/js/libs/pixi.js", "pixi.js.jsc"],
  ["www/js/libs/pixi-tilemap.js", "pixi-tilemap.js.jsc"],
  ["www/js/libs/pixi-picture.js", "pixi-picture.js.jsc"],
  ["www/js/libs/fpsmeter.js", "fpsmeter.js.jsc"],
  ["www/js/libs/lz-string.js", "lz-string.js.jsc"],
  ["www/js/libs/iphone-inline-video.browser.js", "iphone-inline-video.browser.js.jsc"],
  ["www/js/libs/localforage.min.js", "localforage.min.js.jsc"],
  ["www/js/rpg_core.js", "rpg_core.js.jsc"],
  ["www/js/rpg_managers.js", "rpg_managers.js.jsc"],
  ["www/js/rpg_objects.js", "rpg_objects.js.jsc"],
  ["www/js/rpg_scenes.js", "rpg_scenes.js.jsc"],
  ["www/js/rpg_sprites.js", "rpg_sprites.js.jsc"],
  ["www/js/rpg_windows.js", "rpg_windows.js.jsc"],
  ["www/js/plugins.js", "plugins.js.jsc"],
  ["www/js/main.js", "main.js.jsc"],
  ["www/js/libs/load-resources.js", "load-resources.js.jsc"],
  ["www/js/libs/oneprice.js", "oneprice.js.jsc"],
  ["www/js/libs/video-main.js", "video-main.js.jsc"],
  ["www/js/plugins/AXY_AjaxNetStuff.js", "AXY_AjaxNetStuff.js.jsc"],
  ["www/js/plugins/Drill_EnemyTtleColors.js", "Drill_EnemyTtleColors.js.jsc"]
];

function looksLikeNwBytecode(filePath) {
  const head = fs.readFileSync(filePath).subarray(0, 8);
  return head[0] === 0x03 && head[1] === 0x04;
}

fs.mkdirSync(outDir, { recursive: true });

let count = 0;
for (const [sourceRel, outputName] of bytecodeFiles) {
  const source = path.join(gameRoot, sourceRel);
  if (!fs.existsSync(source)) continue;
  if (!looksLikeNwBytecode(source)) continue;
  fs.copyFileSync(source, path.join(outDir, outputName));
  count += 1;
}

if (count === 0) {
  throw new Error("no NW bytecode files were copied; game layout may differ");
}

console.log(`Copied ${count} bytecode files to ${outDir}`);
