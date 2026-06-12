declare const nw: { readonly Shell: { readonly openItem: (folder: string) => void } };

type DomElement = HTMLElement & {
  checked: boolean;
  disabled: boolean;
  value: string;
  defaultValue: string;
  __catalogTools?: HTMLElement;
};
type SpawnedProcess = {
  readonly pid?: number;
  readonly unref: () => void;
  readonly on: {
    (event: "error", listener: (error: Error) => void): void;
    (event: "exit", listener: (code: number | null, signal: string | null) => void): void;
  };
};
type MapStateRecord = {
  readonly mapId?: unknown;
  readonly x?: unknown;
  readonly y?: unknown;
  readonly direction?: unknown;
};
type RuntimeStateRecord = { readonly currentMap?: MapStateRecord; readonly [key: string]: unknown };
type BridgeEventRecord = {
  readonly type?: unknown;
  readonly ok?: unknown;
  readonly payload?: unknown;
  readonly scheduled?: unknown;
};
type RecordedPosition = {
  readonly mapId: number;
  readonly x: number;
  readonly y: number;
  readonly direction: number;
  readonly fade: number;
};
type ToolSectionOptions = { readonly keepScroll?: boolean };
type SendCommandOptions = { readonly silent?: boolean };

(function () {
  const fs = require("fs");
  const path = require("path");
  const childProcess = require("child_process");

  const projectRoot = path.resolve(process.cwd(), "..", "..");
  const rootDir = resolveGameRoot(projectRoot);
  const launchRuntimeScript = path.join(projectRoot, "tools", "launch-runtime.ps1");
  const preparedGameDir = path.join(projectRoot, "runtime", "game-app");
  const preparedGameLauncherPath = path.join(preparedGameDir, "start-manual-bg-bridge.cmd");
  const bridgePaths = NwrGuiBridgeIO.createBridgePaths(path, projectRoot);
  const saveDir = path.join(rootDir, "www", "save");
  const dataDir = path.join(projectRoot, "output", "extract", "data");
  const iconDir = path.join(process.cwd(), "icons");
  const exportedIconSetPath = path.join(iconDir, "IconSet.png");
  const fallbackIconSetPath = path.join(rootDir, "www", "img", "system", "IconSet.png");
  const EXPECTED_BRIDGE_VERSION = "0.2.32";
  const ICON_EXPORT_RETRY_MS = 5000;

  const $ = (id: string): DomElement => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing GUI element: ${id}`);
    return element as DomElement;
  };
  const dom = {
    statusPill: $("statusPill"),
    launchBtn: $("launchBtn"),
    openPreparedGameBtn: $("openPreparedGameBtn"),
    runtimeRoute: $("runtimeRoute"),
    runtimeRouteRisk: $("runtimeRouteRisk"),
    runtimeRouteStatus: $("runtimeRouteStatus"),
    refreshBtn: $("refreshBtn"),
    bridgeState: $("bridgeState"),
    preparedGameState: $("preparedGameState"),
    partyState: $("partyState"),
    goldState: $("goldState"),
    goldMetric: $("goldMetric"),
    saveState: $("saveState"),
    mapState: $("mapState"),
    saveFiles: $("saveFiles"),
    partyMembers: $("partyMembers"),
    prisonGuardSummary: $("prisonGuardSummary"),
    prisonGuardMetrics: $("prisonGuardMetrics"),
    prisonGuardList: $("prisonGuardList"),
    prisonRepairBtn: $("prisonRepairBtn"),
    variableList: $("variableList"),
    variableListCount: $("variableListCount"),
    switchList: $("switchList"),
    switchListCount: $("switchListCount"),
    itemList: $("itemList"),
    itemListCount: $("itemListCount"),
    skillList: $("skillList"),
    skillListCount: $("skillListCount"),
    actorList: $("actorList"),
    actorListCount: $("actorListCount"),
    mapList: $("mapList"),
    mapListCount: $("mapListCount"),
    commonEventList: $("commonEventList"),
    commonEventListCount: $("commonEventListCount"),
    eventList: $("eventList"),
    battleState: $("battleState"),
    toolSectionNav: $("toolSectionNav"),
    diagnosticState: $("diagnosticState"),
    openDiagnosticsBtn: $("openDiagnosticsBtn"),
    toast: $("toast")
  };

  let lastEventSize = 0;
  let switchValue = true;
  let gameProcess: SpawnedProcess | null = null;
  let iconSetImage: HTMLImageElement | null = null;
  let iconRenderVersion = 0;
  let latestState: RuntimeStateRecord | null = null;
  let recordedPosition: RecordedPosition | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let iconExportRequested = false;
  let iconExportCompleted = false;
  let iconExportLastAttemptMs = 0;
  let selectedRuntimeRoute = NwrGuiRuntimeRoutes.defaultRouteName();
  let activeToolTab = "core";
  const activeToolSections: NwrGuiToolNavigation.ActiveToolSections = {
    core: "gold",
    catalog: "item",
    world: "map",
    misc: "variable",
    debug: "diagnostics"
  };
  const iconCache = new Map<number, string>();
  const catalogViews = new Map<string, NwrGuiCatalogUi.MutableCatalogView>();
  const catalogPager = new NwrGuiCatalog.CatalogPager();
  const datalistSources = new Map<string, NwrGuiCatalog.CatalogEntry[]>();
  const CATALOG_LIST_IDS = NwrGuiCatalogUi.CATALOG_LIST_IDS;
  const itemKindLabels = NwrGuiCatalog.ITEM_KIND_LABELS;
  let selectedItemKind = "item";
  let catalogs: NwrGuiCatalog.Catalogs = emptyCatalogs();

  process.env.DQ2_MODKIT_ROOT = projectRoot;
  process.env.DQ2_GAME_ROOT = rootDir;

  function emptyCatalogs(): NwrGuiCatalog.Catalogs {
    return {
      variable: [],
      switch: [],
      item: [],
      weapon: [],
      armor: [],
      actor: [],
      skill: [],
      map: [],
      commonEvent: [],
      all: []
    };
  }

  function resolveGameRoot(projectRoot) {
    const candidates = [];
    if (process.env.DQ2_GAME_ROOT) candidates.push(process.env.DQ2_GAME_ROOT);
    try {
      const configPath = path.join(projectRoot, "config.local.json");
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (config && config.gameRoot) candidates.push(String(config.gameRoot));
      }
    } catch (error) {
      throw new Error("Invalid config.local.json: " + (error && error.message || error));
    }
    candidates.push(path.resolve(projectRoot, ".."));

    for (const candidate of candidates) {
      const fullPath = path.resolve(projectRoot, expandEnv(candidate));
      if (fs.existsSync(path.join(fullPath, "www", "index.html"))) {
        return fs.realpathSync(fullPath);
      }
    }
    throw new Error("Game root not found. Set DQ2_GAME_ROOT or create config.local.json.");
  }

  function expandEnv(value) {
    return String(value).replace(/%([^%]+)%|\$\{([^}]+)\}/g, (match, winName, posixName) => {
      const name = winName || posixName;
      return process.env[name] || match;
    });
  }

  function readJson(file) {
    try {
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }

  function datalistOptionHtml(option) {
    return `<option value="${escapeHtml(option.value)}" label="${escapeHtml(option.label)}"></option>`;
  }

  function populateDatalist(id, entries) {
    const list = $(id);
    if (!list) return;
    datalistSources.set(id, entries || []);
    list.innerHTML = NwrGuiCatalog.datalistOptions(entries || [], "", NwrGuiCatalog.DATALIST_LIMIT)
      .map(datalistOptionHtml)
      .join("");
  }

  function refreshPickerDatalist(input) {
    const listId = input.getAttribute("list");
    if (!listId) return;
    const entries = datalistSources.get(listId);
    if (!entries) return;
    const list = $(listId);
    if (!list) return;
    list.innerHTML = NwrGuiCatalog.datalistOptions(entries, input.value, NwrGuiCatalog.DATALIST_LIMIT)
      .map(datalistOptionHtml)
      .join("");
  }

  function existingIconSetPath(): string {
    if (validIconSheet(exportedIconSetPath)) return exportedIconSetPath;
    if (validIconSheet(fallbackIconSetPath)) return fallbackIconSetPath;
    return "";
  }

  function exportedIconSetReady(): boolean {
    return validIconSheet(exportedIconSetPath);
  }

  function validIconSheet(filePath: string): boolean {
    try {
      if (!fs.existsSync(filePath)) return false;
      const bytes = fs.readFileSync(filePath);
      if (!hasPngHeader(bytes) || bytes.length < 24) return false;
      return bytes.readUInt32BE(16) >= 32 && bytes.readUInt32BE(20) >= 32;
    } catch {
      return false;
    }
  }

  function hasPngHeader(bytes: Buffer): boolean {
    return bytes.length >= 8
      && bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a;
  }

  function iconSetBytes(filePath: string): Buffer {
    const bytes = fs.readFileSync(filePath);
    return hasPngHeader(bytes) ? bytes : decryptProtectedImage(bytes);
  }

  function setupIconSet(): void {
    const iconSetPath = existingIconSetPath();
    if (!iconSetPath) return;
    try {
      const bytes = iconSetBytes(iconSetPath);
      const image = new Image();
      image.onload = () => {
        iconSetImage = image;
        iconRenderVersion += 1;
        renderCatalogs();
      };
      image.onerror = () => showToast("图标集图片解码失败");
      image.src = `data:image/png;base64,${bytes.toString("base64")}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(`图标集加载失败：${message}`);
    }
  }

  function decryptProtectedImage(input: Buffer): Buffer {
    const data = Buffer.from(input);
    if (data.length <= 100) return data;
    const head = data.subarray(0, 100);
    const body = unshuffleBytes(data.subarray(100));
    for (let i = 0; i < body.length; i += 1) {
      body[i] ^= (i % 256) ^ 90;
    }
    return Buffer.concat([head, body]);
  }

  function unshuffleBytes(input: Buffer): Buffer {
    const bytes = Array.from(input);
    const swaps: number[] = [];
    let remaining = bytes.length;
    const random = (max: number): number => {
      const value = 10000 * Math.sin(12345 + remaining);
      return Math.floor((value - Math.floor(value)) * max);
    };
    while (remaining !== 0) {
      swaps.push(random(remaining));
      remaining -= 1;
    }
    const positions = Array.from({ length: bytes.length }, (_, index) => index);
    for (let i = 0; i < swaps.length; i += 1) {
      const from = swaps[i];
      const to = positions.length - 1 - i;
      if (from < to) {
        const old = positions[from];
        positions[from] = positions[to];
        positions[to] = old;
      }
    }
    const output = new Array<number>(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) output[positions[i]] = bytes[i];
    return Buffer.from(output);
  }

  function iconDataUrl(iconIndex: unknown): string {
    const index = Math.max(0, Math.floor(Number(iconIndex) || 0));
    const cached = iconCache.get(index);
    if (cached) return cached;
    if (!iconSetImage) return "";
    const x = (index % 16) * 32;
    const y = Math.floor(index / 16) * 32;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.imageSmoothingEnabled = false;
    context.drawImage(iconSetImage, x, y, 32, 32, 0, 0, 32, 32);
    const dataUrl = canvas.toDataURL("image/png");
    iconCache.set(index, dataUrl);
    return dataUrl;
  }

  function iconHtml(iconIndex: unknown): string {
    const index = Math.max(0, Math.floor(Number(iconIndex) || 0));
    const fileName = `icon_${index}.png`;
    if (fs.existsSync(path.join(iconDir, fileName))) {
      return `<img class="rpg-icon" src="icons/${fileName}" alt="icon ${index}">`;
    }
    const dataUrl = iconDataUrl(iconIndex);
    if (!dataUrl) return '<span class="rpg-icon icon-pending"></span>';
    return `<img class="rpg-icon" src="${dataUrl}" alt="icon ${index}">`;
  }

  function actorAvatarHtml(actor) {
    return `<span class="actor-avatar">${escapeHtml(actor.id)}</span>`;
  }

  function badgeHtml(label, tone = "") {
    return `<span class="catalog-badge ${tone}">${escapeHtml(label)}</span>`;
  }

  function selectedNumber(id) {
    return Number(numberValue(id, NaN));
  }

  function parseItemSelection() {
    const raw = String($("itemId").value || "").trim();
    const match = raw.match(/^(item|weapon|armor)\s*:\s*(\d+)$/i);
    if (match) {
      return { kind: match[1].toLowerCase(), id: Number(match[2]), raw: `${match[1].toLowerCase()}:${match[2]}` };
    }
    const chooserKind = $("itemKind").value;
    const kind = chooserKind === "all" ? selectedItemKind : chooserKind;
    return { kind, id: numberValue("itemId", NaN), raw };
  }

  function itemSelectionKey(selection) {
    return `${selection.kind}:${selection.id}`;
  }

  function debounce(fn, delay = 120) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function renderVirtualCatalog(target) {
    const view = catalogViews.get(target.id);
    if (!view) return;
    NwrGuiCatalogUi.renderVirtualCatalog(target, view, { iconRenderVersion });
  }

  function renderCatalogList(target, entries, options) {
    const previous = catalogViews.get(target.id);
    const view = NwrGuiCatalogUi.createCatalogView({
      targetId: target.id,
      previousView: previous,
      sourceEntries: entries,
      options,
      pager: catalogPager
    });
    catalogViews.set(target.id, view);
    if (!previous || previous.queryKey !== view.queryKey) target.scrollTop = 0;
    NwrGuiCatalogUi.applyCatalogCountTarget(view);
    updateCatalogLimitTools(target);
    if (!NwrGuiCatalogUi.elementIsVisible(target)) return;
    renderVirtualCatalog(target);
  }

  function renderItemList() {
    const kind = $("itemKind").value;
    const entries = catalogs[kind] || [];
    const selection = parseItemSelection();
    renderCatalogList(dom.itemList, entries, {
      kind,
      query: $("itemSearch").value,
      selectedId: kind === "all" ? itemSelectionKey(selection) : selection.id,
      key: (entry) => entry.uid || entry.id,
      rowKind: (entry) => entry.kind || kind,
      leading: (entry) => iconHtml(entry.iconIndex),
      extra: (entry) => entry.kindLabel || "",
      actions: (entry) => `<button data-catalog-action="item-add" data-kind="${entry.kind || kind}" data-id="${entry.id}">添加</button>`,
      description: (entry) => entry.description || entry.noteText,
      countTarget: dom.itemListCount
    });
  }

  function renderSkillList() {
    const entries = catalogs.skill || [];
    renderCatalogList(dom.skillList, entries, {
      kind: "skill",
      query: $("skillSearch").value,
      selectedId: selectedNumber("skillId"),
      leading: (entry) => iconHtml(entry.iconIndex),
      actions: (entry) => `<button data-catalog-action="skill-learn" data-id="${entry.id}">学会</button><button data-catalog-action="skill-forget" data-id="${entry.id}">遗忘</button>`,
      description: (entry) => entry.description || entry.noteText,
      countTarget: dom.skillListCount
    });
  }

  function renderActorList() {
    const entries = catalogs.actor || [];
    renderCatalogList(dom.actorList, entries, {
      kind: "actor",
      query: $("actorSearch").value,
      selectedId: selectedNumber("actorId"),
      leading: actorAvatarHtml,
      extra: (entry) => entry.faceName || entry.characterName || "",
      actions: (entry) => `<button data-catalog-action="actor-unlock" data-id="${entry.id}">解锁</button><button data-catalog-action="actor-select" data-id="${entry.id}">编辑</button>`,
      countTarget: dom.actorListCount
    });
  }

  function renderVariableList() {
    const entries = catalogs.variable || [];
    renderCatalogList(dom.variableList, entries, {
      kind: "variable",
      query: $("variableSearch").value,
      selectedId: selectedNumber("variableId"),
      leading: (entry) => badgeHtml(entry.id, "var"),
      actions: (entry) => `<button data-catalog-action="variable-select" data-id="${entry.id}">填入</button><button data-catalog-action="variable-set" data-id="${entry.id}">写入</button>`,
      countTarget: dom.variableListCount
    });
  }

  function renderSwitchList() {
    const entries = catalogs.switch || [];
    renderCatalogList(dom.switchList, entries, {
      kind: "switch",
      query: $("switchSearch").value,
      selectedId: selectedNumber("switchId"),
      leading: (entry) => badgeHtml(entry.id, "switch"),
      actions: (entry) => `<button data-catalog-action="switch-on" data-id="${entry.id}">ON</button><button data-catalog-action="switch-off" data-id="${entry.id}">OFF</button>`,
      countTarget: dom.switchListCount
    });
  }

  function renderMapList() {
    const entries = catalogs.map || [];
    renderCatalogList(dom.mapList, entries, {
      kind: "map",
      query: $("mapSearch").value,
      selectedId: selectedNumber("mapId"),
      leading: (entry) => badgeHtml(entry.id, "map"),
      actions: (entry) => `<button data-catalog-action="map-transfer" data-id="${entry.id}">传送</button>`,
      description: (entry) => entry.description,
      countTarget: dom.mapListCount
    });
  }

  function renderCommonEventList() {
    const entries = catalogs.commonEvent || [];
    renderCatalogList(dom.commonEventList, entries, {
      kind: "commonEvent",
      query: $("commonEventSearch").value,
      selectedId: selectedNumber("commonEventId"),
      leading: (entry) => badgeHtml(entry.id, "event"),
      actions: (entry) => `<button data-catalog-action="common-event-run" data-id="${entry.id}">运行</button>`,
      description: (entry) => entry.description,
      countTarget: dom.commonEventListCount
    });
  }

  const catalogRenderers: Record<string, () => void> = {
    itemList: renderItemList,
    skillList: renderSkillList,
    actorList: renderActorList,
    variableList: renderVariableList,
    switchList: renderSwitchList,
    mapList: renderMapList,
    commonEventList: renderCommonEventList
  };

  function renderActiveCatalogs() {
    CATALOG_LIST_IDS.forEach((id) => {
      const element = $(id);
      if (NwrGuiCatalogUi.elementIsVisible(element) && catalogRenderers[id]) catalogRenderers[id]();
    });
  }

  function renderCatalogs() {
    renderActiveCatalogs();
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2600);
  }

  function applyRuntimeStatus(status) {
    dom.statusPill.className = status.className;
    dom.statusPill.textContent = status.text;
  }

  function saveFilesHtml(files, hasState) {
    if (!hasState) return "";
    return files.length
      ? files.map((name) => `<li>${escapeHtml(name)}</li>`).join("")
      : "<li>未检测到</li>";
  }

  function partyMembersHtml(members, hasState) {
    if (!hasState) return "";
    return members.length
      ? members.map((actor) => `<li><strong>${escapeHtml(actor.id)} / ${escapeHtml(actor.name)}</strong><span>${escapeHtml(actor.vitals)}</span></li>`).join("")
      : "<li>未检测到</li>";
  }

  function routeOptionHtml(route) {
    const selected = route.name === selectedRuntimeRoute ? " selected" : "";
    return `<option value="${escapeHtml(route.name)}"${selected}>${escapeHtml(route.label)}</option>`;
  }

  function renderRuntimeRoute() {
    const model = NwrGuiRuntimeRoutes.diagnosticModel(selectedRuntimeRoute);
    if (dom.runtimeRoute) dom.runtimeRoute.value = model.routeName;
    if (dom.runtimeRouteRisk) dom.runtimeRouteRisk.textContent = model.riskNote;
    if (dom.runtimeRouteStatus) {
      dom.runtimeRouteStatus.textContent = model.switchText === "(none)" ? "default" : model.switchText;
      dom.runtimeRouteStatus.title = `${model.routeName} / switches: ${model.switchText}`;
    }
  }

  function setupRuntimeRoutes() {
    if (!dom.runtimeRoute) return;
    dom.runtimeRoute.innerHTML = NwrGuiRuntimeRoutes.routeOptions().map(routeOptionHtml).join("");
    renderRuntimeRoute();
    dom.runtimeRoute.addEventListener("change", () => {
      selectedRuntimeRoute = NwrGuiRuntimeRoutes.normalizeRouteName(dom.runtimeRoute.value);
      renderRuntimeRoute();
    });
  }

  function formatNumber(value) {
    if (value == null || value === "") return "-";
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    return new Intl.NumberFormat("zh-CN").format(number);
  }

  function parseValue(text) {
    const value = String(text).trim();
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;
    if (value !== "" && Number.isFinite(Number(value))) return Number(value);
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function numberValue(id, fallback = 0) {
    const value = looseNumber($(id).value);
    return Number.isFinite(value) ? value : fallback;
  }

  function optionalNumber(id) {
    const text = String($(id).value).trim();
    if (text === "") return undefined;
    const value = looseNumber(text);
    return Number.isFinite(value) ? value : undefined;
  }

  function looseNumber(value) {
    const text = String(value == null ? "" : value).trim();
    if (text === "") return NaN;
    const direct = Number(text);
    if (Number.isFinite(direct)) return direct;
    const match = text.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  function activeActorId() {
    return numberValue("actorId", 0);
  }

  function skillActorId() {
    return numberValue("skillActorId", activeActorId());
  }

  function actorPointClassId() {
    return optionalNumber("actorPointClassId");
  }

  function updateLookupHints() {
    const itemSelection = parseItemSelection();
    const itemName = NwrGuiCatalog.catalogName(catalogs, itemSelection.kind, itemSelection.id);
    const itemKindLabel = itemKindLabels[itemSelection.kind] || itemSelection.kind;
    $("itemHint").textContent = itemName ? `${itemKindLabel} ${itemSelection.id} / ${itemName}` : "";

    const actorId = numberValue("actorId", NaN);
    const actorName = NwrGuiCatalog.catalogName(catalogs, "actor", actorId);
    $("actorHint").textContent = actorName ? `${actorId} / ${actorName}` : "";

    const skillActorName = NwrGuiCatalog.catalogName(catalogs, "actor", numberValue("skillActorId", NaN));
    const skillName = NwrGuiCatalog.catalogName(catalogs, "skill", numberValue("skillId", NaN));
    $("skillHint").textContent = [skillActorName, skillName].filter(Boolean).join(" / ");

    const variableName = NwrGuiCatalog.catalogName(catalogs, "variable", numberValue("variableId", NaN));
    $("variableHint").textContent = variableName ? `${$("variableId").value} / ${variableName}` : "";

    const switchName = NwrGuiCatalog.catalogName(catalogs, "switch", numberValue("switchId", NaN));
    $("switchHint").textContent = switchName ? `${$("switchId").value} / ${switchName}` : "";

    const mapName = NwrGuiCatalog.catalogName(catalogs, "map", numberValue("mapId", NaN));
    $("mapHint").textContent = mapName ? `${$("mapId").value} / ${mapName}` : "";

    const commonEventName = NwrGuiCatalog.catalogName(catalogs, "commonEvent", numberValue("commonEventId", NaN));
    $("commonEventHint").textContent = commonEventName ? `${$("commonEventId").value} / ${commonEventName}` : "";
  }

  function refreshCatalogControls() {
    populateDatalist("allOptions", catalogs.all);
    populateDatalist("itemOptions", catalogs.item);
    populateDatalist("weaponOptions", catalogs.weapon);
    populateDatalist("armorOptions", catalogs.armor);
    populateDatalist("actorOptions", catalogs.actor);
    populateDatalist("skillOptions", catalogs.skill);
    populateDatalist("variableOptions", catalogs.variable);
    populateDatalist("switchOptions", catalogs.switch);
    populateDatalist("mapOptions", catalogs.map);
    populateDatalist("commonEventOptions", catalogs.commonEvent);
    updateLookupHints();
    renderCatalogs();
  }

  function setupCatalogs() {
    refreshCatalogControls();
    $("itemKind").addEventListener("change", () => {
      const kind = $("itemKind").value;
      $("itemId").setAttribute("list", `${kind}Options`);
      if (kind === "all") {
        const selection = parseItemSelection();
        if (Number.isFinite(selection.id)) $("itemId").value = itemSelectionKey(selection);
      } else if (/^(item|weapon|armor)\s*:/i.test($("itemId").value)) {
        $("itemId").value = String(parseItemSelection().id || "");
      }
      refreshPickerDatalist($("itemId"));
      updateLookupHints();
      renderItemList();
    });
    $("itemSearch").addEventListener("input", debounce(renderItemList));
    $("skillSearch").addEventListener("input", debounce(renderSkillList));
    $("actorSearch").addEventListener("input", debounce(renderActorList));
    $("variableSearch").addEventListener("input", debounce(renderVariableList));
    $("switchSearch").addEventListener("input", debounce(renderSwitchList));
    $("mapSearch").addEventListener("input", debounce(renderMapList));
    $("commonEventSearch").addEventListener("input", debounce(renderCommonEventList));
    $("itemId").addEventListener("input", () => {
      updateLookupHints();
      renderItemList();
    });
    $("actorId").addEventListener("input", () => {
      updateLookupHints();
      renderActorList();
    });
    $("skillId").addEventListener("input", () => {
      updateLookupHints();
      renderSkillList();
    });
    ["skillActorId"].forEach((id) => {
      $(id).addEventListener("input", updateLookupHints);
    });
    ["variableId", "switchId", "mapId", "commonEventId"].forEach((id) => {
      $(id).addEventListener("input", () => {
        updateLookupHints();
        if (id === "variableId") renderVariableList();
        else if (id === "switchId") renderSwitchList();
        else if (id === "mapId") renderMapList();
        else if (id === "commonEventId") renderCommonEventList();
      });
    });
    setupPickerInputs();
  }

  function loadCatalogAssetsAfterFirstPaint() {
    requestAnimationFrame(() => {
      setTimeout(() => {
        catalogs = NwrGuiCatalog.loadCatalogs(fs, path, dataDir);
        refreshCatalogControls();
        setupIconSet();
      }, 0);
    });
  }

  function setupPickerInputs() {
    document.querySelectorAll<HTMLInputElement>("input[list]").forEach((input) => {
      input.setAttribute("autocomplete", "off");
      input.dataset.pickerLastValue = input.value || "";
      input.addEventListener("focus", () => {
        const value = String(input.value || "");
        refreshPickerDatalist(input);
        if (!value.trim()) return;
        input.dataset.pickerLastValue = value;
        input.dataset.pickerCleared = "true";
        input.value = "";
        refreshPickerDatalist(input);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dataset.pickerLastValue = value;
        input.dataset.pickerCleared = "true";
      });
      input.addEventListener("input", () => {
        refreshPickerDatalist(input);
        input.dataset.pickerCleared = "false";
        input.dataset.pickerLastValue = input.value || "";
      });
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || input.dataset.pickerCleared !== "true") return;
        input.value = input.dataset.pickerLastValue || input.defaultValue || "";
        input.dataset.pickerCleared = "false";
        refreshPickerDatalist(input);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.blur();
      });
      input.addEventListener("blur", () => {
        if (input.dataset.pickerCleared === "true" && !String(input.value || "").trim()) {
          input.value = input.dataset.pickerLastValue || input.defaultValue || "";
          refreshPickerDatalist(input);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        input.dataset.pickerCleared = "false";
        input.dataset.pickerLastValue = input.value || "";
      });
    });
  }

  function bindVirtualScroll(target) {
    target.tabIndex = 0;
    target.addEventListener("wheel", (event) => {
      const delta = Number(event.deltaY || 0);
      if (!NwrGuiCatalogUi.shouldForwardWheel({
        deltaY: delta,
        scrollTop: target.scrollTop,
        scrollHeight: target.scrollHeight,
        clientHeight: target.clientHeight
      })) return;
      const scroller = document.scrollingElement;
      if (!scroller || scroller === target) return;
      scroller.scrollBy({ top: delta, behavior: "auto" });
      event.preventDefault();
    }, { passive: false });
  }

  function toolPanelSnapshot(panel: HTMLElement): NwrGuiToolNavigation.ToolPanelSnapshot {
    const title = panel.querySelector(".panel-title");
    return {
      tab: panel.dataset.toolPanel || "",
      sectionText: panel.dataset.toolSection || "",
      label: panel.dataset.toolLabel || title?.textContent?.trim() || "",
      navEnabled: panel.dataset.toolSectionNav !== "false",
      modePanel: panel.dataset.modePanel || ""
    };
  }

  function applyToolPanelAuditPolicy(panel: HTMLElement, snapshot: NwrGuiToolNavigation.ToolPanelSnapshot): void {
    const policy = NwrGuiFeatureAudit.policyForPanel(snapshot);
    const controls = Array.from(
      panel.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        "button, input, select, textarea"
      )
    );
    NwrGuiFeatureAudit.applyPanelAuditState(panel, controls, policy);
    renderAuditGuardNote(panel, policy);
  }

  function renderAuditGuardNote(panel: HTMLElement, policy: NwrGuiFeatureAudit.PanelPolicy | null): void {
    const existing = panel.querySelector<HTMLElement>(".audit-guard-note");
    if (!policy || policy.actionAllowed) {
      if (existing) existing.remove();
      return;
    }
    const note = existing || document.createElement("div");
    note.className = "audit-guard-note";
    note.textContent = NwrGuiCommandGuardrails.panelGuardText(policy);
    if (!existing) {
      const title = panel.querySelector(".panel-title");
      if (title && title.nextSibling) panel.insertBefore(note, title.nextSibling);
      else if (title) panel.appendChild(note);
      else panel.prepend(note);
    }
  }

  function toolPanelSnapshots(): NwrGuiToolNavigation.ToolPanelSnapshot[] {
    const snapshots: NwrGuiToolNavigation.ToolPanelSnapshot[] = [];
    document.querySelectorAll<HTMLElement>("[data-tool-panel]").forEach((panel) => {
      const snapshot = toolPanelSnapshot(panel);
      applyToolPanelAuditPolicy(panel, snapshot);
      if (NwrGuiFeatureAudit.panelIsVisible(snapshot)) snapshots.push(snapshot);
    });
    return snapshots;
  }

  function sectionsForTab(tab: string): NwrGuiToolNavigation.ToolSection[] {
    return NwrGuiToolNavigation.sectionsForTab(toolPanelSnapshots(), tab);
  }

  function ensureActiveToolSection(tab: string): string {
    const sections = sectionsForTab(tab);
    return NwrGuiToolNavigation.ensureActiveSection(tab, sections, activeToolSections);
  }

  function updateToolSectionNav(tab: string): void {
    const sections = sectionsForTab(tab);
    const active = ensureActiveToolSection(tab);
    dom.toolSectionNav.hidden = sections.length <= 1;
    dom.toolSectionNav.innerHTML = NwrGuiToolNavigation.navigationHtml(sections, active);
  }

  function panelMatchesActiveSection(panel: HTMLElement): boolean {
    const snapshot = toolPanelSnapshot(panel);
    applyToolPanelAuditPolicy(panel, snapshot);
    if (!NwrGuiFeatureAudit.panelIsVisible(snapshot)) return false;
    const section = ensureActiveToolSection(activeToolTab);
    return NwrGuiToolNavigation.panelMatchesActiveSection(
      snapshot,
      activeToolTab,
      section,
      ""
    );
  }

  function updateVisiblePanels() {
    ensureActiveToolSection(activeToolTab);
    document.querySelectorAll<HTMLElement>("[data-tool-panel]").forEach((panel) => {
      panel.hidden = !panelMatchesActiveSection(panel);
    });
    updateToolSectionNav(activeToolTab);
  }

  function activateToolSection(section, options: ToolSectionOptions = {}) {
    const sections = sectionsForTab(activeToolTab);
    if (!sections.some((item) => item.section === section)) return;
    activeToolSections[activeToolTab] = section;
    updateVisiblePanels();
    if (!options.keepScroll) scrollActiveToolAreaToTop();
    requestAnimationFrame(renderActiveCatalogs);
  }

  function activateAdjacentToolSection(direction = 1) {
    const sections = sectionsForTab(activeToolTab);
    if (!sections.length) return;
    const active = ensureActiveToolSection(activeToolTab);
    const next = NwrGuiToolNavigation.nextSection(sections, active, direction);
    if (next) activateToolSection(next, { keepScroll: true });
  }

  function updateCatalogToolState(target) {
    const tools = target.__catalogTools;
    if (!tools) return;
    const collapsed = target.classList.contains("catalog-list-collapsed");
    const expanded = target.classList.contains("catalog-list-expanded");
    const view = catalogViews.get(target.id);
    const state = NwrGuiCatalogUi.catalogToolState(view, collapsed, expanded);
    NwrGuiCatalogUi.applyCatalogToolState(NwrGuiCatalogUi.catalogToolElements(tools), state);
  }

  function updateCatalogToolLabels(target) {
    updateCatalogToolState(target);
  }

  function updateCatalogLimitTools(target) {
    updateCatalogToolState(target);
  }

  function changeCatalogPage(target, action) {
    const view = catalogViews.get(target.id);
    if (!view) return;
    if (!NwrGuiCatalogUi.changeCatalogPage(catalogPager, view, action)) return;
    target.scrollTop = 0;
    if (catalogRenderers[target.id]) catalogRenderers[target.id]();
  }

  function revealCatalog(target) {
    if (!target.classList.contains("catalog-list-collapsed")) return;
    target.classList.remove("catalog-list-collapsed");
    updateCatalogToolLabels(target);
    requestAnimationFrame(() => renderVirtualCatalog(target));
  }

  function toggleCatalogCollapsed(target) {
    const collapsed = target.classList.toggle("catalog-list-collapsed");
    if (collapsed) target.classList.remove("catalog-list-expanded");
    updateCatalogToolLabels(target);
    if (!collapsed) requestAnimationFrame(() => renderVirtualCatalog(target));
  }

  function toggleCatalogExpanded(target) {
    target.classList.remove("catalog-list-collapsed");
    target.classList.toggle("catalog-list-expanded");
    updateCatalogToolLabels(target);
    requestAnimationFrame(() => renderVirtualCatalog(target));
  }

  function setupCatalogTools() {
    CATALOG_LIST_IDS.forEach((id) => {
      const target = $(id);
      if (!target || target.__catalogTools) return;
      const tools = document.createElement("div");
      tools.className = "catalog-tools";
      tools.innerHTML = NwrGuiCatalogUi.catalogToolsHtml();
      target.parentNode.insertBefore(tools, target);
      target.__catalogTools = tools;
      tools.addEventListener("click", (event) => {
        const button = (event.target as HTMLElement).closest("[data-catalog-tool]") as HTMLElement;
        if (!button) return;
        const action = button.dataset.catalogTool;
        if (action === "collapse") toggleCatalogCollapsed(target);
        else if (action === "expand") toggleCatalogExpanded(target);
        else if (action === "first" || action === "prev" || action === "next" || action === "last") changeCatalogPage(target, action);
        else if (action === "next-section") activateAdjacentToolSection(1);
      });
      updateCatalogToolLabels(target);
    });
  }

  function updateViewportMode() {
    const pageScrollMode = NwrGuiToolNavigation.pageScrollMode(window.innerWidth, window.innerHeight);
    document.body.classList.toggle("page-scroll-mode", pageScrollMode);
    return pageScrollMode;
  }

  function rerenderAfterViewportChange() {
    updateViewportMode();
    renderCatalogs();
  }

  function bindViewportResize() {
    const handleResize = debounce(() => requestAnimationFrame(rerenderAfterViewportChange), 80);
    window.addEventListener("resize", handleResize);
    const visualViewport = window.visualViewport;
    if (visualViewport) visualViewport.addEventListener("resize", handleResize);
    updateViewportMode();
  }

  function scrollActiveToolAreaToTop() {
    const grid = document.querySelector<HTMLElement>(".tool-grid");
    if (grid) grid.scrollTop = 0;
    const scroller = document.scrollingElement;
    if (scroller) scroller.scrollTo({ top: 0, behavior: "auto" });
  }

  function resetRestoredPageScroll() {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    scrollActiveToolAreaToTop();
    window.setTimeout(scrollActiveToolAreaToTop, 0);
    window.setTimeout(scrollActiveToolAreaToTop, 250);
  }

  function sendCommand(command: NwrGuiBridgeIO.BridgeCommand, _controlId = "", options: SendCommandOptions = {}) {
    const payload = NwrGuiBridgeIO.sendCommand(fs, bridgePaths, command);
    if (!options.silent) showToast(`已发送：${payload.type}`);
    return payload;
  }

  function preparedGameReady(): boolean {
    return fs.existsSync(preparedGameLauncherPath);
  }

  function refreshPreparedGameControls(): void {
    const ready = preparedGameReady();
    dom.openPreparedGameBtn.disabled = !ready;
    dom.openPreparedGameBtn.title = ready
      ? preparedGameLauncherPath
      : "先点击“准备桥接”生成手动 bridge 游戏";
    dom.preparedGameState.textContent = ready ? "已准备" : "未准备";
    dom.preparedGameState.title = ready ? preparedGameLauncherPath : preparedGameDir;
  }

  function launchGame() {
    if (!fs.existsSync(launchRuntimeScript)) {
      showToast("找不到运行时启动脚本");
      return;
    }
    try {
      const route = NwrGuiRuntimeRoutes.diagnosticModel(selectedRuntimeRoute);
      const args = NwrGuiRuntimeRoutes.launchArguments([
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        launchRuntimeScript,
        "-GameRoot",
        rootDir
      ], selectedRuntimeRoute);
      gameProcess = childProcess.spawn("powershell.exe", args, {
        cwd: projectRoot,
        env: {
          ...process.env,
          DQ2_MODKIT_ROOT: projectRoot,
          DQ2_GAME_ROOT: rootDir
        },
        stdio: "ignore"
      });
      dom.launchBtn.disabled = true;
      showToast(`正在准备：${route.label}`);
      gameProcess.on("error", (error) => {
        dom.launchBtn.disabled = false;
        const message = error instanceof Error ? error.message : String(error);
        showToast(`准备失败：${message}`);
      });
      gameProcess.on("exit", (code, signal) => {
        dom.launchBtn.disabled = false;
        refreshPreparedGameControls();
        refresh();
        if (code === 0) {
          showToast("桥接已准备，点击“打开游戏”");
          return;
        }
        showToast(`准备失败：${signal || `exit ${code == null ? "unknown" : code}`}`);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(`启动失败：${message}`);
    }
  }

  function openPreparedGame(): void {
    if (!preparedGameReady()) {
      refreshPreparedGameControls();
      showToast("请先点击“准备桥接”");
      return;
    }
    try {
      const processHandle = childProcess.spawn("cmd.exe", ["/c", preparedGameLauncherPath], {
        cwd: preparedGameDir,
        detached: true,
        stdio: "ignore"
      });
      processHandle.unref();
      gameProcess = processHandle;
      showToast("已打开准备好的游戏");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(`打开游戏失败：${message}`);
    }
  }

  function openFolder(folder) {
    try {
      fs.mkdirSync(folder, { recursive: true });
      nw.Shell.openItem(folder);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(message);
    }
  }

  function copyDirectory(source, target) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const src = path.join(source, entry.name);
      const dst = path.join(target, entry.name);
      if (entry.isDirectory()) copyDirectory(src, dst);
      else fs.copyFileSync(src, dst);
    }
  }

  function backupSaves() {
    if (!fs.existsSync(saveDir)) {
      showToast("没有找到存档目录");
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(projectRoot, "output", "backup", "save", stamp);
    copyDirectory(saveDir, target);
    showToast("存档已备份");
    openFolder(target);
  }

  function clearEvents() {
    NwrGuiBridgeIO.clearEvents(fs, bridgePaths);
    lastEventSize = 0;
    renderEvents([]);
    showToast("事件已清空");
  }

  function sendOptions(options, controlId = "ratesApplyBtn") {
    sendCommand(NwrGuiBridgeCommands.trainerOptionsSet(options), controlId);
  }

  function sendDiagnosticCommand(id: string): void {
    const definition = NwrGuiDiagnostics.diagnosticById(id);
    if (!definition) {
      showToast("未知诊断命令");
      return;
    }
    const payload = sendCommand(NwrGuiDiagnostics.commandForDiagnostic(definition.id));
    if (!payload) return;
    dom.diagnosticState.textContent = `${definition.label} -> ${payload.commandId}`;
  }

  function selectItem(kind, id, keepChooser = false) {
    selectedItemKind = kind;
    if (!keepChooser) $("itemKind").value = kind;
    const chooserKind = $("itemKind").value;
    $("itemId").setAttribute("list", `${chooserKind}Options`);
    $("itemId").value = chooserKind === "all" ? `${kind}:${id}` : String(id);
    updateLookupHints();
    renderItemList();
  }

  function selectActor(id) {
    $("actorId").value = String(id);
    $("skillActorId").value = String(id);
    const actorName = NwrGuiCatalog.catalogName(catalogs, "actor", Number(id));
    if (actorName) $("actorName").value = actorName;
    updateLookupHints();
    renderActorList();
  }

  function selectSkill(id) {
    $("skillId").value = String(id);
    updateLookupHints();
    renderSkillList();
  }

  function selectVariable(id) {
    $("variableId").value = String(id);
    updateLookupHints();
    renderVariableList();
  }

  function selectSwitch(id, value = switchValue) {
    $("switchId").value = String(id);
    if (value !== undefined) {
      switchValue = !!value;
      $("switchOnBtn").classList.toggle("active", switchValue);
      $("switchOffBtn").classList.toggle("active", !switchValue);
    }
    updateLookupHints();
    renderSwitchList();
  }

  function selectMap(id) {
    $("mapId").value = String(id);
    updateLookupHints();
    renderMapList();
  }

  function selectCommonEvent(id) {
    $("commonEventId").value = String(id);
    updateLookupHints();
    renderCommonEventList();
  }

  function addItem(kind, id) {
    selectItem(kind, id, $("itemKind").value === "all");
    sendCommand(NwrGuiBridgeCommands.itemAdd(kind, Number(id), numberValue("itemAmount", 1)), "itemAddBtn");
  }

  function unlockActor(id) {
    selectActor(id);
    sendCommand(NwrGuiBridgeCommands.actorUnlock(Number(id)), "actorUnlockBtn");
  }

  function setActorName(id) {
    const name = String($("actorName").value || "").trim();
    if (!name) {
      showToast("请输入角色名称");
      return;
    }
    sendCommand(NwrGuiBridgeCommands.actorNameSet(Number(id), name), "actorNameBtn");
  }

  function learnSkill(id) {
    selectSkill(id);
    sendCommand(NwrGuiBridgeCommands.actorSkillLearn(skillActorId(), Number(id)), "skillLearnBtn");
  }

  function forgetSkill(id) {
    selectSkill(id);
    sendCommand(NwrGuiBridgeCommands.actorSkillForget(skillActorId(), Number(id)), "skillForgetBtn");
  }

  function setVariable(id) {
    selectVariable(id);
    sendCommand(NwrGuiBridgeCommands.variableSet(Number(id), parseValue($("variableValue").value)), "variableSetBtn");
  }

  function setSwitch(id, value) {
    selectSwitch(id, value);
    sendCommand(NwrGuiBridgeCommands.switchSet(Number(id), !!value), "switchSetBtn");
  }

  function transferMap(id, controlId = "mapTransferBtn") {
    selectMap(id);
    sendCommand(NwrGuiBridgeCommands.mapTransfer(
      Number(id),
      numberValue("mapX", 10),
      numberValue("mapY", 10),
      numberValue("mapDirection", 2),
      numberValue("mapFade", 0)
    ), controlId);
  }

  function runCommonEvent(id) {
    selectCommonEvent(id);
    sendCommand(NwrGuiBridgeCommands.commonEventRun(Number(id)), "commonEventRunBtn");
  }

  function handleCatalogClick(event) {
    const actionButton = event.target.closest("[data-catalog-action]");
    const row = event.target.closest(".catalog-row");
    if (!row) return;
    const id = Number(row.dataset.id);
    const kind = row.dataset.kind;

    if (!actionButton) {
      if (kind === "item" || kind === "weapon" || kind === "armor") selectItem(kind, id, $("itemKind").value === "all");
      else if (kind === "skill") selectSkill(id);
      else if (kind === "actor") selectActor(id);
      else if (kind === "variable") selectVariable(id);
      else if (kind === "switch") selectSwitch(id);
      else if (kind === "map") selectMap(id);
      else if (kind === "commonEvent") selectCommonEvent(id);
      return;
    }

    const action = actionButton.dataset.catalogAction;
    if (action === "item-add") addItem(kind, id);
    else if (action === "skill-learn") learnSkill(id);
    else if (action === "skill-forget") forgetSkill(id);
    else if (action === "actor-unlock") unlockActor(id);
    else if (action === "actor-select") selectActor(id);
    else if (action === "variable-select") selectVariable(id);
    else if (action === "variable-set") setVariable(id);
    else if (action === "switch-on") setSwitch(id, true);
    else if (action === "switch-off") setSwitch(id, false);
    else if (action === "map-transfer") transferMap(id);
    else if (action === "common-event-run") runCommonEvent(id);
  }

  function applyRuntimeState(state) {
    latestState = state;
    maybeRequestRuntimeIconExport(state);
    const view = NwrGuiRuntimeState.renderState(state, { expectedBridgeVersion: EXPECTED_BRIDGE_VERSION });
    applyRuntimeStatus(view.status);
    dom.bridgeState.textContent = view.bridgeText;
    dom.partyState.textContent = view.partyState;
    dom.goldState.textContent = formatNumber(view.goldState);
    dom.goldMetric.textContent = formatNumber(view.goldMetric);
    dom.saveState.textContent = view.saveState;
    dom.mapState.textContent = view.mapState;
    dom.saveFiles.innerHTML = saveFilesHtml(view.saveFiles, view.hasState);
    dom.partyMembers.innerHTML = partyMembersHtml(view.partyMembers, view.hasState);
    NwrGuiPrisonGuards.applyPanel({
      summary: dom.prisonGuardSummary,
      metrics: dom.prisonGuardMetrics,
      list: dom.prisonGuardList,
      repairButton: dom.prisonRepairBtn
    }, NwrGuiPrisonGuards.reportFromState(state), view.fresh && view.versionOk && view.hasParty);
    refreshPreparedGameControls();
    if (!view.hasState) {
      dom.battleState.textContent = "";
      return;
    }

    const options = view.fresh ? (state.trainerOptions || {}) : {};
    if (view.fresh) updateOptionInputs(options);
    updateBattleButtons(options, view.fresh && state.hooksPatched, view.fresh ? state.rateStats : null, view.fresh ? state.battleStats : null);
  }

  function updateOptionInputs(options) {
    [["expRate", options.expRate], ["goldRate", options.goldRate], ["dropRate", options.dropRate]].forEach(([id, value]) => {
      const input = $(id);
      if (document.activeElement !== input && value != null) input.value = value;
    });
  }

  function updateBattleButtons(options, hooksPatched, rateStats, battleStats) {
    $("noCostBtn").classList.toggle("active", !!options.noSkillCost);
    $("oneHitKillBtn").classList.toggle("active", !!options.oneHitKill);
    $("invincibleBtn").classList.toggle("active", !!options.invincible);
    const noCost = options.noSkillCost ? "无耗ON" : "无耗OFF";
    const oneHit = options.oneHitKill ? "秒杀ON" : "秒杀OFF";
    const invincible = options.invincible ? "无敌ON" : "无敌OFF";
    const last = rateStats && rateStats.last
      ? `倍率命中 ${rateStats.last.name}`
      : "倍率未命中";
    const battle = battleStats && battleStats.last
      ? `战斗命令 ${battleStats.last.name}`
      : "等待战斗命中";
    dom.battleState.textContent = `${noCost} / ${oneHit} / ${invincible} / hooks ${hooksPatched ? "OK" : "--"} / ${last} / ${battle}`;
  }

  function renderEvents(events) {
    dom.eventList.innerHTML = NwrGuiRuntimeEvents.eventListHtml(events);
  }

  function bridgeEventRecord(value: unknown): BridgeEventRecord | null {
    return value && typeof value === "object" && !Array.isArray(value) ? value as BridgeEventRecord : null;
  }

  function processRuntimeIconEvents(events: readonly unknown[]): void {
    for (const value of events.slice().reverse()) {
      const event = bridgeEventRecord(value);
      if (!event || event.type !== "asset.iconSet.export") continue;
      if (event.ok === false) {
        iconExportRequested = false;
        return;
      }
      const payload = bridgeEventRecord(event.payload);
      if (payload && payload.scheduled === true) {
        iconExportRequested = true;
        return;
      }
      iconExportRequested = false;
      if (!iconExportCompleted) {
        iconExportCompleted = true;
        iconCache.clear();
        setupIconSet();
      }
      return;
    }
  }

  function maybeRequestRuntimeIconExport(state: RuntimeStateRecord | null): void {
    if (iconExportCompleted || iconExportRequested || exportedIconSetReady() || iconSetImage) return;
    if (!state || state.hasDataManager !== true) return;
    const now = Date.now();
    if (now - iconExportLastAttemptMs < ICON_EXPORT_RETRY_MS) return;
    iconExportRequested = true;
    iconExportLastAttemptMs = now;
    sendCommand({ type: "asset.iconSet.export" }, "runtimeIconExport", { silent: true });
  }

  function refresh() {
    const state = readJson(bridgePaths.statePath);
    applyRuntimeState(state);

    try {
      const size = NwrGuiBridgeIO.eventSize(fs, bridgePaths);
      if (size !== lastEventSize) {
        lastEventSize = size;
        const events = NwrGuiBridgeIO.readEvents(fs, bridgePaths);
        renderEvents(events);
        processRuntimeIconEvents(events);
      }
    } catch {
      renderEvents([]);
    }
  }

  function activateTab(tab, options: ToolSectionOptions = {}) {
    activeToolTab = tab || "core";
    document.querySelectorAll<HTMLElement>("[data-tool-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.toolTab === activeToolTab);
    });
    ensureActiveToolSection(activeToolTab);
    updateVisiblePanels();
    requestAnimationFrame(() => {
      if (!options.keepScroll) scrollActiveToolAreaToTop();
      renderActiveCatalogs();
    });
  }

  function recordCurrentPosition() {
    const map = latestState && latestState.currentMap;
    if (!map || !map.mapId) {
      showToast("还没有读取到当前位置");
      return;
    }
    recordedPosition = {
      mapId: Number(map.mapId),
      x: Number(map.x || 0),
      y: Number(map.y || 0),
      direction: Number(map.direction || 2),
      fade: 0
    };
    $("recordedPosition").textContent = `${recordedPosition.mapId} (${recordedPosition.x}, ${recordedPosition.y})`;
    showToast("已记录当前位置");
  }

  function returnRecordedPosition() {
    if (!recordedPosition) {
      showToast("还没有记录位置");
      return;
    }
    $("mapId").value = String(recordedPosition.mapId);
    $("mapX").value = String(recordedPosition.x);
    $("mapY").value = String(recordedPosition.y);
    $("mapDirection").value = String(recordedPosition.direction);
    $("mapFade").value = String(recordedPosition.fade);
    updateLookupHints();
    transferMap(recordedPosition.mapId, "returnPositionBtn");
  }

  function bind() {
    document.querySelectorAll<HTMLElement>("[data-tool-tab]").forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.toolTab, { keepScroll: true }));
    });
    dom.toolSectionNav.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest("[data-tool-section-jump]") as HTMLElement;
      if (!button) return;
      activateToolSection(button.dataset.toolSectionJump || "", { keepScroll: true });
    });
    dom.launchBtn.addEventListener("click", launchGame);
    dom.openPreparedGameBtn.addEventListener("click", openPreparedGame);
    dom.refreshBtn.addEventListener("click", refresh);
    dom.openDiagnosticsBtn.addEventListener("click", () => activateTab("debug"));
    dom.itemList.addEventListener("click", handleCatalogClick);
    dom.skillList.addEventListener("click", handleCatalogClick);
    dom.actorList.addEventListener("click", handleCatalogClick);
    dom.variableList.addEventListener("click", handleCatalogClick);
    dom.switchList.addEventListener("click", handleCatalogClick);
    dom.mapList.addEventListener("click", handleCatalogClick);
    dom.commonEventList.addEventListener("click", handleCatalogClick);
    bindVirtualScroll(dom.itemList);
    bindVirtualScroll(dom.skillList);
    bindVirtualScroll(dom.actorList);
    bindVirtualScroll(dom.variableList);
    bindVirtualScroll(dom.switchList);
    bindVirtualScroll(dom.mapList);
    bindVirtualScroll(dom.commonEventList);
    setupCatalogTools();
    bindViewportResize();

    $("goldSetBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.goldSet(Number($("goldValue").value || 0)), "goldSetBtn"));
    $("goldAddBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.goldAdd(Number($("goldValue").value || 0)), "goldAddBtn"));
    document.querySelectorAll<HTMLElement>("[data-gold-add]").forEach((button) => {
      button.addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.goldAdd(Number(button.dataset.goldAdd)), "selector:data-gold-add"));
    });
    document.querySelectorAll<HTMLElement>("[data-gold-set]").forEach((button) => {
      button.addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.goldSet(Number(button.dataset.goldSet)), "selector:data-gold-set"));
    });

    $("variableSetBtn").addEventListener("click", () => setVariable(numberValue("variableId", 0)));

    $("switchOnBtn").addEventListener("click", () => {
      switchValue = true;
      $("switchOnBtn").classList.add("active");
      $("switchOffBtn").classList.remove("active");
    });
    $("switchOffBtn").addEventListener("click", () => {
      switchValue = false;
      $("switchOffBtn").classList.add("active");
      $("switchOnBtn").classList.remove("active");
    });
    $("switchSetBtn").addEventListener("click", () => setSwitch(numberValue("switchId", 0), switchValue));

    $("itemAddBtn").addEventListener("click", () => {
      const selection = parseItemSelection();
      sendCommand(NwrGuiBridgeCommands.itemAdd(selection.kind, selection.id, numberValue("itemAmount", 1)), "itemAddBtn");
    });

    $("actorUnlockBtn").addEventListener("click", () => unlockActor(activeActorId()));
    $("actorAddBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorAdd(activeActorId()), "actorAddBtn"));
    $("actorRemoveBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorRemove(activeActorId()), "actorRemoveBtn"));
    $("actorRecoverBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorRecover(activeActorId()), "actorRecoverBtn"));
    $("actorNameBtn").addEventListener("click", () => setActorName(activeActorId()));
    $("actorLevelBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorLevelSet(activeActorId(), numberValue("actorLevel", 1)), "actorLevelBtn"));
    $("actorExpBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorExpAdd(activeActorId(), numberValue("actorExp", 0)), "actorExpBtn"));
    $("actorVitalsBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorVitalsSet(
      activeActorId(),
      optionalNumber("actorHp"),
      optionalNumber("actorMp"),
      optionalNumber("actorTp")
    ), "actorVitalsBtn"));
    $("actorParamBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorParamAdd(
      activeActorId(),
      numberValue("paramId", 0),
      numberValue("paramValue", 0)
    ), "actorParamBtn"));
    $("actorSpBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorJpAdd(
      activeActorId(),
      numberValue("actorSpValue", 0),
      actorPointClassId()
    ), "actorSpBtn"));
    $("actorAllocationPointsBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorAllocationPointsAdd(
      activeActorId(),
      numberValue("actorAllocationPointValue", 0),
      actorPointClassId()
    ), "actorAllocationPointsBtn"));

    $("skillLearnBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorSkillLearn(skillActorId(), numberValue("skillId", 0)), "skillLearnBtn"));
    $("skillForgetBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorSkillForget(skillActorId(), numberValue("skillId", 0)), "skillForgetBtn"));
    $("ratesApplyBtn").addEventListener("click", () => sendOptions({
      expRate: numberValue("expRate", 1),
      goldRate: numberValue("goldRate", 1),
      dropRate: numberValue("dropRate", 1)
    }, "ratesApplyBtn"));
    document.querySelectorAll<HTMLElement>("[data-rate]").forEach((button) => {
      button.addEventListener("click", () => {
        const rate = Number(button.dataset.rate || 1);
        $("expRate").value = String(rate);
        $("goldRate").value = String(rate);
        $("dropRate").value = String(rate);
        sendOptions({ expRate: rate, goldRate: rate, dropRate: rate }, "selector:data-rate");
      });
    });

    $("noCostBtn").addEventListener("click", () => sendOptions({ noSkillCost: !$("noCostBtn").classList.contains("active") }, "noCostBtn"));
    $("oneHitKillBtn").addEventListener("click", () => sendOptions({ oneHitKill: !$("oneHitKillBtn").classList.contains("active") }, "oneHitKillBtn"));
    $("invincibleBtn").addEventListener("click", () => sendOptions({ invincible: !$("invincibleBtn").classList.contains("active") }, "invincibleBtn"));
    $("battleKillBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.battleKillEnemies(), "battleKillBtn"));
    $("battleEscapeBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.battleEscape(), "battleEscapeBtn"));
    $("partyRecoverBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.partyRecover(), "partyRecoverBtn"));
    dom.prisonRepairBtn.addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.prisonRepair(), "prisonRepairBtn"));
    $("mapTransferBtn").addEventListener("click", () => transferMap(numberValue("mapId", 0)));
    $("recordPositionBtn").addEventListener("click", recordCurrentPosition);
    $("returnPositionBtn").addEventListener("click", returnRecordedPosition);
    $("commonEventRunBtn").addEventListener("click", () => runCommonEvent(numberValue("commonEventId", 0)));

    $("saveGameBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.save(Number($("saveSlot").value || 1)), "saveGameBtn"));
    $("titleRefreshBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.titleRefresh(), "titleRefreshBtn"));

    document.querySelectorAll<HTMLElement>("[data-diagnostic-command]").forEach((button) => {
      button.addEventListener("click", () => sendDiagnosticCommand(button.dataset.diagnosticCommand || ""));
    });

    $("customSendBtn").addEventListener("click", () => {
      try {
        const command = JSON.parse($("customCommand").value);
        sendCommand(command, "customSendBtn");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showToast(`JSON 错误：${message}`);
      }
    });

    $("openBridgeBtn").addEventListener("click", () => openFolder(bridgePaths.bridgeDir));
    $("openSaveBtn").addEventListener("click", () => openFolder(saveDir));
    $("backupSaveBtn").addEventListener("click", backupSaves);
    $("clearEventsBtn").addEventListener("click", clearEvents);
  }

  setupCatalogs();
  setupRuntimeRoutes();
  bind();
  activateTab(activeToolTab);
  resetRestoredPageScroll();
  refreshPreparedGameControls();
  refresh();
  setInterval(refresh, 700);
  loadCatalogAssetsAfterFirstPaint();
})();
