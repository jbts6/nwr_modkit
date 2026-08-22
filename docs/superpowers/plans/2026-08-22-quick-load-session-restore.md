# 快速读档与会话恢复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 游戏内 F8 一键读回存档槽位 1（与 `~` 快速存档配对），GUI 检测到新 bridge 会话时自动重发上次修改器配置。

**架构：** 复用 `trainer.options.set`、`bridge.options` 与 `state.json` 轮询。bridge 新增 `quickLoad` 热键/守卫/状态和 `bridgeStartedAt` 会话标识，浮窗改为默认关闭且显隐键迁至 F6；GUI 用 `localStorage` 快照配置并在会话变化时自动重发。

**技术栈：** JavaScript 运行时 bridge、TypeScript/NW.js GUI、HTML/CSS、Node 静态合同测试。

## 全局约束

- 设计权威：`docs/superpowers/specs/2026-08-22-quick-load-session-restore-design.md`。
- 快速读档固定槽位 1，热键 F8（capture 阶段，忽略 Ctrl/Alt/Meta/repeat 与可编辑控件聚焦），冷却 800ms，`inFlight` 防重入。
- 读档守卫与快存一致（地图场景、无事件、无传送、窗口聚焦），但不要求 `isSaveEnabled`，要求槽位 1 文件存在；失败必须安全失败，不破坏当前游戏状态。
- 浮窗默认不安装（`bridgeConfig.overlay === true` 才安装），显隐键从 F8 迁移到 F6。
- 会话恢复只存 GUI 本机 `localStorage`（键 `nwr.trainer.session`），恢复范围是全部 trainer 选项，每会话只恢复一次，不静默（事件流可见）。
- 复用 `trainer.options.set`，不新增命令类型，不改变 bridge 文件队列协议。
- 倍速输入边沿屏蔽（`installGameSpeedInputGuards`）等既有行为不得回退。
- bridge/GUI 协议版本由 `0.2.34` 升至 `0.2.35`，旧注入 GUI 显示"需重启"。
- 只修改 `nwr_modkit` authored 源码、`app/gui/app.js` 构建产物、合同测试和文档；不写游戏根目录、`www/**`、存档、`output/`。
- 保留用户现有未提交改动 `tools/launch-gui.bat` 与攻略文档，不纳入本功能提交。

## 文件职责

- `runtime/bridge/page-bridge.js`：quickLoad 选项/状态/热键/守卫/执行、`bridgeStartedAt` 回写、浮窗默认关与 F6、版本 `0.2.35`。
- `app/gui/tests/quick-load-session-contract.mjs`：运行时与 GUI 的纯 Node 静态合同。
- `app/gui/package.json`：登记 `test:quick-session`。
- `app/gui/app.ts` / `app/gui/index.html` / `app/gui/styles.css`：快捷读档按钮与状态行、会话恢复勾选框与快照重发。
- `app/gui/src/command-guardrails.ts`：登记 `quickLoadBtn`。
- `app/gui/protocol-metadata.json`、`app/gui/tests/runtime-state-contract.mjs`、`tools/launch-bg-bridge-runtime.ps1`：版本同步 `0.2.35`。
- `app/gui/app.js`：由 `npm.cmd run build` 生成。
- `README.md`、`docs/工具使用说明.md`、`docs/技术实现文档.md`：用法、状态字段与边界说明。

---

### 任务 1：运行时快速读档、会话标识与浮窗键位

**文件：**
- 创建：`app/gui/tests/quick-load-session-contract.mjs`
- 修改：`app/gui/package.json`
- 修改：`runtime/bridge/page-bridge.js`

**接口：**
- 输入：`trainer.options.set({ quickLoadEnabled: boolean })` 与 document capture 阶段的 `F8`。
- 输出：`trainerOptions.quickLoadEnabled`、`quickLoad: { enabled, key, slotId, inFlight, lastAttemptAt, lastSuccessAt, lastResult, lastMessage }`、`bridgeStartedAt`（毫秒时间戳）。

- [ ] **步骤 1：写入只覆盖运行时的失败合同**

在 `app/gui/tests/quick-load-session-contract.mjs` 写入：

```js
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
```

同时在 `app/gui/package.json` 的 `scripts` 中登记：

```json
"test:quick-session": "node tests/quick-load-session-contract.mjs"
```

- [ ] **步骤 2：运行合同并确认按预期失败**

运行：`npm.cmd run test:quick-session`

预期：失败于缺少 `quickLoadBlockReason` 或 `test:quick-session`，而不是语法/路径错误。

- [ ] **步骤 3：实现运行时快速读档、会话标识与浮窗键位**

