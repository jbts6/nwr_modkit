# 游戏倍速调整实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 在 GUI 修改器中提供 `1 / 2 / 3 / 4 / 6 / 8 / 10` 倍档位，通过运行时包装 `SceneManager.updateMain` 加速场景逻辑，并提供热键、状态反馈和安全降级。

**架构：** 继续复用 `trainer.options.set`、`bridge.options` 和现有状态轮询。bridge 只在原始 `updateMain` 完成后额外调用 `changeScene`/`updateScene`，不改 `_deltaTime`、不重复输入采样和渲染；GUI 以按钮组发送档位，并显示请求档位、实际档位、逻辑帧率及降级原因。

**技术栈：** JavaScript 运行时 bridge、TypeScript/NW.js GUI、HTML/CSS、Node 静态合同测试。

## 全局约束

- 设计权威：`docs/superpowers/specs/2026-08-22-game-speed-design.md`。
- 档位固定为 `1 / 2 / 3 / 4 / 6 / 8 / 10`；非法输入先 clamp 到 `[1, 10]`，再对齐到最近档位，等距时取较低档。
- 不提供小于 1 倍的减速，不按战斗/地图拆分档位，也不让音频随倍速变调。
- 复用 `trainer.options.set`，不新增命令类型，不改变 bridge 文件队列协议。
- 原始 `updateMain` 每个渲染帧只调用一次；额外轮次只调用 `changeScene` 和 `updateScene`。
- 连续 30 帧的额外轮次失败后降级到 1 倍；单次失败立即终止当帧剩余轮次。
- 倍速不写入存档或跨进程持久化，bridge 重启后默认 1 倍。
- 只修改 `nwr_modkit` authored 源码、构建产物 `app/gui/app.js`、合同测试和文档；不写游戏根目录、`www/**`、存档、`output/` 或运行时生成目录。
- bridge/GUI 协议版本由 `0.2.33` 升至 `0.2.34`，旧注入必须显示“需重启”。
- 保留用户现有未提交改动 `tools/launch-gui.bat` 与攻略文档，不纳入本功能提交。

## 文件职责

- `runtime/bridge/page-bridge.js`：档位归一化、`updateMain` hook、热键、统计、降级及状态回写。
- `app/gui/tests/game-speed-contract.mjs`：运行时与 GUI 的纯 Node 静态合同。
- `app/gui/package.json`：登记 `test:game-speed`。
- `app/gui/app.ts`：发送档位、渲染状态、控制按钮状态。
- `app/gui/index.html`：档位按钮组与状态文本。
- `app/gui/styles.css`：现有快捷工具面板内的响应式档位布局。
- `app/gui/src/command-guardrails.ts`：登记 `selector:data-game-speed`。
- `app/gui/protocol-metadata.json`、`app/gui/tests/runtime-state-contract.mjs`：同步 bridge 版本。
- `app/gui/app.js`：由 `npm.cmd run build` 从 TypeScript 生成。
- `README.md`、`docs/工具使用说明.md`、`docs/技术实现文档.md`：用户入口、热键、状态与边界说明。

---

### 任务 1：运行时倍速合同与 bridge 实现

**文件：**
- 创建：`app/gui/tests/game-speed-contract.mjs`
- 修改：`app/gui/package.json`
- 修改：`runtime/bridge/page-bridge.js`

**接口：**
- 输入：`trainer.options.set({ gameSpeed: number })` 与 document capture 阶段的 `[` / `]`。
- 输出：`trainerOptions.gameSpeed` 和 `gameSpeed: { requested, active, hooked, logicFps, extraFrames, degradedReason, lastError }`。

- [ ] **步骤 1：写入只覆盖运行时的失败合同**

在 `app/gui/tests/game-speed-contract.mjs` 写入：

```js
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
```

同时在 `app/gui/package.json` 的 `scripts` 中加入测试入口，使 RED 阶段能够真正执行合同文件：

```json
"test:game-speed": "node tests/game-speed-contract.mjs"
```

- [ ] **步骤 2：运行合同并确认按预期失败**

运行：`npm.cmd run test:game-speed`

预期：失败于缺少 `patchGameSpeedHooks` 或 `test:game-speed`，而不是语法/路径错误。

- [ ] **步骤 3：实现运行时档位、状态、hook 和热键**

在 `runtime/bridge/page-bridge.js` 中加入以下公开常量与状态：

