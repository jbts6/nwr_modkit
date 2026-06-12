import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

class CatalogContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "CatalogContractError";
  }
}

const require = createRequire(import.meta.url);
const ts = require("typescript");

function assert(condition, message) {
  if (!condition) throw new CatalogContractError(message);
}

function loadCatalogNamespace(appDir) {
  const sources = [
    path.join(appDir, "src", "catalog-core.ts"),
    path.join(appDir, "src", "catalog-loader.ts")
  ];
  const sandbox = {};
  for (const sourcePath of sources) {
    if (!fs.existsSync(sourcePath)) throw new CatalogContractError(`catalog source missing: ${sourcePath}`);
    const source = fs.readFileSync(sourcePath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 }
    });
    vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  }
  if (!sandbox.NwrGuiCatalog) throw new CatalogContractError("NwrGuiCatalog namespace was not created");
  return sandbox.NwrGuiCatalog;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeNormalFixture(root) {
  fs.mkdirSync(root, { recursive: true });
  writeJson(path.join(root, "System.json"), {
    variables: ["", "Gold Multiplier", "Variable Power"],
    switches: ["", "Bridge Enabled"]
  });
  writeJson(path.join(root, "Items.json"), [
    null,
    { id: 1, name: "Potion", iconIndex: 64, description: "Heal \\C[2]HP", note: "<tag> common item" }
  ]);
  writeJson(path.join(root, "Weapons.json"), [
    null,
    { id: 1, name: "Bronze Sword", iconIndex: 96, description: "Starter blade", note: "" }
  ]);
  writeJson(path.join(root, "Armors.json"), [
    null,
    { id: 1, name: "Travel Coat", iconIndex: 128, description: "Light armor", note: "" }
  ]);
  writeJson(path.join(root, "Actors.json"), [
    null,
    { id: 1, name: "Nina", faceName: "Hero", characterName: "HeroWalk", description: "", note: "" }
  ]);
  writeJson(path.join(root, "Skills.json"), [
    null,
    { id: 7, name: "Spark", iconIndex: 80, description: "Lightning", note: "" }
  ]);
  writeJson(path.join(root, "CommonEvents.json"), [
    null,
    { id: 3, name: "Bridge Diagnostic", trigger: 1, switchId: 1 }
  ]);
  writeJson(path.join(root, "MapInfos.json"), [
    null,
    { id: 1, name: "Meadow", parentId: 0, order: 1 }
  ]);
}

function assertNormalFixture(catalog) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nwr-catalog-normal-"));
  try {
    makeNormalFixture(root);
    const catalogs = catalog.loadCatalogs(fs, path, root);
    assert(catalogs.item.length === 1, "normal fixture should load one item");
    assert(catalogs.weapon.length === 1, "normal fixture should load one weapon");
    assert(catalogs.armor.length === 1, "normal fixture should load one armor");
    assert(catalogs.all.length === 3, "all catalog should merge item, weapon, and armor");
    assert(catalogs.variable.length === 2, "named variable catalog should skip empty slot zero");
    assert(catalogs.switch.length === 1, "named switch catalog should skip empty slot zero");
    assert(catalogs.map.length === 1, "map catalog should load MapInfos rows");
    assert(catalogs.commonEvent.length === 1, "common event catalog should load callable events");

    const filtered = catalog.filterEntries(catalogs.all, "sword");
    assert(filtered.total === 1 && filtered.entries[0].name === "Bronze Sword", "search should match merged all catalog");
    const options = catalog.datalistOptions(catalogs.all, "potion", 5);
    assert(options.length === 1 && options[0].value === "item:1", "datalist options should preserve merged item value");

    const pager = new catalog.CatalogPager(2);
    const state = pager.stateFor("itemList", "all:");
    state.page = 99;
    const pageCount = pager.clamp(state, catalogs.all.length);
    assert(pageCount === 2 && state.page === 2, "pager should clamp oversized page numbers");
    assert(pager.start(state) === 2, "pager start should use clamped page");

    console.log("normalFixture: ok");
    console.log(`normalCounts: all=${catalogs.all.length} maps=${catalogs.map.length}`);
    console.log(`normalSearch: ${filtered.entries.map((entry) => entry.name).join(",")}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function assertMissingFixture(catalog) {
  const root = path.join(os.tmpdir(), `nwr-catalog-missing-${Date.now()}`);
  const catalogs = catalog.loadCatalogs(fs, path, root);
  const names = ["all", "item", "weapon", "armor", "actor", "skill", "variable", "switch", "map", "commonEvent"];
  for (const name of names) {
    assert(Array.isArray(catalogs[name]), `${name} should be an array for missing data`);
    assert(catalogs[name].length === 0, `${name} should be empty for missing data`);
  }
  const filtered = catalog.filterEntries(catalogs.item, "anything");
  assert(filtered.total === 0, "missing fixture search should produce zero results");
  assert(catalog.catalogCountText(filtered, 1, 1) === "0 条", "missing fixture count text should match current empty message");
  assert(catalog.datalistOptions(catalogs.item, "", 5).length === 0, "missing fixture datalist should be empty");
  console.log("missingFixture: ok");
  console.log("missingCounts: all=0 maps=0");
}

function run() {
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(testsDir, "..");
  const catalog = loadCatalogNamespace(appDir);
  assertNormalFixture(catalog);
  assertMissingFixture(catalog);
}

try {
  run();
} catch (error) {
  if (error instanceof CatalogContractError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