在 `runtime/bridge/page-bridge.js` 中：

(a) 版本与选项：`version: "0.2.34"` 改为 `version: "0.2.35"`；`bridge.options` 中 `quickSaveEnabled: true,` 之后加一行：

```js
      quickLoadEnabled: true,
```

(b) 状态对象：`bridge.quickSave` 定义块之后加：

```js
    quickLoad: {
      enabled: true,
      key: "F8",
      slotId: 1,
      inFlight: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastResult: "idle",
      lastMessage: null
    },
```

并在 `quickSaveLastTriggerAt: 0,` 之后加一行：

```js
    quickLoadLastTriggerAt: 0,
```

(c) 在 `installQuickSaveHotkey` 函数之后加入三个完整函数（守卫复用快存的场景检查，但要求槽位存在、不要求允许存档；执行兼容同步/Promise）：

```js
  function quickLoadBlockReason() {
    if (bridge.quickLoad.inFlight) return "快速读档正在进行";
    if (!fs.existsSync(saveFilePath(1))) return "存档槽位 1 不存在";
    const sceneManager = resolveSceneManager();
    const scene = sceneManager && sceneManager._scene;
    if (!isMapScene(scene)) return "当前不在地图探索界面";
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return "游戏窗口未获得焦点";
    if (sceneManager && typeof sceneManager.isSceneChanging === "function" && sceneManager.isSceneChanging()) return "场景正在切换";
    const player = resolvePlayer();
    if (!player) return "玩家尚未初始化";
    if ((typeof player.isTransferring === "function" && player.isTransferring()) || player._transferring) return "地图正在切换";
    const map = resolveMap();
    if (!map) return "地图尚未初始化";
    if (typeof map.isEventRunning === "function" && map.isEventRunning()) return "事件正在执行";
    const interpreter = map._interpreter;
    if (interpreter && typeof interpreter.isRunning === "function" && interpreter.isRunning()) return "事件正在执行";
    const dataManager = resolveDataManager();
    if (!dataManager || typeof dataManager.loadGame !== "function") return "读档接口不可用";
    return "";
  }

  function tryQuickLoad() {
    const now = Date.now();
    bridge.quickLoad.lastAttemptAt = now;
    const blocked = quickLoadBlockReason();
    if (blocked) {
      bridge.quickLoad.lastResult = "blocked";
      bridge.quickLoad.lastMessage = blocked;
      showQuickSaveMessage(blocked, false);
      writeState();
      return { ok: false, result: "blocked", message: blocked };
    }
    bridge.quickLoad.inFlight = true;
    bridge.quickLoad.lastMessage = "快速读档中：槽位 1";
    writeState();
    const fail = error => {
      bridge.lastError = String(error && error.stack || error);
      bridge.quickLoad.inFlight = false;
      bridge.quickLoad.lastResult = "error";
      bridge.quickLoad.lastMessage = "快速读档失败";
      showQuickSaveMessage(bridge.quickLoad.lastMessage, false);
      writeState();
      log("quick load failed", { error: bridge.lastError });
      return { ok: false, result: "error", message: bridge.quickLoad.lastMessage };
    };
    try {
      const dataManager = resolveDataManager();
      const result = dataManager.loadGame(bridge.quickLoad.slotId);
      const complete = value => {
        if (value === false || value === "false" || (value && value.result === false)) throw new Error("loadGame returned false");
        try {
          const system = resolveSaveSystem();
          if (system && typeof system.onAfterLoad === "function") system.onAfterLoad();
        } catch (_) {}
        try {
          const sceneManager = resolveSceneManager();
          const sceneMap = window.Scene_Map || tkValue("SceneMap") || tkValue("Scene_Map");
          if (sceneManager && typeof sceneManager.goto === "function" && sceneMap) sceneManager.goto(sceneMap);
        } catch (_) {}
        bridge.quickLoad.inFlight = false;
        bridge.quickLoad.lastSuccessAt = now;
        bridge.quickLoad.lastResult = "success";
        bridge.quickLoad.lastMessage = "快速读档完成：槽位 1";
        showQuickSaveMessage(bridge.quickLoad.lastMessage, true);
        writeState();
        return { ok: true, result: "success", message: bridge.quickLoad.lastMessage };
      };
      if (result && typeof result.then === "function") {
        return Promise.resolve(result).then(complete).catch(fail);
      }
      return complete(result);
    } catch (error) {
      return fail(error);
    }
  }

  function installQuickLoadHotkey() {
    if (!document || typeof document.addEventListener !== "function" || document.__codexQuickLoadHotkey) return false;
    document.addEventListener("keydown", function (event) {
      const target = event && event.target;
      const tagName = target && String(target.tagName || "").toUpperCase();
      const editable = !!(target && (target.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT"));
      const isF8 = event && event.key === "F8";
      if (!bridge.options.quickLoadEnabled || !isF8 || event.repeat || event.ctrlKey || event.altKey || event.metaKey || editable) return;
      const now = Date.now();
      if (now - bridge.quickLoadLastTriggerAt < 800) return;
      bridge.quickLoadLastTriggerAt = now;
      if (typeof event.preventDefault === "function") event.preventDefault();
      tryQuickLoad();
    }, true);
    Object.defineProperty(document, "__codexQuickLoadHotkey", { value: true, configurable: true });
    return true;
  }
```