```js
const GAME_SPEED_LEVELS = [1, 2, 3, 4, 6, 8, 10];
const GAME_SPEED_MAX_ERROR_FRAMES = 30;
let gameSpeedWindowStartedAt = Date.now();
let gameSpeedWindowFrames = 0;
let gameSpeedConsecutiveErrors = 0;
```

```js
gameSpeed: 1,
```

```js
gameSpeed: {
  requested: 1,
  active: 1,
  hooked: false,
  logicFps: 0,
  extraFrames: 0,
  degradedReason: null,
  lastError: null
},
```

实现以下完整函数；`nearestGameSpeed` 在等距时保留前一个较低档，`patchGameSpeedHooks` 先执行原函数，再推进额外轮次：

```js
function nearestGameSpeed(value) {
  return GAME_SPEED_LEVELS.reduce((nearest, level) => (
    Math.abs(level - value) < Math.abs(nearest - value) ? level : nearest
  ), GAME_SPEED_LEVELS[0]);
}

function recordGameSpeedFrames(count) {
  const now = Date.now();
  gameSpeedWindowFrames += count;
  const elapsed = now - gameSpeedWindowStartedAt;
  if (elapsed < 1000) return;
  bridge.gameSpeed.logicFps = Math.round(gameSpeedWindowFrames * 1000 / elapsed);
  gameSpeedWindowStartedAt = now;
  gameSpeedWindowFrames = 0;
}

function degradeGameSpeed(reason, error) {
  bridge.gameSpeed.active = 1;
  bridge.gameSpeed.degradedReason = reason;
  if (error) {
    bridge.gameSpeed.lastError = String(error && error.stack || error);
    bridge.lastError = bridge.gameSpeed.lastError;
  }
}

function speedHooksWanted() {
  return Number(bridge.options.gameSpeed || 1) !== 1;
}

function patchGameSpeedHooks() {
  const sceneManager = window.SceneManager;
  if (!sceneManager || typeof sceneManager.updateMain !== "function") {
    bridge.gameSpeed.hooked = false;
    degradeGameSpeed("SceneManager.updateMain is unavailable");
    return false;
  }
  const patched = patchMethod(sceneManager, "updateMain", "SceneManager.updateMain", function (original, args) {
    const speed = Number(bridge.gameSpeed.active || 1);
    if (speed <= 1) return original.apply(this, args);
    const result = original.apply(this, args);
    let completed = 1;
    try {
      if (typeof this.changeScene !== "function" || typeof this.updateScene !== "function") {
        throw new Error("SceneManager scene update methods are unavailable");
      }
      for (let index = 1; index < speed; index += 1) {
        this.changeScene();
        this.updateScene();
        completed += 1;
        bridge.gameSpeed.extraFrames += 1;
      }
      gameSpeedConsecutiveErrors = 0;
    } catch (error) {
      gameSpeedConsecutiveErrors += 1;
      bridge.gameSpeed.lastError = String(error && error.stack || error);
      bridge.lastError = bridge.gameSpeed.lastError;
      if (gameSpeedConsecutiveErrors >= GAME_SPEED_MAX_ERROR_FRAMES) {
        degradeGameSpeed("30 consecutive accelerated frames failed", error);
      }
    }
    recordGameSpeedFrames(completed);
    return result;
  });
  bridge.gameSpeed.hooked = patched;
  if (!patched) {
    degradeGameSpeed("SceneManager.updateMain could not be wrapped");
    return false;
  }
  bridge.gameSpeed.active = bridge.gameSpeed.requested;
  bridge.gameSpeed.degradedReason = null;
  return true;
}

function installGameSpeedHotkeys() {
  if (!document || typeof document.addEventListener !== "function" || document.__codexGameSpeedHotkeys) return false;
  document.addEventListener("keydown", function (event) {
    const target = event && event.target;
    const tagName = target && String(target.tagName || "").toUpperCase();
    const editable = !!(target && (target.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT"));
    const direction = event && (event.key === "]" || event.code === "BracketRight")
      ? 1
      : (event && (event.key === "[" || event.code === "BracketLeft") ? -1 : 0);
    if (!direction || event.repeat || event.ctrlKey || event.altKey || event.metaKey || editable) return;
    const current = GAME_SPEED_LEVELS.indexOf(bridge.options.gameSpeed);
    const next = Math.min(GAME_SPEED_LEVELS.length - 1, Math.max(0, current + direction));
    if (next === current) return;
    if (typeof event.preventDefault === "function") event.preventDefault();
    setTrainerOptions({ gameSpeed: GAME_SPEED_LEVELS[next] });
    writeState();
  }, true);
  Object.defineProperty(document, "__codexGameSpeedHotkeys", { value: true, configurable: true });
  return true;
}
```

