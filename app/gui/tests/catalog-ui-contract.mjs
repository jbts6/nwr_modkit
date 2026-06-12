import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

class CatalogUiContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "CatalogUiContractError";
  }
}

const require = createRequire(import.meta.url);
const ts = require("typescript");

function assert(condition, message) {
  if (!condition) throw new CatalogUiContractError(message);
}

function usage() {
  return [
    "Usage: node tests/catalog-ui-contract.mjs [--expect-first-status <text>]",
    "",
    "Asserts catalog DOM smoke behavior and tool-section navigation models."
  ].join("\n");
}

function parseOptions(argv) {
  const options = { expectedFirstStatus: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      console.log(usage());
      process.exitCode = 0;
      return null;
    }
    if (arg === "--expect-first-status") {
      const value = argv[index + 1];
      if (!value) throw new CatalogUiContractError("--expect-first-status requires a value");
      options.expectedFirstStatus = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--expect-first-status=")) {
      const value = arg.slice("--expect-first-status=".length);
      if (!value) throw new CatalogUiContractError("--expect-first-status requires a value");
      options.expectedFirstStatus = value;
      continue;
    }
    throw new CatalogUiContractError(`unknown argument: ${arg}`);
  }
  return options;
}

function loadNamespaces(appDir) {
  const sources = [
    path.join(appDir, "src", "catalog-core.ts"),
    path.join(appDir, "src", "catalog-ui.ts"),
    path.join(appDir, "src", "catalog-tools.ts"),
    path.join(appDir, "src", "tool-navigation.ts")
  ];
  const sandbox = {};
  for (const sourcePath of sources) {
    if (!fs.existsSync(sourcePath)) throw new CatalogUiContractError(`UI source missing: ${sourcePath}`);
    const source = fs.readFileSync(sourcePath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 }
    });
    vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  }
  assert(sandbox.NwrGuiCatalog, "NwrGuiCatalog namespace was not created");
  assert(sandbox.NwrGuiCatalogUi, "NwrGuiCatalogUi namespace was not created");
  assert(sandbox.NwrGuiToolNavigation, "NwrGuiToolNavigation namespace was not created");
  return {
    catalog: sandbox.NwrGuiCatalog,
    ui: sandbox.NwrGuiCatalogUi,
    navigation: sandbox.NwrGuiToolNavigation
  };
}

class FakeClassList {
  constructor(names = []) {
    this.names = new Set(names);
  }

  contains(name) {
    return this.names.has(name);
  }

  add(name) {
    this.names.add(name);
  }

  remove(name) {
    this.names.delete(name);
  }

  toggle(name) {
    if (this.names.has(name)) {
      this.names.delete(name);
      return false;
    }
    this.names.add(name);
    return true;
  }
}

class FakeTools {
  constructor() {
    this.nodes = new Map([
      ["collapse", { textContent: "", disabled: false }],
      ["expand", { textContent: "", disabled: false }],
      ["first", { textContent: "", disabled: false }],
      ["prev", { textContent: "", disabled: false }],
      ["page-status", { textContent: "", disabled: false }],
      ["next", { textContent: "", disabled: false }],
      ["last", { textContent: "", disabled: false }]
    ]);
  }

  querySelector(selector) {
    const match = selector.match(/data-catalog-tool="([^"]+)"/);
    return match ? this.nodes.get(match[1]) || null : null;
  }
}

class FakeTarget {
  constructor(id, tools) {
    this.id = id;
    this.scrollTop = 37;
    this.clientWidth = 640;
    this.scrollHeight = 176;
    this.clientHeight = 88;
    this.innerHTML = "";
    this.offsetParent = {};
    this.classList = new FakeClassList();
    this.__catalogTools = tools;
  }

  closest() {
    return null;
  }
}

function renderPage(ui, catalog, target, previousView, entries, countTarget, pager) {
  const view = ui.createCatalogView({
    targetId: target.id,
    previousView,
    sourceEntries: entries,
    options: {
      kind: "item",
      query: "",
      selectedId: 2,
      leading: (entry) => `<span class="lead">${entry.id}</span>`,
      actions: (entry) => `<button data-id="${entry.id}">添加</button>`,
      description: (entry) => entry.description,
      countTarget
    },
    pager
  });
  ui.applyCatalogCountTarget(view);
  ui.renderVirtualCatalog(target, view, { iconRenderVersion: 1 });
  ui.applyCatalogToolState(ui.catalogToolElements(target.__catalogTools), ui.catalogToolState(view, false, false));
  return view;
}

