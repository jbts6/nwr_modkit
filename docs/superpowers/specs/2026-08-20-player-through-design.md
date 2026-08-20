# 主角穿墙开关设计

日期：2026-08-20  
状态：已批准，待实现计划  
范围：仅运行时 bridge 与 GUI；不修改游戏本体文件

## 目标

在运行时 GUI 修改器的“常用”面板增加“开启穿墙”开关。开关只影响 RPG Maker 的主角对象 `$gamePlayer`，不影响跟随者、载具、事件或地图数据。

开启后调用 `$gamePlayer.setThrough(true)`，关闭后调用 `$gamePlayer.setThrough(false)`。该状态只存在于当前 bridge 进程，不写入存档；bridge 断开或游戏重启后默认关闭。

## 约束

- 复用已有 `trainer.options.set` 命令，不新增独立命令类型。
- 使用现有 `bridge.options` 和状态轮询，不改变 bridge 文件队列协议。
- 只修改 `nwr_modkit` 内 authored 源码及合同测试。
- 不写入游戏根目录、`www/**`、`runtime/game-app` 的 junction 目标、存档或生成输出。
- 直接启动原版 `Game.exe` 不提供该开关；必须使用 modkit 准备的 bridge 运行时。

## 方案

新增运行时选项 `playerThrough`，与 `noSkillCost`、`oneHitKill`、`invincible` 同级。

```text
GUI 按钮
  -> trainer.options.set({ playerThrough: boolean })
  -> page-bridge 更新 bridge.options.playerThrough
  -> 应用 $gamePlayer.setThrough(boolean)
  -> state.json 回写 playerThrough 与实际 isThrough()
  -> GUI 更新按钮状态
```

不采用独立 `player.through.set` 命令，因为现有所有运行时辅助开关都走 `trainer.options.set`，复用它可以减少协议面和兼容风险。不采用 `Game_Player.canPass` hook，因为它会影响更多移动路径，侵入性高于 RPG Maker 原生穿透标志。

## 组件与职责

### GUI

- `app/gui/index.html`：在“常用”面板增加 `playerThroughBtn` 按钮。
- `app/gui/app.ts`：注册 DOM 引用、点击处理、状态渲染和 bridge 未连接时的禁用状态。
- `app/gui/src/bridge-commands.ts`：扩展 `OptionPatch` 的文档化字段或相关类型约束，保持命令类型为 `trainer.options.set`。
- `app/gui/src/command-guardrails.ts`：登记 `playerThroughBtn`，guardrail 级别与战斗辅助开关一致。

按钮文案使用 `开启穿墙`，关闭时显示 `穿墙 OFF`，开启时显示 `穿墙 ON`；状态以 bridge 回写为准，避免点击成功但运行时对象不可用时造成假状态。

### Page bridge

- `runtime/bridge/page-bridge.js`：
  - 在 `bridge.options` 增加 `playerThrough: false`。
  - 在 `trainer.options.set` 处理逻辑中验证布尔值。
  - 通过 RPG Maker 全局对象解析 `$gamePlayer`。
  - 调用 `setThrough` 应用目标状态。
  - 状态刷新时读取 `isThrough()`，写入 `playerThrough` 和实际状态字段。

### 测试

- 扩展 `app/gui/tests/prison-guard-contract.mjs` 或新增同职责合同测试，断言选项、按钮 ID、命令字段、bridge 应用函数和状态字段存在。
- 扩展 GUI 命令/护栏合同测试，确保按钮映射到 `trainer.options.set`。
- 如现有测试结构允许，增加最小 VM 行为测试：mock `$gamePlayer`，验证 true/false 分别调用 `setThrough`，缺少 `$gamePlayer` 时返回可见错误。

## 状态与错误处理

状态字段：

```text
options.playerThrough: boolean
playerThroughActive: boolean | null
```

`playerThroughActive` 表示运行时对象的实际 `isThrough()` 结果；对象尚未初始化时为 `null`。GUI 在 `null` 或应用失败时显示“未就绪”，不显示为已开启。

以下情况必须写入 `bridge.lastError` 并返回失败事件：

- `$gamePlayer` 不存在。
- `$gamePlayer.setThrough` 不存在或调用抛错。
- `$gamePlayer.isThrough` 不存在且无法确认实际状态。

开关值可以先写入 `bridge.options`，待地图对象可用后重试一次；重试成功前 GUI 必须保持未就绪提示。每次状态刷新重新应用一次目标值，覆盖读档或换图后 RPG Maker 重建玩家对象造成的状态丢失。

关闭开关只恢复主角原生碰撞，不触发额外传送、存档或事件操作。

## 验收标准

1. 未连接 bridge 时“开启穿墙”按钮禁用。
2. bridge 连接后按钮状态与 `playerThroughActive` 一致。
3. 开启后主角可以穿过原本不可通行的地图格。
4. 关闭后主角恢复正常地图碰撞。
5. 读档或换图后，开关仍按当前 `options.playerThrough` 重新应用。
6. 跟随者、载具和事件移动逻辑不被修改。
7. `$gamePlayer` 不可用时 GUI 显示失败或未就绪，而不是假装成功。
8. 合同测试与 TypeScript 构建通过。
9. Git diff 不包含游戏根目录或生成运行时载荷改动。

## 非目标

- 不控制跟随者、载具或事件的穿透。
- 不将穿墙状态写入 `.rpgsave`。
- 不修改 `Game_Player.canPass`、地图通行表或游戏脚本文件。
- 不改变原版无 bridge 启动路径。