在 `setTrainerOptions` 中用 `clampNumber(options.gameSpeed, 1, 10, bridge.options.gameSpeed)` 和 `nearestGameSpeed` 更新 `bridge.options.gameSpeed`、`requested`、错误计数；切到 1 倍时立即把 `active` 设为 1。把 `speedHooksWanted()` 并入 `trainerHooksWanted()`，在 `patchTrainerHooks()` 中登记 `SceneManager.updateMain`，在 `collectState()` 中回写 `gameSpeed: { ...bridge.gameSpeed }`，启动时调用 `installGameSpeedHotkeys()`，并把 bridge 版本改为 `0.2.34`。

- [ ] **步骤 4：运行运行时合同并确认通过**

运行：`npm.cmd run test:game-speed`

预期：`game speed runtime contract OK`。

- [ ] **步骤 5：提交运行时阶段**

```powershell
git add -- "app/gui/tests/game-speed-contract.mjs" "app/gui/package.json" "runtime/bridge/page-bridge.js"
git commit -m "feat(runtime): add game speed bridge"
```

---

### 任务 2：GUI 档位、状态、护栏和协议版本

**文件：**
- 修改：`app/gui/tests/game-speed-contract.mjs`
- 修改：`app/gui/app.ts`
- 修改：`app/gui/index.html`
- 修改：`app/gui/styles.css`
- 修改：`app/gui/src/command-guardrails.ts`
- 修改：`app/gui/protocol-metadata.json`
- 修改：`app/gui/tests/runtime-state-contract.mjs`
- 生成：`app/gui/app.js`

**接口：**
- 消费：任务 1 的 `trainerOptions.gameSpeed` 和 `gameSpeed` 状态。
- 产生：`data-game-speed` 按钮组、`sendOptions({ gameSpeed })`、状态文本及 `selector:data-game-speed` 护栏。

- [ ] **步骤 1：扩展 GUI 失败合同**

在合同中读取 `app.ts`、`index.html`、`styles.css`、`command-guardrails.ts` 和 `protocol-metadata.json`。把任务 1 末尾的 `console.log("game speed runtime contract OK")` 替换为以下 GUI 断言与最终输出，确保任何 GUI 断言失败时都不会提前打印成功信息：

```js
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
```

- [ ] **步骤 2：运行合同并确认 GUI 部分失败**

运行：`npm.cmd run test:game-speed`

预期：运行时断言通过，失败于缺少 GUI 档位常量或 `gameSpeedRow`。

- [ ] **步骤 3：加入 GUI 控件和状态渲染**

在快捷工具按钮下加入语义化档位组：

```html
<div id="gameSpeedRow" class="segmented game-speed-row" role="group" aria-label="游戏倍速">
  <button data-game-speed="1" aria-pressed="true" disabled>1x</button>
  <button data-game-speed="2" aria-pressed="false" disabled>2x</button>
  <button data-game-speed="3" aria-pressed="false" disabled>3x</button>
  <button data-game-speed="4" aria-pressed="false" disabled>4x</button>
  <button data-game-speed="6" aria-pressed="false" disabled>6x</button>
  <button data-game-speed="8" aria-pressed="false" disabled>8x</button>
  <button data-game-speed="10" aria-pressed="false" disabled>10x</button>
</div>
<div id="gameSpeedState" class="hint">连接运行时后可用；按 [ / ] 调整档位。</div>
```

加入稳定且响应式的布局：

```css
.game-speed-row {
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  margin-top: 10px;
}

.game-speed-row button {
  min-width: 0;
  min-height: 44px;
  padding-inline: 4px;
}

@media (max-width: 720px) {
  .game-speed-row {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
```

在 `app.ts` 中添加 `const GAME_SPEED_LEVELS = [1, 2, 3, 4, 6, 8, 10] as const;`、`dom.gameSpeedState`，并实现：

