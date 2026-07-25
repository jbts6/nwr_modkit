# Prison Bypass（运行时屏蔽小黑屋）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不修改任何游戏本体文件的前提下，为 bridge 运行时增加 `prisonBypass` 开关，拦截 Switch520 / 禁存档 / Map695 传送，并在开启时自动脱困。

**Architecture:** 将 `prisonBypass` 并入现有 `bridge.options` 与 `trainer.options.set/get`。在 `page-bridge.js` 的 `patchTrainerHooks()` 中增加引擎 API 钩子（`Game_Switches.setValue`、`Game_System.disableSave`、`Game_Player.reserveTransfer`）；开启时调用 `applyPrisonBypassNow()` 清 520、恢复存档、若在 Map695 则传送到 `lastSafeMap`。GUI 小黑屋面板增加切换按钮，展示拦截计数。

**Tech Stack:** NW.js page bridge（纯 JS）、TypeScript GUI（`tsc` 编译到 `app.js`）、现有 `prison-guard-contract.mjs`（vm + 源码标记断言）。

**Spec:** `docs/superpowers/specs/2026-07-25-prison-bypass-design.md`

## Global Constraints

- 遵循 `nwr_modkit/AGENTS.md`、`runtime/AGENTS.md`、`tools/AGENTS.md`。
- **不得修改游戏本体文件**（游戏根 `package.json`、`www/index.html`、`www/js/**`、`www/data/**` 等）；改动会触发完整性检测导致无法启动。
- 只改 `nwr_modkit` 内 authored 源：`runtime/bridge/`、`app/gui/`、`docs/`、合同测试。
- 不静默覆盖 live `www/save`；不回灌 `output/extract` 到 `www/data`。
- 即使 `runtime/game-app/www` 是 junction，也不得经该路径写本体文件；只做进程内 hook。
- 屏蔽仅在 modkit bridge 运行时生效；原版直接启动 `Game.exe` 不带 bypass。
- 不放开存档编辑器硬风险导出；不拦副作用开关 166/781/784/785/1067；不保证拦「终身监禁」对话框。

---

## File Map

| 文件 | 职责 |
| --- | --- |
| `runtime/bridge/page-bridge.js` | 选项、钩子、脱困、`lastSafeMap`、stats、state 暴露 |
| `app/gui/tests/prison-guard-contract.mjs` | 源码标记 + vm 行为合同（TDD 入口） |
| `app/gui/index.html` | 小黑屋面板开关与 metrics 位 |
| `app/gui/src/prison-guard-view.ts` | bypass 状态渲染 |
| `app/gui/src/command-guardrails.ts` | 按钮 guardrail |
| `app/gui/app.ts` | DOM 绑定、toggle、刷新 active |
| `app/gui/app.js` | `npm run build` 生成产物（须一并提交，NW 直接加载） |
| `docs/工具使用说明.md`、`docs/技术实现文档.md`、`README.md` | 使用说明与边界 |

**禁止触碰：** 游戏根任意路径、`www/**` 实体文件、自动 repack 回 `www/data`。

---

### Task 1: 合同测试先红（bypass 标记 + 行为）

**Files:**
- Modify: `app/gui/tests/prison-guard-contract.mjs`
- Test: `app/gui/tests/prison-guard-contract.mjs`

**Interfaces:**
- Consumes: 现有 `assertBridgeRuntimeGuard` / `assertBridgeBehavior` / `assertGuiSurface` / `fakeRuntime`
- Produces: 新断言要求 bridge 暴露 `prisonBypass`、`applyPrisonBypassNow`、`blockedSwitch520`、`lastSafeMap`、`prisonBypassStats`；GUI 暴露 `prisonBypassBtn`；vm 行为：bypass 下 setValue(520,true) 保持 false、reserveTransfer(695) 被拒、开启时从 695 脱困

- [ ] **Step 1: 扩展源码标记断言**

在 `assertBridgeRuntimeGuard` 的 marker 列表中追加：