(d) `setTrainerOptions` 中，`quickSaveEnabled` 处理块之后加：

```js
    if (Object.prototype.hasOwnProperty.call(options, "quickLoadEnabled")) {
      bridge.options.quickLoadEnabled = toBool(options.quickLoadEnabled);
      bridge.quickLoad.enabled = bridge.options.quickLoadEnabled;
    }
```

(e) `collectState` 返回对象中，`bridgeVersion: bridge.version,` 之后加：

```js
      bridgeStartedAt: bridge.startedAtMs,
```

`quickSave: { ...bridge.quickSave },` 之后加：

```js
      quickLoad: { ...bridge.quickLoad },
```

(f) 浮窗：启动处 `if (bridgeConfig.overlay !== false) {` 改为 `if (bridgeConfig.overlay === true) {`；`installInGameOverlay` 内浮窗键位 `if (event.key === "F8")` 改为 `if (event.key === "F6")`。

(g) 启动：`installQuickSaveHotkey();` 之后加一行 `installQuickLoadHotkey();`。

- [ ] **步骤 4：运行运行时合同并确认通过**

运行：`npm.cmd run test:quick-session && node --check ../../runtime/bridge/page-bridge.js`

预期：`quick load runtime contract OK`，语法检查通过。另跑 `npm.cmd run test:game-speed` 确认倍速合同未回退。

- [ ] **步骤 5：提交运行时阶段**

```powershell
git add -- "app/gui/tests/quick-load-session-contract.mjs" "app/gui/package.json" "runtime/bridge/page-bridge.js"
git commit -m "feat(runtime): add quick load and session id"
```

---

### 任务 2：GUI 快捷读档控件、会话恢复与协议版本

**文件：**
- 修改：`app/gui/tests/quick-load-session-contract.mjs`
- 修改：`app/gui/app.ts`
- 修改：`app/gui/index.html`
- 修改：`app/gui/styles.css`
- 修改：`app/gui/src/command-guardrails.ts`
- 修改：`app/gui/protocol-metadata.json`
- 修改：`app/gui/tests/runtime-state-contract.mjs`
- 修改：`tools/launch-bg-bridge-runtime.ps1`
- 生成：`app/gui/app.js`

**接口：**
- 消费：任务 1 的 `trainerOptions.quickLoadEnabled`、`quickLoad`、`bridgeStartedAt`。
- 产生：`quickLoadBtn`/`quickLoadState`/`sessionRestoreToggle` 控件、`sendOptions({ quickLoadEnabled })`、`localStorage["nwr.trainer.session"]` 快照与自动重发、护栏 `quickLoadBtn`。

- [ ] **步骤 1：扩展 GUI 失败合同**

把任务 1 末尾的 `console.log("quick load runtime contract OK")` 替换为以下 GUI 断言与最终输出：

```js
const appSource = fs.readFileSync(path.join(guiDir, "app.ts"), "utf8");
const indexHtml = fs.readFileSync(path.join(guiDir, "index.html"), "utf8");
const guardrails = fs.readFileSync(path.join(guiDir, "src", "command-guardrails.ts"), "utf8");
const protocol = JSON.parse(fs.readFileSync(path.join(guiDir, "protocol-metadata.json"), "utf8"));

assert(indexHtml.includes('id="quickLoadBtn"') && indexHtml.includes('id="quickLoadState"'), "quick load button and state line must exist");
assert(indexHtml.includes('id="sessionRestoreToggle"'), "session restore toggle must exist");
assert(appSource.includes("sendOptions({ quickLoadEnabled:"), "quick load toggle must reuse trainer.options.set");
assert(appSource.includes('"nwr.trainer.session"'), "session snapshot must persist to localStorage");
assert(appSource.includes('"sessionRestore"'), "GUI must auto-resend options on new bridge sessions");
assert(appSource.includes("bridgeStartedAt"), "GUI must key session detection on bridgeStartedAt");
assert(appSource.includes("state.quickLoad"), "GUI must render quick load state");
assert(guardrails.includes('action("quickLoadBtn"'), "quick load button must be registered in guardrails");
assert(protocol.expectedBridgeVersion === "0.2.35", "GUI protocol metadata must require bridge 0.2.35");

console.log("quick load contract OK");
```

