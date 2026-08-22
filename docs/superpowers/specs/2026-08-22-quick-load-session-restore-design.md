# 快速读档与会话恢复设计

日期：2026-08-22
状态：已批准，待实现计划
范围：仅运行时 bridge 与 GUI；不修改游戏本体文件

## 目标

两个独立但互补的体验改进：

1. **快速读档**：与 `~` 快速存档配对，游戏内按 `F8` 直接读回槽位 1，形成"存 → 试 → 读"闭环（刷高风险剧情判定点）。
2. **会话恢复**：bridge/游戏重启后所有修改器选项归零，需要手动逐项重开。GUI 检测到新 bridge 会话时自动重发上次配置。

## 约束

- 复用 `trainer.options.set` 命令，不新增独立命令类型；不改变 bridge 文件队列协议。
- 只修改 `nwr_modkit` 内 authored 源码、合同测试与文档；不写游戏根目录、`www/**`、存档。
- 快速读档不绕过 `DataManager.loadGame`，不直接读改存档文件；读档失败必须安全失败并提示，不破坏当前游戏状态。
- 会话恢复只在本机 GUI（NW.js `localStorage`）内持久化，不跨机器、不写游戏目录。
- 直接启动原版 `Game.exe` 不提供该功能；必须使用 modkit 准备的 bridge 运行时。
- 协议版本 `0.2.34` -> `0.2.35`：bridge 新增状态字段与行为，旧注入 GUI 显示"需重启"。

## 方案一：快速读档

### 命令流

```text
游戏内热键 F8 / GUI 按钮
  -> bridge 守卫检查（场景/事件/战斗/传送/焦点/槽位存在）
  -> DataManager.loadGame(1) -> $gameSystem.onAfterLoad() -> 跳转 Scene_Map
  -> state.json 回写 quickLoad 状态
  -> GUI 按钮态与状态行更新
```

### bridge 实现

- 选项 `trainerOptions.quickLoadEnabled`（默认 `true`），复用 `trainer.options.set`。
- 热键 `F8`（`event.key === "F8"`，capture 阶段，忽略 `ctrlKey/altKey/metaKey/repeat` 与可编辑控件聚焦），冷却 800ms，`inFlight` 防重入——与快速存档同构。
- 守卫条件（与快存一致的部分）：地图探索场景、无事件执行、无地图传送、非战斗、窗口有焦点；差异：读档**不要求** `isSaveEnabled`（允许读），但**要求槽位 1 文件存在**。
- 执行：`withoutTrainerThroughInSave` 不适用（读档重建游戏对象）；`DataManager.loadGame(1)` 兼容同步/Promise 返回；成功后调用 `$gameSystem.onAfterLoad()`（存在时）并 `sceneManager.goto(Scene_Map)`；失败写入 `lastError` 与 `quickLoad.lastResult = "error"`。
- 状态新增 `quickLoad: { enabled, key: "F8", slotId: 1, inFlight, lastAttemptAt, lastSuccessAt, lastResult: idle|success|blocked|error, lastMessage }`。
- **F8 键与浮窗**：游戏内浮窗（`installInGameOverlay`）原占用 F8。本设计将浮窗改为**默认不安装**（`bridgeConfig.overlay === true` 时才安装），显隐键迁移到 F6（引擎占用 F3/F4/F5，F6 空闲）；F8 专用快速读档。

### GUI 实现

- 快捷工具面板："快捷存档 ON/OFF"旁新增"快捷读档 ON/OFF"按钮（`quickLoadBtn`）与状态行（`quickLoadState`），未连接时禁用。
- 护栏登记：`quickLoadBtn` -> `trainer.options.set`，分类 `disable-guard`，证据命令与 HOOK_EVENTS 同快存开关。

## 方案二：会话恢复

### 会话识别

bridge 的 `collectState` 新增 `bridgeStartedAt`（取 `bridge.startedAtMs`）。GUI 以 `state.bridgeStartedAt` 变化判定"新会话"。

### GUI 实现与持久化

- `localStorage` 键 `nwr.trainer.session`，存 `{ options, bridgeStartedAt, autoRestore }`：
  - 每次收到 fresh 且 `versionOk` 的状态时，把 `trainerOptions` 快照与当前 `bridgeStartedAt` 一起写入（覆盖）。
  - 当 `state.bridgeStartedAt !== 快照.bridgeStartedAt` 且 `autoRestore` 为真时，`sendOptions(快照.options, "sessionRestore")` 并把快照绑定到新会话（每会话只恢复一次）。
  - 恢复的选项含全部 trainer 选项（rates、无耗/秒杀/无敌、穿墙、快存/快读开关、prisonBypass、gameSpeed）。
- 快捷工具面板新增勾选框"重启后自动恢复配置"（默认开，存 `localStorage`）；关闭后仅停止自动重发，不影响快照记录。
- 恢复动作通过常规命令通道发送，事件流中可见 `sessionRestore` 来源，不静默。

### 失败与边界

- bridge 未连接/版本不匹配时不恢复；快照无 `bridgeStartedAt`（首次使用）不恢复，只建立快照。
- 恢复失败（命令错误）不重试轰炸，仅事件流可见；下次会话仍会尝试。
- `localStorage` 不可用时功能静默降级为"仅会话内记忆"，GUI 不报错。

## 测试与文档

- 新合同脚本 `tests/quick-load-session-contract.mjs`（`package.json` 登记 `test:quick-session`），静态断言：
  - bridge：F8 热键、守卫（含槽位存在）、`quickLoad` 状态、浮窗默认关闭（`bridgeConfig.overlay === true`）与 F6 迁移、`bridgeStartedAt` 回写。
  - GUI：按钮/状态行/勾选框存在、`sessionRestore` 重发逻辑、localStorage 键名、版本 `0.2.35` 四处同步。
- 回归：全部现有合同 + `npm run build`；`test:guardrails` 的仓库外 A1 证据缺失为既有限制，仅记录。
- 文档：`README.md`、`docs/工具使用说明.md` 补用法段；`docs/技术实现文档.md` 登记 `quickLoad` 状态字段、F8/F6 键位、会话恢复机制与 `0.2.35` 要求。

## 不做（YAGNI）

- 不做热键自定义界面。
- 不做多槽位读档（固定槽位 1，与快存闭环一致）。
- 不做配置导入导出/云同步。
- 不做 GUI 重启前主动断开恢复（新 bridge 会话才触发）。