```javascript
"prisonBypass",
"applyPrisonBypassNow",
"blockedSwitch520",
"blockedDisableSave",
"blockedTransfer695",
"lastSafeMap",
"prisonBypassStats"
```

在 `assertGuiSurface` 的 marker 列表中追加：

```javascript
"id=\"prisonBypassBtn\"",
"屏蔽小黑屋"
```

在 `assertGuiSurface` 中追加：

```javascript
assert(appSource.includes("prisonBypass"), "app.ts must toggle prisonBypass via trainer options");
assert(appSource.includes("prisonBypassBtn"), "app.ts must bind prisonBypassBtn");
```

- [ ] **Step 2: 扩展 `fakeRuntime` 以支持钩子目标**

在 `fakeRuntime` 返回的 `window` 上增加可被 hook 的原型与玩家/系统对象（保持现有 party/variables/switches）：

```javascript
function Game_Switches() {}
Game_Switches.prototype.setValue = function (id, value) {
  this._data[id] = value === true;
};
Game_Switches.prototype.value = function (id) {
  return this._data[id] === true;
};

function Game_System() {
  this._saveEnabled = true;
}
Game_System.prototype.disableSave = function () {
  this._saveEnabled = false;
};
Game_System.prototype.enableSave = function () {
  this._saveEnabled = true;
};
Game_System.prototype.isSaveEnabled = function () {
  return this._saveEnabled !== false;
};

function Game_Player() {
  this._x = 12;
  this._y = 34;
  this._direction = 2;
  this._newMapId = 0;
  this._transferring = false;
}
Game_Player.prototype.reserveTransfer = function (mapId, x, y, d, fade) {
  this._newMapId = mapId;
  this._newX = x;
  this._newY = y;
  this._newDirection = d;
  this._fadeType = fade;
  this._transferring = true;
};

// 在 window 上：
window.Game_Switches = Game_Switches;
window.Game_System = Game_System;
window.Game_Player = Game_Player;
// 将 switches 改为 Game_Switches 实例，保留 _data
const switchObj = new Game_Switches();
switchObj._data = { 520: true };
// party/variables 保持；增加：
window.$gameSystem = new Game_System();
window.$gamePlayer = new Game_Player();
window.$gameMap = {
  mapId() { return window.__fakeMapId == null ? 8 : window.__fakeMapId; }
};
```

说明：现有 `switches` 字面量若仍被 bridge 通过 `$gameSwitches` 使用，应把 `$gameSwitches` 指到带 prototype 的实例，以便 `patchMethod(Game_Switches.prototype, "setValue", ...)` 生效。`resolveSwitches()` 在真实桥里会找到 `$gameSwitches`。

- [ ] **Step 3: 新增 `assertPrisonBypassBehavior(bridgeSource)`**

在 `assertBridgeBehavior` 之后调用，或并入其末尾。核心流程：