function assertCatalogSmoke(catalog, ui, options) {
  const entries = [
    { id: 1, name: "Potion", description: "Heal <HP>", noteText: "", searchText: "potion" },
    { id: 2, name: "Hi-Potion", description: "Big heal", noteText: "", searchText: "hi potion" },
    { id: 3, name: "Elixir", description: "Rare", noteText: "", searchText: "elixir" }
  ];
  const pager = new catalog.CatalogPager(2);
  const tools = new FakeTools();
  const target = new FakeTarget("itemList", tools);
  const countTarget = { textContent: "" };

  const firstView = renderPage(ui, catalog, target, null, entries, countTarget, pager);
  assert(target.innerHTML.includes("Potion"), "first page should render item rows");
  assert(target.innerHTML.includes("active"), "selected row should be marked active");
  assert(countTarget.textContent === "共 3 条 / 1/2 页", `unexpected first count: ${countTarget.textContent}`);
  assert(tools.nodes.get("page-status").textContent === "第 1 / 2 页 · 本页 2 条", "first page status should show two rows");
  if (options.expectedFirstStatus) {
    assert(
      tools.nodes.get("page-status").textContent === options.expectedFirstStatus,
      `first page status expected ${options.expectedFirstStatus}, got ${tools.nodes.get("page-status").textContent}`
    );
  }
  assert(tools.nodes.get("prev").disabled === true, "previous should be disabled on first page");
  assert(tools.nodes.get("next").disabled === false, "next should be enabled on first page");

  assert(ui.changeCatalogPage(pager, firstView, "next") === true, "next page action should change state");
  target.scrollTop = 19;
  const secondView = renderPage(ui, catalog, target, firstView, entries, countTarget, pager);
  assert(target.scrollTop === 19, "same query rerender should not reset scroll");
  assert(target.innerHTML.includes("Elixir"), "second page should render the remaining item");
  assert(tools.nodes.get("page-status").textContent === "第 2 / 2 页 · 本页 1 条", "second page status should show one row");
  assert(tools.nodes.get("prev").disabled === false, "previous should be enabled on second page");
  assert(tools.nodes.get("next").disabled === true, "next should be disabled on last page");

  assert(ui.changeCatalogPage(pager, secondView, "prev") === true, "previous page action should change state");
  const previousView = renderPage(ui, catalog, target, secondView, entries, countTarget, pager);
  assert(previousView.page === 1, "previous action should return to page one");
  assert(ui.shouldForwardWheel({ deltaY: 1, scrollTop: 88, scrollHeight: 176, clientHeight: 88 }) === true, "bottom wheel should forward to page scroller");
  console.log("catalogSmoke: count/status/page next-prev ok");
}

function assertNavigationSmoke(navigation) {
  const activeSections = { core: "gold" };
  const panels = [
    { tab: "core", sectionText: "gold", label: "Gold", navEnabled: true, modePanel: "" },
    { tab: "core", sectionText: "variable", label: "Variables", navEnabled: true, modePanel: "" },
    { tab: "debug", sectionText: "command", label: "Command", navEnabled: true, modePanel: "advanced" }
  ];
  const sections = navigation.sectionsForTab(panels, "core");
  assert(sections.length === 2, "core tab should expose two navigation sections");
  assert(navigation.ensureActiveSection("core", sections, activeSections) === "gold", "active section should be preserved");
  assert(navigation.nextSection(sections, "gold", 1) === "variable", "next section should advance");
  assert(navigation.panelMatchesActiveSection(panels[1], "core", "variable", ""), "variable panel should match active section");
  assert(!navigation.panelMatchesActiveSection(panels[2], "debug", "command", ""), "mode-scoped panel should honor active mode");
  assert(!navigation.pageScrollMode(1200, 900), "large viewport should keep fixed workspace mode");
  assert(navigation.pageScrollMode(1110, 900), "zoomed/narrow viewport should enable page scroll mode");
  assert(navigation.pageScrollMode(1280, 810), "short viewport should enable page scroll mode");
  assert(navigation.pageScrollMode(980, 900), "viewport threshold should enable page scroll mode");
  console.log("navigationSmoke: sections/visibility/viewport ok");
}

function assertStartupScrollReset(appDir) {
  const source = fs.readFileSync(path.join(appDir, "app.ts"), "utf8");
  assert(source.includes("function resetRestoredPageScroll()"), "app should explicitly reset restored page scroll after startup");
  assert(
    source.includes('window.history.scrollRestoration = "manual"'),
    "startup scroll reset should disable browser scroll restoration"
  );
  assert(
    /window\.setTimeout\(scrollActiveToolAreaToTop,\s*0\)/.test(source),
    "startup scroll reset should run after browser scroll restoration"
  );
  assert(
    /window\.setTimeout\(scrollActiveToolAreaToTop,\s*250\)/.test(source),
    "startup scroll reset should retry after first layout settles"
  );
  console.log("startupScroll: restored page scroll reset ok");
}

function assertSectionSwitchKeepsScroll(appDir) {
  const source = fs.readFileSync(path.join(appDir, "app.ts"), "utf8");
  assert(/activateTab\(button\.dataset\.toolTab,\s*\{\s*keepScroll:\s*true\s*\}\)/.test(source), "top-level tool tabs should preserve page scroll");
  assert(/activateToolSection\(button\.dataset\.toolSectionJump \|\| "",\s*\{\s*keepScroll:\s*true\s*\}\)/.test(source), "tool section jump buttons should preserve page scroll");
  assert(/activateToolSection\(next,\s*\{\s*keepScroll:\s*true\s*\}\)/.test(source), "next-section catalog tool should preserve page scroll");
}

function run() {
  const options = parseOptions(process.argv.slice(2));
  if (options === null) return;
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(testsDir, "..");
  const namespaces = loadNamespaces(appDir);
  assertCatalogSmoke(namespaces.catalog, namespaces.ui, options);
  assertNavigationSmoke(namespaces.navigation);
  assertStartupScrollReset(appDir);
  assertSectionSwitchKeepsScroll(appDir);
}

try {
  run();
} catch (error) {
  if (error instanceof CatalogUiContractError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
