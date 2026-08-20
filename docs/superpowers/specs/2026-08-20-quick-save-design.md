# 槽位 1 快捷存档设计

日期：2026-08-20  
状态：已批准，待实现计划  
范围：仅运行时 bridge 与 GUI；不修改游戏本体脚本或直接编码存档文件

## 目标

为 modkit bridge 版游戏增加快捷存档：玩家在安全的地图探索状态按 `~` 键后，直接使用 RPG Maker 的保存接口覆盖第一个存档槽 `file1.rpgsave`，不打开菜单、不选择槽位、不弹确认。

第一个存档槽固定作为快速存档槽。该约定只影响快捷键行为；GUI 现有手动保存命令仍可选择其它槽位。

## 约束

- 复用现有 `saveGameToSlot(1)` 和 `DataManager.saveGame(1)` 路径。
- 不直接写入、拼接或重新编码 `file1.rpgsave`。
- 尊重游戏当前的禁止存档状态，不调用小黑屋脱困或强制恢复存档能力。
- 只在地图探索界面触发；战斗、标题、读档、地图切换和剧情事件执行期间禁止保存。
- 固定覆盖槽位 1，不弹确认。
- 仅 modkit 准备的 bridge 运行时拥有快捷键；原版直接启动不受影响。
- 不修改游戏根目录 `www/**`、`package.json` 或生成的 `runtime/game-app` 载荷。

## 方案选择

采用 bridge 页面监听键盘事件并调用现有保存函数。

| 方案 | 做法 | 结论 |
| --- | --- | --- |
| bridge 键盘监听 | 监听 `~`，校验场景后调用 `saveGameToSlot(1)` | **采用**；复用现有保存链路，改动最小 |
| 自动操作存档菜单 | 模拟菜单按键与槽位选择 | 不采用；依赖菜单结构、焦点和动画时序 |
| 直接写存档文件 | bridge 自行生成 `file1.rpgsave` | 不采用；绕过 RPG Maker 保存与全局信息更新 |

## 数据流

```text
游戏窗口 keydown(~)
  -> 过滤组合键、长按和防抖
  -> 检查地图场景与游戏状态
  -> 检查 $gameSystem.isSaveEnabled()
  -> saveGameToSlot(1)
  -> DataManager.saveGame(1)
  -> 更新最近结果并显示反馈
  -> state.json 回写快捷存档状态
```

## 按键判定

监听目标为游戏页面 `window`，使用冒泡阶段 `keydown`。满足下列任一条件时识别为快捷存档键：

- `event.key === "~"`
- `event.code === "Backquote" && event.shiftKey === true`

同时满足以下过滤条件：

- `event.repeat === false`
- 不包含 `Ctrl`、`Alt` 或 `Meta` 组合键
- 当前游戏窗口拥有焦点
- 事件目标不是输入框、文本区域或可编辑元素
- 距离上次有效触发超过防抖时间

防抖时间固定为 800 毫秒。通过条件检查后调用 `preventDefault()`，避免浏览器或游戏插件重复处理 `~`。

## 允许保存条件

快捷存档只在以下条件全部满足时执行：

1. `SceneManager._scene` 是地图场景，或能通过当前运行时别名确认属于 `Scene_Map`。
2. 玩家、地图、队伍、系统和 `DataManager` 已初始化。
3. 当前不在战斗中。
4. 玩家没有正在执行地图传送。
5. 地图解释器没有运行事件；包括主解释器及可识别的并行/子解释器活动状态。
6. 场景没有处于忙碌、切换或终止状态。
7. `$gameSystem.isSaveEnabled()` 返回 `true`；缺少该方法时仅在 `_saveEnabled !== false` 时允许。
8. `DataManager.saveGame` 可调用。

任一条件不满足时不写盘，并显示“当前无法快速存档”及简短原因。禁止状态不排队：条件恢复后必须重新按键。

## 保存行为

- 固定保存 ID 为 `1`。
- 直接覆盖 `file1.rpgsave`，不读取是否已有存档，也不弹确认。
- 复用 `saveGameToSlot(1)`，由 RPG Maker `DataManager.saveGame(1)` 负责生成存档、更新全局信息和执行游戏已有保存逻辑。
- 保存调用抛错或明确返回失败时，记录失败，不显示成功提示。
- 若保存接口返回 Promise，则等待其完成后再反馈；若返回同步结果，则立即按结果反馈。