```javascript
function assertPrisonBypassBehavior(bridgeSource) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nwr-prison-bypass-"));
  const projectRoot = path.join(root, "nwr_modkit");
  const gameRoot = path.join(root, "game");
  fs.mkdirSync(path.join(gameRoot, "www", "save"), { recursive: true });
  const runtime = fakeRuntime(projectRoot, gameRoot);
  // 允许安装 trainer/prison hooks
  runtime.window.__codexBridgeConfig.trainerHooks = true;
  runtime.window.__fakeMapId = 8;
  // lastSafeMap 需要非 695 位置先跑一轮 state
  const sandbox = { /* 与 assertBridgeBehavior 相同 require/process/document/location */ };
  // 把 runtime.window 挂到 sandbox.window
  vm.runInNewContext(bridgeSource, sandbox, { filename: "page-bridge.js" });
  const bridge = runtime.window.__codexLocalTrainerBridge;
  const bridgeDir = path.join(projectRoot, "runtime", "bridge-state");

  // 开启 bypass
  fs.writeFileSync(
    path.join(bridgeDir, "commands.jsonl"),
    `${JSON.stringify({ type: "trainer.options.set", options: { prisonBypass: true }, commandId: "bp-1", ts: Date.now() + 1 })}\n`,
    "utf8"
  );
  bridge.__pollCommands();
  bridge.__writeState();
  let state = JSON.parse(fs.readFileSync(path.join(bridgeDir, "state.json"), "utf8"));
  assert(state.trainerOptions.prisonBypass === true, "prisonBypass should be on");
  assert(runtime.switches._data[520] === false, "enable should clear Switch520");

  // 拦截 520
  runtime.switches.setValue(520, true);
  assert(runtime.switches._data[520] !== true, "setValue(520,true) must be blocked");

  // 拦截禁存档
  runtime.window.$gameSystem.disableSave();
  assert(runtime.window.$gameSystem.isSaveEnabled() === true, "disableSave must be blocked");

  // 拦截 Map695
  runtime.window.$gamePlayer.reserveTransfer(695, 4, 4, 2, 0);
  assert(runtime.window.$gamePlayer._newMapId !== 695, "transfer to 695 must be blocked");
  assert(runtime.window.$gamePlayer._transferring !== true, "blocked transfer must not start");

  // 脱困：先手动进 695 状态再开 bypass（或关再开）
  runtime.window.__fakeMapId = 695;
  runtime.switches._data[520] = true;
  runtime.window.$gameSystem._saveEnabled = false;
  // 先关再开以触发 applyPrisonBypassNow
  fs.writeFileSync(
    path.join(bridgeDir, "commands.jsonl"),
    [
      JSON.stringify({ type: "trainer.options.set", options: { prisonBypass: false }, commandId: "bp-2", ts: Date.now() + 2 }),
      JSON.stringify({ type: "trainer.options.set", options: { prisonBypass: true }, commandId: "bp-3", ts: Date.now() + 3 })
    ].join("\n") + "\n",
    "utf8"
  );
  bridge.__pollCommands();
  bridge.__writeState();
  state = JSON.parse(fs.readFileSync(path.join(bridgeDir, "state.json"), "utf8"));
  assert(runtime.switches._data[520] === false, "rescue should clear 520 on map 695");
  assert(runtime.window.$gameSystem.isSaveEnabled() === true, "rescue should re-enable save");
  assert(
    runtime.window.$gamePlayer._newMapId && runtime.window.$gamePlayer._newMapId !== 695,
    "rescue should transfer away from 695"
  );
  assert(state.prisonBypassStats, "state should expose prisonBypassStats");
  assert(Number(state.prisonBypassStats.blockedSwitch520) >= 1, "should count blocked 520");
}
```

注意：`fakeRuntime` / sandbox 需与现有 `assertBridgeBehavior` 对齐，保证 `__pollCommands` / `__writeState` 存在（现桥已暴露）。若当前桥未暴露这些方法，本任务只写测试；Task 2 实现时保持与现有 repair 测试相同的调用面。

- [ ] **Step 4: 跑测试确认失败**

Run:

```powershell
cd "C:\Games\Nightmare without return\nwr_modkit\app\gui"
npm.cmd run test:prison
```

Expected: FAIL，提示缺少 `prisonBypass` / `prisonBypassBtn` 等 marker 或行为断言失败。

- [ ] **Step 5: Commit**

```powershell
cd "C:\Games\Nightmare without return\nwr_modkit"
git add app/gui/tests/prison-guard-contract.mjs
git commit -m "test: require prison bypass contract coverage"
```

---

### Task 2: Bridge 实现 `prisonBypass` 钩子与脱困

**Files:**
- Modify: `runtime/bridge/page-bridge.js`
- Test: `app/gui/tests/prison-guard-contract.mjs`（行为部分应变绿；GUI 部分仍可能红）

