# 主角穿墙与槽位 1 快捷存档实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在 modkit bridge 运行时为 GUI 修改器增加只影响主角的穿墙开关，以及按 ~ 直接覆盖槽位 1 的快捷存档。

**Architecture:** 两项功能都复用 trainer.options.set。bridge 维护 playerThrough、quickSaveEnabled 和 quickSave 运行时状态；穿墙通过 $gamePlayer.setThrough 应用，快捷存档通过现有 saveGameToSlot(1) 调用 RPG Maker 的 DataManager.saveGame(1)。GUI 负责开关、状态展示和错误反馈，原版游戏文件不改写。

**Tech Stack:** RPG Maker/NW.js 页面 bridge、TypeScript GUI、Node.js 合同测试、TypeScript tsc 构建。

## Global Constraints

- 只修改 nwr_modkit 内 authored 源码、测试和文档；不得修改游戏根目录、www/**、runtime/game-app junction 目标、存档或生成输出。
- app/gui/app.ts 是 GUI 源码，app/gui/app.js 只能由 npm.cmd run build 生成，不能手工编辑。
- 穿墙只影响 $gamePlayer，不影响跟随者、载具、事件或地图通行数据。
- 穿墙不写入存档；bridge 重启后 playerThrough 默认关闭。
- 快捷存档固定调用 DataManager.saveGame(1)，直接覆盖 file1.rpgsave，不弹确认，不直接写文件。
- 快捷存档默认开启，可通过 GUI 关闭；只在地图探索且允许存档时执行。
- 快捷存档不在战斗、标题、读档、地图传送、事件执行或禁止存档状态下排队执行。
- 现有用户改动 tools/launch-gui.bat 和攻略文档必须保留，不加入本次功能提交。

---

### Task 1: 建立失败合同测试

**Files:**
- Create: app/gui/tests/through-quick-save-contract.mjs
- Modify: app/gui/package.json

**Interfaces:**
- Consumes: runtime/bridge/page-bridge.js、app/gui/app.ts、app/gui/index.html、app/gui/src/command-guardrails.ts。
- Produces: 可独立运行的穿墙与快捷存档合同测试。

- [ ] Step 1: 写入失败测试

测试先断言尚不存在的公开标记：

    assert(indexHtml.includes('id="playerThroughBtn"'), "GUI must expose playerThroughBtn");
    assert(indexHtml.includes('id="quickSaveBtn"'), "GUI must expose quickSaveBtn");
    assert(appSource.includes("playerThrough"), "app.ts must toggle playerThrough");
    assert(appSource.includes("quickSaveEnabled"), "app.ts must toggle quickSaveEnabled");
    assert(guardrailSource.includes("playerThroughBtn"), "guardrails must register playerThroughBtn");
    assert(guardrailSource.includes("quickSaveBtn"), "guardrails must register quickSaveBtn");
    assert(bridgeSource.includes("playerThroughActive"), "bridge must expose through state");
    assert(bridgeSource.includes("quickSave"), "bridge must expose quickSave state");

VM 行为测试准备 $gamePlayer、SceneManager._scene、$gameSystem 和 DataManager.saveGame，期望：

    sendOptions({ playerThrough: true });
    assert.equal(runtime.window.$gamePlayer.setThroughCalls.at(-1), true);
    sendOptions({ playerThrough: false });
    assert.equal(runtime.window.$gamePlayer.setThroughCalls.at(-1), false);

    dispatchKey({ key: "~", code: "Backquote", repeat: false });
    assert.deepEqual(runtime.savedIds, [1]);

另测 repeat、组合键、战斗场景和禁止存档状态不写盘。

- [ ] Step 2: 运行失败测试确认缺口正确

运行：

    cd .\app\gui
    node tests/through-quick-save-contract.mjs

预期：FAIL，失败原因是功能标记或行为缺失，不是测试夹具语法错误。

- [ ] Step 3: 注册测试脚本

在 app/gui/package.json 增加：

    "test:through-quick-save": "node tests/through-quick-save-contract.mjs"

再次运行同一命令，仍应因功能缺失失败。

- [ ] Step 4: 提交测试基线

    git add -- app/gui/tests/through-quick-save-contract.mjs app/gui/package.json
    git commit -m "test: add through and quick save contracts"

### Task 2: 实现 bridge 选项和主角穿墙

**Files:**
- Modify: runtime/bridge/page-bridge.js 的 bridge.options、setTrainerOptions、collectState
- Test: app/gui/tests/through-quick-save-contract.mjs

**Interfaces:**
- Consumes: Task 1 的 bridge VM 夹具。
- Produces: bridge.options.playerThrough、applyPlayerThrough()、playerThroughActive。

- [ ] Step 1: 写入穿墙行为测试并确认失败

    sendOptions({ playerThrough: true });
    assert.equal(runtime.window.$gamePlayer.setThroughCalls.at(-1), true);

运行 node tests/through-quick-save-contract.mjs，预期失败为 setThroughCalls 未更新。

- [ ] Step 2: 增加选项和应用函数

在 bridge.options 增加：

    playerThrough: false,
    quickSaveEnabled: true

在 setTrainerOptions 附近增加：

    function applyPlayerThrough() {
      const player = resolvePlayer();
      if (!player) {
        bridge.playerThroughActive = null;
        return { requested: !!bridge.options.playerThrough, active: null, applied: false };
      }
      if (typeof player.setThrough !== "function") {
        throw new Error("game player setThrough is unavailable");
      }
      player.setThrough(!!bridge.options.playerThrough);
      const active = typeof player.isThrough === "function"
        ? !!player.isThrough()
        : !!player._through;
      bridge.playerThroughActive = active;
      return { requested: !!bridge.options.playerThrough, active, applied: true };
    }

在 setTrainerOptions 中加入：

    if (Object.prototype.hasOwnProperty.call(options, "playerThrough")) {
      bridge.options.playerThrough = toBool(options.playerThrough);
      applyPlayerThrough();
    }

仅在 playerThrough 开启时于 collectState 前重申 true，以覆盖读档或换图后的玩家对象重建；关闭时只在用户切换瞬间调用一次 setThrough(false)，避免持续覆盖剧情临时设置的穿透状态。状态返回 playerThroughActive。对象尚未初始化时返回 null，调用异常写入 lastError 并让命令失败。

- [ ] Step 3: 运行穿墙测试确认通过

运行：

    cd .\app\gui
    node tests/through-quick-save-contract.mjs

预期：穿墙行为和状态断言通过，快捷存档断言仍失败。

- [ ] Step 4: 提交穿墙切片

    git add -- runtime/bridge/page-bridge.js app/gui/tests/through-quick-save-contract.mjs
    git commit -m "feat: add player through runtime option"

### Task 3: 实现 bridge 快捷存档键与安全条件

**Files:**
- Modify: runtime/bridge/page-bridge.js 的 bridge 状态、setTrainerOptions、初始化流程和状态收集
- Test: app/gui/tests/through-quick-save-contract.mjs

**Interfaces:**
- Consumes: saveGameToSlot(1)、resolveSceneManager()、resolveSaveSystem()、quickSaveEnabled。
- Produces: bridge.quickSave、installQuickSaveHotkey()、tryQuickSave()。

- [ ] Step 1: 写入快捷存档失败行为测试

VM 夹具准备：

    runtime.mapScene = { constructor: { name: "Scene_Map" }, _transfer: false };
    runtime.window.SceneManager._scene = runtime.mapScene;
    runtime.window.$gameSystem.isSaveEnabled = () => true;
    runtime.window.DataManager = {
      saveGame(id) { runtime.savedIds.push(id); return true; }
    };

断言地图探索时保存 ID 1；repeat、Ctrl/Alt/Meta、战斗场景、地图切换和禁止存档时 savedIds 不增加。先运行测试，预期失败为键盘监听或保存调用缺失。

- [ ] Step 2: 增加快捷存档状态

在 bridge 初始化对象增加：

    quickSave: {
      enabled: true,
      key: "~",
      slotId: 1,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastResult: "idle",
      lastMessage: null
    },
    quickSaveLastTriggerAt: 0

在 collectState 返回 quickSave 的浅拷贝。

- [ ] Step 3: 实现安全条件函数

新增 quickSaveBlockReason()，按顺序返回文字原因：

    function quickSaveBlockReason() {
      const manager = resolveSceneManager();
      const scene = manager && manager._scene;
      const sceneMap = window.Scene_Map || tkValue("SceneMap") || tkValue("Scene_Map");
      const isMapScene = !!scene && (
        (typeof sceneMap === "function" && scene instanceof sceneMap) ||
        String(scene.constructor && scene.constructor.name) === "Scene_Map"
      );
      if (!isMapScene) return "当前不在地图探索界面";
      if (typeof document.hasFocus === "function" && !document.hasFocus()) return "游戏窗口未获得焦点";
      if (manager && typeof manager.isSceneChanging === "function" && manager.isSceneChanging()) return "场景正在切换";
      const player = resolvePlayer();
      if (!player) return "玩家尚未初始化";
      if ((typeof player.isTransferring === "function" && player.isTransferring()) || player._transferring) return "地图正在切换";
      const map = resolveMap();
      if (!map) return "地图尚未初始化";
      if (typeof map.isEventRunning === "function" && map.isEventRunning()) return "事件正在执行";
      const interpreter = map._interpreter;
      if (interpreter && typeof interpreter.isRunning === "function" && interpreter.isRunning()) return "事件正在执行";
      const system = resolveSaveSystem();
      if (!system) return "游戏系统尚未初始化";
      if (typeof system.isSaveEnabled === "function" && !system.isSaveEnabled()) return "当前禁止存档";
      if (typeof system.isSaveEnabled !== "function" && system._saveEnabled === false) return "当前禁止存档";
      const dataManager = resolveDataManager();
      if (!dataManager || typeof dataManager.saveGame !== "function") return "保存接口不可用";
      return "";
    }

- [ ] Step 4: 实现固定槽位保存和反馈

新增 tryQuickSave()，只调用 saveGameToSlot(1)，不访问 saveDir：

    function tryQuickSave() {
      const now = Date.now();
      bridge.quickSave.lastAttemptAt = now;
      const blocked = quickSaveBlockReason();
      if (blocked) {
        bridge.quickSave.lastResult = "blocked";
        bridge.quickSave.lastMessage = blocked;
        return { ok: false, result: "blocked", message: blocked };
      }
      try {
        const result = saveGameToSlot(1);
        if (result && result.result === "false") throw new Error("saveGame returned false");
        bridge.quickSave.lastResult = "success";
        bridge.quickSave.lastSuccessAt = now;
        bridge.quickSave.lastMessage = "快速存档完成：槽位 1";
        if (window.SoundManager && typeof window.SoundManager.playSave === "function") window.SoundManager.playSave();
        showQuickSaveMessage(bridge.quickSave.lastMessage, true);
        return { ok: true, result: "success", message: bridge.quickSave.lastMessage, save: result };
      } catch (error) {
        bridge.lastError = String(error && error.stack || error);
        bridge.quickSave.lastResult = "error";
        bridge.quickSave.lastMessage = "快速存档失败";
        showQuickSaveMessage(bridge.quickSave.lastMessage, false);
        log("quick save failed", { error: bridge.lastError });
        return { ok: false, result: "error", message: bridge.quickSave.lastMessage };
      }
    }

showQuickSaveMessage 使用 pointer-events: none 的短时覆盖层；没有 DOM 能力时只更新状态和日志。

- [ ] Step 5: 安装一次性键盘监听并接入开关

新增 installQuickSaveHotkey()：

    function installQuickSaveHotkey() {
      if (!document || document.__codexQuickSaveHotkey) return false;
      document.addEventListener("keydown", function (event) {
        const target = event.target;
        const editable = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ""));
        const isTilde = event.key === "~" || (event.code === "Backquote" && event.shiftKey === true);
        if (!bridge.options.quickSaveEnabled || !isTilde || event.repeat || event.ctrlKey || event.altKey || event.metaKey || editable) return;
        const now = Date.now();
        if (now - bridge.quickSaveLastTriggerAt < 800) return;
        bridge.quickSaveLastTriggerAt = now;
        event.preventDefault();
        tryQuickSave();
      }, true);
      Object.defineProperty(document, "__codexQuickSaveHotkey", { value: true, configurable: true });
      return true;
    }

在 setTrainerOptions 中同步 quickSaveEnabled 到 bridge.quickSave.enabled，并在初始化阶段调用 installQuickSaveHotkey()。

- [ ] Step 6: 运行快捷存档测试确认通过

运行：

    cd .\app\gui
    node tests/through-quick-save-contract.mjs

预期：快捷存档键、固定槽位 1、过滤条件、禁止场景和状态字段全部通过。

- [ ] Step 7: 提交 bridge 快捷存档切片

    git add -- runtime/bridge/page-bridge.js app/gui/tests/through-quick-save-contract.mjs
    git commit -m "feat: add slot one quick save hotkey"

### Task 4: 接入 GUI 开关、状态和护栏

**Files:**
- Modify: app/gui/index.html 的核心工具区
- Modify: app/gui/app.ts 的 DOM、状态渲染和点击处理
- Modify: app/gui/src/command-guardrails.ts
- Test: app/gui/tests/through-quick-save-contract.mjs

**Interfaces:**
- Consumes: trainerOptions.playerThrough、trainerOptions.quickSaveEnabled、playerThroughActive 和 quickSave。
- Produces: playerThroughBtn、quickSaveBtn，两者都发送 trainer.options.set。

- [ ] Step 1: 写入 GUI 失败断言并确认失败

    assert(indexHtml.includes("按 ~ 覆盖槽位 1"), "GUI must describe slot one quick save");
    assert(commandGuardrails.includes('action("playerThroughBtn"'), "playerThroughBtn guardrail missing");
    assert(commandGuardrails.includes('action("quickSaveBtn"'), "quickSaveBtn guardrail missing");

运行合同测试，预期失败为控件和 guardrail 不存在。

- [ ] Step 2: 增加 HTML 控件

在常用核心面板中增加：

    <article class="panel tool-panel quick-tools-panel" data-tool-panel="core" data-tool-section="quick" data-tool-label="快捷工具">
      <div class="panel-title">快捷工具</div>
      <div class="row">
        <button id="playerThroughBtn" class="toggle-btn" disabled>穿墙 OFF</button>
        <button id="quickSaveBtn" class="toggle-btn" disabled>快捷存档 ON</button>
      </div>
      <div id="quickSaveState" class="muted">按 ~ 覆盖槽位 1</div>
    </article>

- [ ] Step 3: 接入 app.ts 状态和点击事件

DOM 引用增加：

    playerThroughBtn: $("playerThroughBtn"),
    quickSaveBtn: $("quickSaveBtn"),
    quickSaveState: $("quickSaveState"),

状态渲染保持以 bridge state 为准：

    function updateQuickTools(options, state, connected) {
      const throughActive = state.playerThroughActive === true;
      dom.playerThroughBtn.disabled = !connected;
      dom.quickSaveBtn.disabled = !connected;
      dom.playerThroughBtn.classList.toggle("active", throughActive);
      dom.playerThroughBtn.textContent = throughActive ? "穿墙 ON" : "穿墙 OFF";
      const quickEnabled = options.quickSaveEnabled !== false;
      dom.quickSaveBtn.classList.toggle("active", quickEnabled);
      dom.quickSaveBtn.textContent = quickEnabled ? "快捷存档 ON" : "快捷存档 OFF";
      const quick = state.quickSave || {};
      dom.quickSaveState.textContent = quick.lastMessage || "按 ~ 覆盖槽位 1";
    }

状态刷新后调用 updateQuickTools；事件绑定增加：

    dom.playerThroughBtn.addEventListener("click", () => {
      sendOptions({ playerThrough: !dom.playerThroughBtn.classList.contains("active") }, "playerThroughBtn");
    });
    dom.quickSaveBtn.addEventListener("click", () => {
      sendOptions({ quickSaveEnabled: !dom.quickSaveBtn.classList.contains("active") }, "quickSaveBtn");
    });

- [ ] Step 4: 登记 guardrail 并运行 GUI 合同

在动作清单增加：

    action("playerThroughBtn", "Toggle player through", "trainer.options.set", "disable-guard", ["trainer.hooks.info", "ping"], HOOK_EVENTS),
    action("quickSaveBtn", "Toggle quick save hotkey", "trainer.options.set", "disable-guard", ["trainer.hooks.info", "ping"], HOOK_EVENTS),

运行：

    cd .\app\gui
    node tests/through-quick-save-contract.mjs

预期：HTML、app.ts、guardrail 和 bridge 状态合同全部通过。

- [ ] Step 5: 提交 GUI 切片

    git add -- app/gui/index.html app/gui/app.ts app/gui/src/command-guardrails.ts app/gui/tests/through-quick-save-contract.mjs
    git commit -m "feat: expose through and quick save controls"

### Task 5: 构建、文档和定向回归验证

**Files:**
- Modify: README.md、docs/工具使用说明.md、docs/技术实现文档.md
- Generate: app/gui/app.js（仅通过 TypeScript 构建）
- Test: 新增合同测试和现有 bridge/UI/protocol 合同测试

**Interfaces:**
- Consumes: Task 2–4 的 bridge 状态和 GUI 文案。
- Produces: 可启动 GUI 构建、使用说明、技术说明和验证证据。

- [ ] Step 1: 更新使用文档

在 README 和工具使用说明中明确：

    穿墙：GUI -> 常用 -> 快捷工具 -> 穿墙 ON/OFF，只影响主角，必须从 bridge 版游戏启动。
    快捷存档：地图探索且允许存档时按 ~，直接覆盖槽位 1（file1.rpgsave），不弹确认。

在技术文档记录 options.playerThrough、options.quickSaveEnabled、playerThroughActive 和 quickSave 字段，以及不绕过禁止存档的边界。

- [ ] Step 2: 构建 GUI

运行：

    cd .\app\gui
    npm.cmd run build

预期：tsc -p tsconfig.json 退出码为 0，app.js 由构建更新，不手工编辑该文件。

- [ ] Step 3: 运行新增合同测试

运行：

    cd .\app\gui
    node tests/through-quick-save-contract.mjs

预期：通过。

- [ ] Step 4: 运行相关回归测试

运行：

    cd .\app\gui
    npm.cmd run test:protocol
    npm.cmd run test:ui
    npm.cmd run test:prison
    npm.cmd run test:topology

预期：全部退出码为 0；已有小黑屋护栏、协议和构建拓扑行为不回归。

- [ ] Step 5: 检查改动边界

运行：

    git status --short
    git diff --check
    git diff --name-only HEAD~5..HEAD

预期：本次提交只包含 nwr_modkit authored 源码、测试、文档和由构建生成的 app/gui/app.js；不出现游戏根目录、www/**、runtime/game-app 或用户已有改动。

- [ ] Step 6: 提交文档与构建结果

    git add -- README.md docs/工具使用说明.md docs/技术实现文档.md app/gui/app.js
    git commit -m "docs: document through and quick save features"

## 交付检查

- [ ] $gamePlayer.setThrough(true/false) 只影响主角，状态可从 bridge state 读回。
- [ ] ~ 在安全地图状态固定保存槽位 1，无确认且不直接写文件。
- [ ] GUI 两个开关默认状态正确，未连接时禁用。
- [ ] 战斗、事件、地图切换和禁止存档状态不会快捷保存。
- [ ] 现有小黑屋、协议、UI 和构建合同测试通过。
- [ ] 变更未触碰游戏本体文件或用户已有未提交改动。