- [ ] **步骤 2：运行合同并确认 GUI 部分失败**

运行：`npm.cmd run test:quick-session`

预期：运行时断言通过，失败于缺少 `quickLoadBtn`。

- [ ] **步骤 3：加入 GUI 控件与状态渲染**

(a) `index.html` 快捷工具面板，按钮行加一个按钮、状态行加两行：

```html
<div class="battle-switches quick-tool-buttons">
  <button id="playerThroughBtn" class="toggle-btn" disabled>穿墙 OFF</button>
  <button id="quickSaveBtn" class="toggle-btn" disabled>快捷存档 ON</button>
  <button id="quickLoadBtn" class="toggle-btn" disabled>快捷读档 ON</button>
</div>
<div id="quickSaveState" class="hint">连接运行时后可用；按 ~ 覆盖槽位 1。</div>
<div id="quickLoadState" class="hint">连接运行时后可用；游戏内按 F8 读回槽位 1。</div>
<label class="hint session-restore-row"><input id="sessionRestoreToggle" type="checkbox" checked /> 重启后自动恢复修改器配置</label>
```

(b) `styles.css` 追加：

```css
.session-restore-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  user-select: none;
}
```

(c) `app.ts`：常量区加 `const SESSION_STORE_KEY = "nwr.trainer.session";`；`dom` 映射加：

```ts
    quickLoadBtn: $("quickLoadBtn"),
    quickLoadState: $("quickLoadState"),
    sessionRestoreToggle: $("sessionRestoreToggle"),
```

`updateQuickTools` 末尾 `updateGameSpeed(...)` 调用之前加：

```ts
    const quickLoadEnabled = options.quickLoadEnabled !== false;
    const quickLoad = state.quickLoad || {};
    dom.quickLoadBtn.disabled = !connected;
    dom.quickLoadBtn.classList.toggle("active", quickLoadEnabled);
    dom.quickLoadBtn.textContent = quickLoadEnabled ? "快捷读档 ON" : "快捷读档 OFF";
    const loadMessage = quickLoad.lastMessage || "游戏内按 F8 读回槽位 1";
    dom.quickLoadState.textContent = connected ? loadMessage : "连接运行时后可用；游戏内按 F8 读回槽位 1";
```

会话恢复函数（放在 `updateGameSpeed` 之后）：

```ts
  function readSessionStore() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_STORE_KEY) || "null");
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }

  function writeSessionStore(value) {
    try {
      localStorage.setItem(SESSION_STORE_KEY, JSON.stringify(value));
    } catch {
      // localStorage 不可用时静默降级为仅会话内记忆
    }
  }

  function updateSessionRestore(state, options) {
    if (!state || !state.bridgeStartedAt || !options) return;
    const startedAt = Number(state.bridgeStartedAt);
    const autoRestore = dom.sessionRestoreToggle.checked;
    const stored = readSessionStore();
    if (autoRestore && stored && stored.options && Number(stored.bridgeStartedAt) !== startedAt) {
      writeSessionStore({ ...stored, bridgeStartedAt: startedAt, autoRestore });
      sendOptions(stored.options, "sessionRestore");
      showToast("已自动恢复上次修改器配置");
      return;
    }
    const next = { options, bridgeStartedAt: startedAt, autoRestore };
    if (!stored || JSON.stringify(stored) !== JSON.stringify(next)) writeSessionStore(next);
  }
```

`applyRuntimeState` 中 `updateQuickTools(options, view.fresh ? state : {}, view.fresh && view.versionOk);` 之后加：

```ts
    updateSessionRestore(view.fresh && view.versionOk ? state : null, options);
```

绑定区（`quickSaveBtn` 绑定之后）加：

```ts
    dom.quickLoadBtn.addEventListener("click", () => {
      sendOptions({ quickLoadEnabled: !dom.quickLoadBtn.classList.contains("active") }, "quickLoadBtn");
    });
    dom.sessionRestoreToggle.addEventListener("change", () => {
      const stored = readSessionStore();
      if (stored && stored.autoRestore !== dom.sessionRestoreToggle.checked) {
        writeSessionStore({ ...stored, autoRestore: dom.sessionRestoreToggle.checked });
      }
    });
    const storedSession = readSessionStore();
    dom.sessionRestoreToggle.checked = storedSession ? storedSession.autoRestore !== false : true;
```