**Interfaces:**
- Consumes: 现有 `patchMethod`、`resolvePrototypeTargets`、`setTrainerOptions`、`ensureTrainerHooks`、`collectState`、`setSwitchValue`
- Produces:
  - `bridge.options.prisonBypass: boolean`（默认 `false`）
  - `bridge.prisonBypassStats: { blockedSwitch520, blockedDisableSave, blockedTransfer695, rescueCount }`
  - `bridge.lastSafeMap: { mapId, x, y } | null`
  - `applyPrisonBypassNow(): { rescued: boolean, ... }`
  - `collectState()` 增加 `prisonBypassStats`、`lastSafeMap`（`trainerOptions` 已含 options 展开）

- [ ] **Step 1: 扩展 bridge 初始状态**

在 `bridge.options` 增加 `prisonBypass: false`。在 `bridge` 对象上增加：

```javascript
prisonBypassStats: {
  blockedSwitch520: 0,
  blockedDisableSave: 0,
  blockedTransfer695: 0,
  rescueCount: 0
},
lastSafeMap: null,
prisonBypassHooksPatched: false
```

将 `bridge.version` 从当前值（如 `0.2.32`） bump 为下一位补丁号（如 `0.2.33`）。

- [ ] **Step 2: 实现辅助函数**

在 prison 相关区域（`repairPrisonGuardRisks` 附近）加入：

```javascript
const PRISON_SWITCH_ID = 520;
const PRISON_MAP_ID = 695;

function bumpPrisonBypassStat(name) {
  if (!bridge.prisonBypassStats) {
    bridge.prisonBypassStats = {
      blockedSwitch520: 0,
      blockedDisableSave: 0,
      blockedTransfer695: 0,
      rescueCount: 0
    };
  }
  bridge.prisonBypassStats[name] = Number(bridge.prisonBypassStats[name] || 0) + 1;
}

function updateLastSafeMap() {
  try {
    const map = resolveMap();
    const player = resolvePlayer();
    const mapId = map && typeof map.mapId === "function" ? Number(map.mapId()) : null;
    if (!Number.isFinite(mapId) || mapId === PRISON_MAP_ID) return;
    if (!player) return;
    const x = Number(player.x != null ? player.x : player._x);
    const y = Number(player.y != null ? player.y : player._y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    bridge.lastSafeMap = { mapId, x: Math.floor(x), y: Math.floor(y) };
  } catch (_) {}
}

function resolveSaveSystem() {
  try {
    if (window.$gameSystem) return window.$gameSystem;
    if (window.TK && window.TK.$ && typeof window.TK.$.gameSystem === "function") {
      return window.TK.$.gameSystem();
    }
  } catch (_) {}
  return null;
}

function forceEnableSave() {
  const system = resolveSaveSystem();
  if (!system) return false;
  if (typeof system.enableSave === "function") {
    system.enableSave();
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(system, "_saveEnabled")) {
    system._saveEnabled = true;
    return true;
  }
  return false;
}

function transferPlayerTo(mapId, x, y) {
  const player = resolvePlayer();
  if (!player || typeof player.reserveTransfer !== "function") return false;
  const direction = typeof player.direction === "function" ? player.direction() : (player._direction || 2);
  player.reserveTransfer(Math.floor(mapId), Math.floor(x), Math.floor(y), direction, 0);
  return true;
}

function applyPrisonBypassNow() {
  if (!bridge.options.prisonBypass) return { rescued: false, reason: "inactive" };
  let rescued = false;
  try {
    const switches = resolveSwitches();
    if (switches && typeof switches.value === "function" && switches.value(PRISON_SWITCH_ID)) {
      // 直接写存储，避免依赖 hook 顺序；false 不被拦截
      if (typeof switches.setValue === "function") switches.setValue(PRISON_SWITCH_ID, false);
      rescued = true;
    }
    if (forceEnableSave()) rescued = true;

    const map = resolveMap();
    const mapId = map && typeof map.mapId === "function" ? Number(map.mapId()) : null;
    if (mapId === PRISON_MAP_ID) {
      const safe = bridge.lastSafeMap;
      const target = safe && safe.mapId !== PRISON_MAP_ID
        ? safe
        : { mapId: 1, x: 0, y: 0 };
      if (transferPlayerTo(target.mapId, target.x, target.y)) rescued = true;
    }
  } catch (error) {
    bridge.lastError = String(error && error.stack || error);
  }
  if (rescued) bumpPrisonBypassStat("rescueCount");
  return { rescued, lastSafeMap: bridge.lastSafeMap, stats: { ...bridge.prisonBypassStats } };
}
```