## 反馈与状态

成功时：

- 播放 RPG Maker 的保存音效；优先复用 `SoundManager.playSave()`。
- 在游戏画面显示短暂提示：`快速存档完成：槽位 1`。

失败或禁止时显示短暂提示，不打开游戏消息窗口，避免打断移动或剧情。bridge 维护轻量覆盖层；覆盖层使用 `pointer-events: none`，不会拦截游戏输入。

bridge 状态增加：

```text
quickSave: {
  enabled: boolean,
  key: "~",
  slotId: 1,
  lastAttemptAt: number | null,
  lastSuccessAt: number | null,
  lastResult: "idle" | "success" | "blocked" | "error",
  lastMessage: string | null
}
```

失败异常同时写入 `bridge.lastError` 和 bridge 日志；普通禁止状态只更新 `quickSave.lastResult`，不污染 `lastError`。

## GUI

在“常用”面板增加快捷存档说明与开关：

- 按钮：`快捷存档 ON/OFF`
- 说明：`按 ~ 覆盖槽位 1`
- 最近结果：显示上次成功时间或最近禁止/失败原因

开关复用 `trainer.options.set`，新增 `quickSaveEnabled`，默认开启。关闭时移除快捷键效果，但保留 GUI 原有手动保存能力。

## 实现落点

| 文件 | 改动 |
| --- | --- |
| `runtime/bridge/page-bridge.js` | 快捷键监听、场景校验、槽位 1 保存、反馈覆盖层、状态字段 |
| `app/gui/index.html` | 快捷存档开关、按键与槽位说明、最近结果展示 |
| `app/gui/app.ts` | 开关命令、状态渲染、连接状态处理 |
| `app/gui/src/command-guardrails.ts` | 登记快捷存档开关，命令为 `trainer.options.set` |
| `app/gui/tests/` | bridge 行为、GUI 按钮和 guardrail 合同测试 |
| `README.md`、`docs/工具使用说明.md`、`docs/技术实现文档.md` | 使用方法、限制和技术状态字段 |

`app/gui/app.js` 由 TypeScript 构建生成，不作为手工修改源。

## 测试计划

合同及最小行为测试覆盖：

1. `~` / `Shift+Backquote` 触发一次槽位 1 保存。
2. `event.repeat`、组合键和 800 毫秒内重复事件不保存。
3. 保存调用固定为 ID `1`，不弹确认。
4. 地图探索且允许存档时成功。
5. 战斗、标题、读档、地图传送、事件运行和禁止存档状态下不保存。
6. 成功才播放保存音效并更新成功时间。
7. 禁止状态和异常分别更新 `blocked` / `error`。
8. 关闭 `quickSaveEnabled` 后按键无效果。
9. GUI 按钮映射到 `trainer.options.set`，状态可从 bridge state 回读。

手动验收：

1. 进入地图，按 `~`，确认 `file1.rpgsave` 时间更新且可正常读取。
2. 连续快速按键，确认只保存一次。
3. 覆盖已有槽位 1 时不弹确认。
4. 战斗、事件对话、地图切换和游戏禁止存档时按键，确认不写盘且有反馈。
5. 在 GUI 关闭快捷存档后，按键无效果；重新开启后恢复。

## 成功标准

- 玩家在安全地图状态按 `~` 可直接覆盖存档槽 1。
- 快捷存档不要求打开菜单或额外确认。
- 不安全状态不会生成存档，也不会延迟排队执行。
- 存档由 RPG Maker 原生 `DataManager.saveGame(1)` 生成并可正常读取。
- 游戏画面和 GUI 都能看到最近结果。
- 功能可在 GUI 中关闭，默认开启。
- 定向合同测试和 TypeScript 构建通过。
- 实现不修改游戏本体文件。

## 非目标

- 不支持自定义快捷键或快捷槽位。
- 不提供快速读档。
- 不在战斗、事件运行或禁止存档状态下强制保存。
- 不绕过小黑屋或剧情设置的禁止存档规则。
- 不修改槽位 1 之外的存档。