(d) 护栏 `command-guardrails.ts`，`quickSaveBtn` 行之后加：

```ts
    action("quickLoadBtn", "Toggle quick load hotkey", "trainer.options.set", "disable-guard", ["trainer.hooks.info", "ping"], HOOK_EVENTS),
```

(e) 版本同步 `0.2.35`：`app.ts` 的 `EXPECTED_BRIDGE_VERSION`、`protocol-metadata.json` 的 `expectedBridgeVersion`、`tests/runtime-state-contract.mjs` 全量替换 `0.2.34`→`0.2.35`、`tools/launch-bg-bridge-runtime.ps1` 的 `bridgeVersion = "0.2.34"`。

- [ ] **步骤 4：运行合同、状态合同和构建**

```powershell
npm.cmd run test:quick-session
npm.cmd run test:game-speed
npm.cmd run test:state
npm.cmd run test:routes
npm.cmd run test:inventory
npm.cmd run build
```

预期：全部退出码为 0；`app/gui/app.js` 包含 `quickLoadState` 与 `nwr.trainer.session`。

- [ ] **步骤 5：提交 GUI 阶段**

```powershell
git add -- "app/gui/app.ts" "app/gui/app.js" "app/gui/index.html" "app/gui/styles.css" "app/gui/src/command-guardrails.ts" "app/gui/protocol-metadata.json" "app/gui/tests/runtime-state-contract.mjs" "app/gui/tests/quick-load-session-contract.mjs" "tools/launch-bg-bridge-runtime.ps1"
git commit -m "feat(gui): add quick load controls and session restore"
```

---

### 任务 3：文档、阶段性回归与可视验收

**文件：**
- 修改：`README.md`
- 修改：`docs/工具使用说明.md`
- 修改：`docs/技术实现文档.md`

- [ ] **步骤 1：更新用户文档**

在"主角穿墙与快捷存档"相邻位置写明：

```text
快速读档与快速存档配对：游戏内按 F8 直接读回存档槽位 1，GUI 快捷工具提供"快捷读档"开关。仅当地图探索、无事件执行、无地图切换、窗口有焦点且槽位 1 存在时执行；战斗、事件执行和传送中按键会被拦截并显示原因。游戏内浮窗默认不再显示（显隐键迁移到 F6，仅在 bridge 配置 overlay 为 true 时安装）。

会话恢复：GUI 勾选"重启后自动恢复修改器配置"后，检测到游戏/bridge 重启（新会话）会自动重发上次的全部修改器选项（倍率、无耗/秒杀/无敌、穿墙、快存/快读、小黑屋屏蔽、游戏倍速）。配置只保存在本机 GUI（localStorage），不写入游戏目录，恢复动作在事件流中可见。取消勾选可关闭自动恢复。
```

技术文档登记：`trainerOptions.quickLoadEnabled`、`quickLoad` 八个状态字段、`bridgeStartedAt` 会话标识、F8/F6 键位与浮窗默认关闭、读档守卫差异（不要求 `isSaveEnabled`、要求槽位存在）、会话恢复机制与 `0.2.35` 版本要求。

- [ ] **步骤 2：执行阶段性合同回归**

```powershell
npm.cmd run test:quick-session
npm.cmd run test:through-quick-save
npm.cmd run test:protocol
npm.cmd run test:state
npm.cmd run test:inventory
npm.cmd run test:routes
npm.cmd run test:route-selector
npm.cmd run test:prison
npm.cmd run test:topology
npm.cmd run test:commands
npm.cmd run test:bridge-io
npm.cmd run test:catalog
npm.cmd run test:guardrails
npm.cmd run test:game-speed
npm.cmd run build
```

预期：除 `test:guardrails`（依赖仓库外 A1 证据文件的既有限制，仅记录）外全部退出码为 0。

- [ ] **步骤 3：视觉与运行时验收**

检查 GUI：快捷读档按钮在未连接时禁用、连接后显示上次结果；勾选框默认勾选、重启 GUI 后保持。桌面与窄视口下按钮不溢出。

若可启动 bridge 版游戏：验证 F8 读档成功/被拦截两种路径、读档后修改器选项自动恢复、F8 不再切换浮窗、`overlay: true` 时 F6 可切换浮窗。若当前环境不能稳定驱动游戏窗口，在交付中把这些项目明确标为"需真实游戏会话验证"，不得用静态合同代替。

- [ ] **步骤 4：提交文档阶段**

```powershell
git add -- "README.md" "docs/工具使用说明.md" "docs/技术实现文档.md"
git commit -m "docs: document quick load and session restore"
```