- [ ] **Step 3: 在 `patchTrainerHooks` 中安装结果层钩子**

在现有 battle/rate hooks 之后追加（使用 `resolvePrototypeTargets` 与 `patchMethod`，与 invincible 相同风格）：

```javascript
// Switch 520
resolvePrototypeTargets("Game_Switches", ["Game_Switches"]).forEach((target) => {
  if (patchMethod(target.object, "setValue", `${target.label}.setValue`, function (original, args) {
    const id = Math.floor(Number(args[0]));
    const value = args[1];
    if (bridge.options.prisonBypass && id === PRISON_SWITCH_ID && value) {
      bumpPrisonBypassStat("blockedSwitch520");
      return original.call(this, id, false);
    }
    return original.apply(this, args);
  })) {
    count += 1;
    hooked.push(`${target.label}.setValue`);
  }
});

// disableSave
resolvePrototypeTargets("Game_System", ["Game_System"]).forEach((target) => {
  if (patchMethod(target.object, "disableSave", `${target.label}.disableSave`, function (original, args) {
    if (bridge.options.prisonBypass) {
      bumpPrisonBypassStat("blockedDisableSave");
      return undefined;
    }
    return original.apply(this, args);
  })) {
    count += 1;
    hooked.push(`${target.label}.disableSave`);
  }
});

// reserveTransfer Map695
resolvePrototypeTargets("Game_Player", ["Game_Player"]).forEach((target) => {
  if (patchMethod(target.object, "reserveTransfer", `${target.label}.reserveTransfer`, function (original, args) {
    const mapId = Math.floor(Number(args[0]));
    if (bridge.options.prisonBypass && mapId === PRISON_MAP_ID) {
      bumpPrisonBypassStat("blockedTransfer695");
      return undefined;
    }
    return original.apply(this, args);
  })) {
    count += 1;
    hooked.push(`${target.label}.reserveTransfer`);
  }
});
```

- [ ] **Step 4: 接入 `setTrainerOptions` / `trainerHooksWanted` / `collectState`**

`setTrainerOptions`：

```javascript
const previousBypass = bridge.options.prisonBypass;
// ...existing option assignments...
if (Object.prototype.hasOwnProperty.call(options, "prisonBypass")) {
  bridge.options.prisonBypass = toBool(options.prisonBypass);
}
ensureTrainerHooks();
if (bridge.options.prisonBypass) {
  updateLastSafeMap();
  if (!previousBypass) applyPrisonBypassNow();
  else applyPrisonBypassNow(); // 读档后重复 set 或保持开启时也允许脱困；可仅在 rising edge 调用
}
// 推荐：仅 rising edge 调用 applyPrisonBypassNow；另在 collectState 里若 bypass 且 map==695 再调用
return { ...bridge.options };
```

rising edge 推荐写法：

```javascript
if (bridge.options.prisonBypass && !previousBypass) applyPrisonBypassNow();
```

`trainerHooksWanted` 增加：

```javascript
!!options.prisonBypass
```

`collectState` 在返回对象中增加：

```javascript
prisonBypassStats: { ...bridge.prisonBypassStats },
lastSafeMap: bridge.lastSafeMap
```

并在 `collectState` 开头（hooks ensure 之后）：

```javascript
updateLastSafeMap();
if (bridge.options.prisonBypass) {
  // 轻量：若已在 695 或 520 仍开，尝试脱困（覆盖读档）
  const map = resolveMap();
  const mapId = map && typeof map.mapId === "function" ? Number(map.mapId()) : null;
  const punished = switchValue(PRISON_SWITCH_ID) === true;
  if (mapId === PRISON_MAP_ID || punished) applyPrisonBypassNow();
}
```