```ts
function updateGameSpeed(options, state, connected) {
  const gameSpeed = state.gameSpeed || {};
  const requested = Number(options.gameSpeed || gameSpeed.requested || 1);
  const active = Number(gameSpeed.active || 1);
  document.querySelectorAll<HTMLButtonElement>("[data-game-speed]").forEach((button) => {
    const speed = Number(button.dataset.gameSpeed || 1);
    const selected = speed === requested;
    button.disabled = !connected;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  if (!connected) {
    dom.gameSpeedState.textContent = "连接运行时后可用；按 [ / ] 调整档位。";
    return;
  }
  if (gameSpeed.degradedReason) {
    dom.gameSpeedState.textContent = `已降级到 ${active}x：${gameSpeed.degradedReason}`;
    return;
  }
  dom.gameSpeedState.textContent = `请求 ${requested}x / 生效 ${active}x / 逻辑 ${Number(gameSpeed.logicFps || 0)} FPS`;
}
```

由 `updateQuickTools` 调用 `updateGameSpeed(options, state, connected)`，并绑定：

```ts
document.querySelectorAll<HTMLButtonElement>("[data-game-speed]").forEach((button) => {
  button.addEventListener("click", () => {
    const speed = Number(button.dataset.gameSpeed || 1);
    sendOptions({ gameSpeed: speed }, "selector:data-game-speed");
  });
});
```

在 `command-guardrails.ts` 登记：

```ts
action("selector:data-game-speed", "Game speed levels", "trainer.options.set", "optimize", ["trainer.hooks.info", "ping"], HOOK_EVENTS),
```

把 `app.ts`、`protocol-metadata.json` 和 `runtime-state-contract.mjs` 中的期望 bridge 版本统一改为 `0.2.34`。

- [ ] **步骤 4：运行 GUI 合同、状态合同和构建**

运行：

```powershell
npm.cmd run test:game-speed
npm.cmd run test:state
npm.cmd run test:inventory
npm.cmd run test:guardrails
npm.cmd run build
```

预期：全部退出码为 0，`app/gui/app.js` 包含 `GAME_SPEED_LEVELS` 与 `gameSpeedState`。

- [ ] **步骤 5：提交 GUI 阶段**

```powershell
git add -- "app/gui/app.ts" "app/gui/app.js" "app/gui/index.html" "app/gui/styles.css" "app/gui/src/command-guardrails.ts" "app/gui/protocol-metadata.json" "app/gui/tests/runtime-state-contract.mjs" "app/gui/tests/game-speed-contract.mjs"
git commit -m "feat(gui): add game speed controls"
```

---

### 任务 3：文档、阶段性回归与可视验收

**文件：**
- 修改：`README.md`
- 修改：`docs/工具使用说明.md`
- 修改：`docs/技术实现文档.md`

- [ ] **步骤 1：更新用户文档**

在现有“主角穿墙与快捷存档”相邻位置写明以下完整信息：

```text
游戏倍速提供 1/2/3/4/6/8/10 档，1 倍表示关闭。GUI 按钮和游戏内 [ / ] 热键复用同一运行时选项；输入框聚焦时热键不响应。倍速只额外推进场景逻辑，不改变 BGM 音调、不写存档，也不修改游戏本体文件。状态行会显示请求档位、实际档位和逻辑帧率；运行时探测失败或连续 30 帧出错时自动降回 1 倍。
```

在技术文档登记 `trainerOptions.gameSpeed`、`gameSpeed` 七个状态字段、`SceneManager.updateMain` 包装策略、`Drill_SpeedGear` 乘法叠加边界以及 `0.2.34` 版本要求。

- [ ] **步骤 2：执行阶段性合同回归**

在 `app/gui` 依次运行所有现有合同脚本和构建；仅本阶段允许全量合同回归：

```powershell
npm.cmd run test:game-speed
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
npm.cmd run build
```

预期：所有退出码为 0；若依赖仓库外 A1 证据的既有测试仍阻塞，只记录该既有限制，不改写或伪造证据。

- [ ] **步骤 3：视觉与运行时验收**

检查桌面和窄视口：7 个档位不溢出，窄视口按 4+3 换行，禁用/选中/降级文本均不重叠，Tab 可聚焦全部档位。

若可启动 bridge 版游戏，按设计稿验证 4 倍战斗、切回 1 倍、存读档、场景切换和 `lastError`；若当前环境不能稳定驱动游戏窗口，在交付中把这些项目明确标为“需真实游戏会话验证”，不得用静态合同代替。

- [ ] **步骤 4：提交文档阶段**

```powershell
git add -- "README.md" "docs/工具使用说明.md" "docs/技术实现文档.md"
git commit -m "docs: document game speed controls"
```