**禁止：** 向 `gameRoot/www/**` 写任何文件；状态只写 `runtime/bridge-state/`。

- [ ] **Step 5: 跑 prison 合同测试**

Run:

```powershell
cd "C:\Games\Nightmare without return\nwr_modkit\app\gui"
npm.cmd run test:prison
```

Expected: bridge 行为与 bridge 源码标记通过；GUI 标记若未改仍 FAIL（留给 Task 3）。若行为 FAIL，根据断言修钩子解析（`$gameSwitches` 原型、`resolvePrototypeTargets` 名称）。

- [ ] **Step 6: Commit**

```powershell
cd "C:\Games\Nightmare without return\nwr_modkit"
git add runtime/bridge/page-bridge.js
git commit -m "feat: add runtime prison bypass hooks"
```

---

### Task 3: GUI 开关与状态展示

**Files:**
- Modify: `app/gui/index.html`
- Modify: `app/gui/src/prison-guard-view.ts`
- Modify: `app/gui/src/command-guardrails.ts`
- Modify: `app/gui/app.ts`
- Modify: `app/gui/app.js`（通过 build 生成）
- Test: `app/gui/tests/prison-guard-contract.mjs`、`npm.cmd run test:guardrails`（若 guardrail 清单断言按钮 id）

**Interfaces:**
- Consumes: `state.trainerOptions.prisonBypass`、`state.prisonBypassStats`、`NwrGuiBridgeCommands.trainerOptionsSet`
- Produces: `prisonBypassBtn` 可切换；summary/metrics 显示 bypass 与拦截计数

- [ ] **Step 1: 改 HTML 面板**

在 `index.html` 小黑屋面板 metrics 中增加拦截计数容器（或沿用 JS 动态渲染），按钮行改为：

```html
<div class="preset-row">
  <button id="prisonBypassBtn" class="toggle-btn" disabled>屏蔽小黑屋</button>
  <button id="prisonRepairBtn" class="danger-action" disabled>修复可修复项</button>
</div>
```

- [ ] **Step 2: 扩展 `prison-guard-view.ts`**

扩展元素与 `applyPanel` 签名，增加 bypass 参数：

```typescript
export type PrisonBypassView = {
  readonly active: boolean;
  readonly stats: {
    readonly blockedSwitch520: number;
    readonly blockedDisableSave: number;
    readonly blockedTransfer695: number;
    readonly rescueCount: number;
  } | null;
};

export type PrisonGuardElements = {
  readonly summary: HTMLElement;
  readonly metrics: HTMLElement;
  readonly list: HTMLElement;
  readonly repairButton: { disabled: boolean; title: string };
  readonly bypassButton: { disabled: boolean; title: string; classList: DOMTokenList };
};

export function applyPanel(
  elements: PrisonGuardElements,
  report: PrisonGuardReport | null,
  live: boolean,
  bypass: PrisonBypassView | null
): void {
  // summary：若 bypass?.active，优先/附加「已屏蔽：520 / 禁存档 / Map695 传送将被拦截」
  // metrics：增加「屏蔽」ON/OFF、「拦截」总数
  // bypassButton.disabled = !live
  // bypassButton.classList.toggle("active", !!bypass?.active)
  // title：开/关说明
}
```

`summaryText` 示例：

```typescript
if (bypass && bypass.active) {
  if (report && report.hits.length > 0) {
    return `已屏蔽惩处（仍检测到 ${report.hits.length} 项硬风险）`;
  }
  return "已屏蔽：520 / 禁存档 / Map695 传送将被拦截";
}
```

`metricsHtml` 增加：

```typescript
const blocked = bypass && bypass.stats
  ? (
      Number(bypass.stats.blockedSwitch520 || 0) +
      Number(bypass.stats.blockedDisableSave || 0) +
      Number(bypass.stats.blockedTransfer695 || 0)
    )
  : 0;
metric("屏蔽", live && bypass ? (bypass.active ? "ON" : "OFF") : "-"),
metric("拦截", live && bypass ? blocked : "-"),
```

从 state 解析 bypass：

```typescript
export function bypassFromState(state: unknown): PrisonBypassView | null {
  const row = record(state);
  if (!row) return null;
  const options = record(row.trainerOptions) || {};
  const stats = record(row.prisonBypassStats);
  return {
    active: options.prisonBypass === true,
    stats: stats ? {
      blockedSwitch520: Number(stats.blockedSwitch520 || 0),
      blockedDisableSave: Number(stats.blockedDisableSave || 0),
      blockedTransfer695: Number(stats.blockedTransfer695 || 0),
      rescueCount: Number(stats.rescueCount || 0)
    } : null
  };
}
```

- [ ] **Step 3: guardrails**

在 `command-guardrails.ts` 增加：

```typescript
action(
  "prisonBypassBtn",
  "Toggle prison bypass",
  "trainer.options.set",
  "disable-guard",
  ["trainer.hooks.info", "ping"],
  HOOK_EVENTS
),
```

- [ ] **Step 4: `app.ts` 绑定**

DOM：

```typescript
prisonBypassBtn: $("prisonBypassBtn"),
```

`applyPanel` 调用处传入 `NwrGuiPrisonGuards.bypassFromState(state)`。

事件：

```typescript
dom.prisonBypassBtn.addEventListener("click", () => {
  const active = dom.prisonBypassBtn.classList.contains("active");
  sendOptions({ prisonBypass: !active }, "prisonBypassBtn");
});
```

在刷新 options 的路径上同步 `prisonBypassBtn` 的 `active` class（可放在 `updateBattleButtons` 旁或 prison panel 刷新里；优先 prison panel，避免战斗面板耦合）。

- [ ] **Step 5: 构建 GUI**

Run:

```powershell
cd "C:\Games\Nightmare without return\nwr_modkit\app\gui"
npm.cmd run build
```

Expected: `tsc` 成功，更新 `app.js`。

- [ ] **Step 6: 跑测试**

```powershell
cd "C:\Games\Nightmare without return\nwr_modkit\app\gui"
npm.cmd run test:prison
npm.cmd run test:guardrails
npm.cmd run test:protocol
```

Expected: PASS。

- [ ] **Step 7: Commit**

```powershell
cd "C:\Games\Nightmare without return\nwr_modkit"
git add app/gui/index.html app/gui/src/prison-guard-view.ts app/gui/src/command-guardrails.ts app/gui/app.ts app/gui/app.js
git commit -m "feat: add prison bypass toggle to GUI"
```

---

### Task 4: 文档与完整性边界说明

**Files:**
- Modify: `docs/工具使用说明.md`
- Modify: `docs/技术实现文档.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 已实现的 GUI 文案与 bridge 行为
- Produces: 用户可按文档开启屏蔽，并明确「不改游戏文件 / 仅 bridge 运行时」

- [ ] **Step 1: 更新 `docs/工具使用说明.md` 小黑屋章节**

在「小黑屋护栏」一节增加：

```markdown
### 屏蔽小黑屋

GUI 提供 `屏蔽小黑屋` 开关（运行时 bridge 选项 `prisonBypass`）。

开启后：
- 拦截 Switch520 被打开
- 拦截惩处禁用存档
- 拦截传送到 Map695
- 若已中招：关闭 520、恢复存档，并从 Map695 送回最近安全点

说明：
- **不修改游戏安装目录文件**；只在 modkit 启动的 bridge 运行时内存中生效
- 直接双击原版 `Game.exe` 不会带此屏蔽
- 检测列表仍会显示硬风险；`修复可修复项` 仍可用于压阈值
- 可能仍出现「终身监禁」提示文本，但不会真正进小黑屋/锁档
```

- [ ] **Step 2: 更新 `docs/技术实现文档.md` 小黑屋护栏章节**

补充：

```markdown
### 运行时 prisonBypass

- 选项：`bridge.options.prisonBypass`
- 命令：`trainer.options.set` / `trainer.options.get`
- 钩子：`Game_Switches.setValue`、`Game_System.disableSave`、`Game_Player.reserveTransfer`
- 状态：`prisonBypassStats`、`lastSafeMap`
- 脱困：`applyPrisonBypassNow()`
- 硬约束：不得改游戏根文件；注入仅限 `runtime/bridge` + 独立 game-app
```

- [ ] **Step 3: 更新 `README.md` 小黑屋一句**

在小黑屋护栏说明中加：支持运行时「屏蔽小黑屋」，不改游戏本体。

- [ ] **Step 4: Commit**

```powershell
cd "C:\Games\Nightmare without return\nwr_modkit"
git add docs/工具使用说明.md docs/技术实现文档.md README.md
git commit -m "docs: describe prison bypass runtime option"
```

---

### Task 5: 总验证（证据优先）

**Files:**
- 无新代码（除非测试失败需回修）

- [ ] **Step 1: 合同与协议测试**

```powershell
cd "C:\Games\Nightmare without return\nwr_modkit\app\gui"
npm.cmd run test:prison
npm.cmd run test:protocol
npm.cmd run test:state
npm.cmd run test:guardrails
```

Expected: 全部 PASS。

- [ ] **Step 2: 确认未改游戏文件**

```powershell
cd "C:\Games\Nightmare without return\nwr_modkit"
git status -sb
git diff --name-only HEAD~10..HEAD
```

Expected: 变更路径仅在 `nwr_modkit/` 下；**不得**出现游戏根 `www/`、`package.json`（游戏根）等。

可选：

```powershell
node .\tools\runtime-integrity-check.mjs
```

Expected: 通过（若脚本需要 game-app 已 setup，先 `.\tools\setup-runtime.ps1` 再跑；setup 不得改游戏本体哈希文件）。

- [ ] **Step 3: 手动验收清单（执行者勾选）**

1. 用 modkit 启动 bridge 运行时 + GUI（不要直接只开原版 Game.exe 测 bypass）。
2. 不开 bypass：超阈值触发，仍应惩处（对照）。
3. 开 bypass：超阈值，不进 Map695，520 保持 OFF，可存档。
4. 先中招进 695，再开 bypass：自动脱困。
5. 读档后 bypass 仍开：不会再被 520 锁死。

- [ ] **Step 4: 若手动/测试有缺口，小步回修并追加 commit**

提交信息保持短句完整英文或中文，且按可独立验证的逻辑拆分，不堆成一个大提交。

---

## Spec Coverage Checklist

| Spec 要求 | Task |
| --- | --- |
| `prisonBypass` trainer 选项 | Task 2 |
| 拦 520 / 禁存档 / Map695 | Task 2 |
| 开启自动脱困 + lastSafeMap | Task 2 |
| 保留检测与 prison.repair | 不改 repair 语义；Task 3 UI 并存 |
| GUI 开关与拦截计数 | Task 3 |
| 合同测试 | Task 1 + 2 + 3 |
| 文档 | Task 4 |
| 不改游戏文件 / AGENTS 合规 | Global Constraints + Task 5 |
| 不放开存档导出 / 不拦副作用开关 / 不拦对话框 | 无任务触碰这些路径 |

## Placeholder Scan

- 无 TBD/TODO 步骤
- 关键实现均给出可粘贴代码骨架
- 测试命令与期望结果已写明

## Type / Name Consistency

- 选项名统一：`prisonBypass`
- 统计字段统一：`blockedSwitch520` / `blockedDisableSave` / `blockedTransfer695` / `rescueCount`
- 函数名统一：`applyPrisonBypassNow` / `updateLastSafeMap`
- 按钮 id 统一：`prisonBypassBtn`
- 常量：`PRISON_SWITCH_ID = 520`、`PRISON_MAP_ID = 695`
