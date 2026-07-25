# 运行时屏蔽小黑屋（Prison Bypass）设计

日期：2026-07-25  
状态：已批准（含硬约束修订），待实现计划  
范围：仅 `nwr_modkit` 内 authored 源码与文档；运行时 bridge + GUI  
依据：`nwr_modkit/AGENTS.md`、`runtime/AGENTS.md`、`tools/AGENTS.md`、`docs/技术实现文档.md` 设计边界

## 硬约束（必须遵守）

实现与验收时把下列约束当作失败条件，而不是建议：

1. **遵循 `nwr_modkit/AGENTS.md` 及其子树 AGENTS**
   - 只改 authored 源：`runtime/bridge/`、`app/gui/`、`docs/`、相关合同测试等
   - 不把 `output/`、`dist/`、`node_modules/`、NW 运行时 DLL/EXE/PAK、probe 日志当源码改
   - 不把 `runtime/save-harness`、生成的 `runtime/game-app` 载荷当维护源
   - 不静默覆盖 live `www/save`；需要写回的由用户手动备份替换
   - 工具仍从游戏根启动：`powershell -NoProfile -ExecutionPolicy Bypass -File .\nwr_modkit\tools\...`

2. **不得修改游戏本体文件**
   - 原因：改动游戏根目录文件会触发完整性/启动检测，导致**无法打开游戏**
   - 明确禁止写入或就地改写游戏根下任意文件，包括但不限于：
     - `package.json`、`loading`、`www/index.html`、`www/loading.html`
     - `www/js/**`、`www/data/**`、`www/img/**`、`www/audio/**`
     - 其它 `Game.exe` 旁的原版资源与配置
   - 本功能**禁止**采用：回写加密 data、清空/改写 CommonEvents、给 `www/js` 塞补丁、改启动 `package.json` / `index.html` 注入脚本

3. **允许的工作面（与现有 modkit 一致）**
   - 只修改 `nwr_modkit` 仓库内源码
   - 运行时通过 **独立 bridge 目录**（如 `runtime/game-app`）注入 `page-bridge.js`；`www` 可为 junction/symlink 指向游戏目录
   - **即使存在 junction，本功能也不得经该路径改写** `www/js`、`www/data`、`www/index.html` 等本体文件；只做进程内 hook
   - 状态写在 `runtime/bridge-state/`（生成目录，非游戏安装文件）
   - 现有 `tools/runtime-integrity-check.mjs` 保护的原版哈希文件必须继续保持不被改动

4. **实现检查清单**
   - 任何 PR/提交 diff 不得包含游戏根路径下的文件
   - 不得新增“自动把补丁复制进 `www/`”的脚本步骤
   - 文档与成功标准必须写明：屏蔽依赖 **modkit 启动的 bridge 运行时**，原版直接双击 `Game.exe` 不会带 bypass

## 背景

游戏用公共事件做「修改判定」：命中阈值后打开 `Switch520【破坏规则惩处】`、禁用存档，部分路径传送 `Map695`。

现有 modkit 提供的是**护栏/合规**能力：

- 列出已知阈值与风险
- `prison.repair` 把可修复项压回安全区并关闭 `Switch520`
- 离线存档编辑器对硬风险**拦截导出**

这能降低误踩线概率，但无法在「故意超阈值改档 / 改运行时」时继续玩。用户需要的是**屏蔽惩处结果**，而不是只把数值修回去。

已知判定事件（不保证 100% 无遗漏）：

- 直接传送类：CE334、337–344、405
- 只开惩处类：CE335、336、403、406、407、571、572
- 核心结果：`Switch520`、禁存档、部分路径 `Map695 (4,4)`

静态数据中 Map008 有并行事件调用部分 CE；其余 CE 未必有完整静态调用图。因此实现应拦截**惩处结果**，而不是只 no-op 已知 CE 列表。

## 目标

1. 运行时增加可开关选项 `prisonBypass`（GUI 文案：屏蔽小黑屋）。
2. 开启后拦截惩处结果：
   - 阻止 `Switch520` 被设为 ON
   - 阻止惩处路径的禁用存档
   - 阻止传送到 `Map695`
3. 开启瞬间自动脱困：
   - 关闭 `Switch520`
   - 恢复可存档
   - 若当前在 `Map695`，传送到最近记录的安全地图坐标
4. 保留现有检测与 `prison.repair`，作为信息与手动合规修复手段。

## 非目标

- **不修改任何游戏本体文件**（见硬约束；含 data / js / html / package.json）
- 不永久修改 `CommonEvents.json` / 地图事件 / 加密 data（即使写在 `output/extract` 也不回灌 `www/data`）
- 不放开存档编辑器硬风险导出拦截
- 不保证屏蔽「终身监禁」等提示对话框（判定事件仍可能跑完文本）
- 不拦截剧情副作用开关 `166 / 781 / 784 / 785 / 1067`（避免误伤正常流程）
- 不保证覆盖尚未发现的、走完全不同结果路径的隐藏判定
- 不改变原版无 bridge 启动路径的行为

## 方案选择

对比过三种实现：

| 方案 | 做法 | 结论 |
| --- | --- | --- |
| 1. 引擎 API 钩子 | hook `Game_Switches.setValue`、`disableSave`、地图传送入口 | **采用** |
| 2. 解释器命令钩子 | hook 事件码 121/135/201 | 路径更碎，易漏插件/别名 |
| 3. 看门狗轮询 | 定时纠正 520/地图/存档开关 | 可能闪屏/短暂进图，体验差 |

`prisonBypass` 并入现有 `trainer.options`，与 `invincible` / `oneHitKill` 同级，复用 `trainer.options.get/set`。

## 架构

```text
GUI 小黑屋面板
  └─ 开关：屏蔽小黑屋
        │
        ▼
trainer.options.set({ prisonBypass })
        │
        ▼
page-bridge
  ├─ options.prisonBypass
  ├─ patchTrainerHooks() 增加结果层钩子
  ├─ applyPrisonBypassNow() 开启/读档后脱困
  ├─ lastSafeMap 非 695 时持续记录
  └─ state.json 暴露开关、stats、安全点
```

### 钩子语义（仅 `prisonBypass === true`）

| 拦截点 | 行为 |
| --- | --- |
| `Game_Switches.setValue(520, true)` 及等价路径 | 忽略写入，保持 OFF；`blockedSwitch520++` |
| `Game_System.disableSave()` 及已发现的等价路径 | no-op；`blockedDisableSave++` |
| 玩家传送目标 `mapId === 695`（`reserveTransfer` 等已发现入口） | 取消该次传送；`blockedTransfer695++` |

关闭 bypass 时只停止拦截，不主动施加惩罚，不自动重开 `Switch520`。

### 开启瞬间 / 读档后：`applyPrisonBypassNow()`

前提：`prisonBypass === true` 且游戏对象可用。

1. `Switch520 = false`
2. 恢复可存档（优先调用引擎 `enableSave` 类 API；否则按实际字段写回可存档状态）
3. 若当前 `mapId === 695`：
   - 优先传送到 `lastSafeMap`
   - 若无记录，回退到 System 起始地图或 mapId `1` 的合理坐标
4. `rescueCount++`（仅在确实执行了清开关/恢复存档/送出地图中至少一项时）

`lastSafeMap` 更新规则：当前地图存在、`mapId !== 695`、玩家坐标有效时，写入 `{ mapId, x, y }`。

### 与现有护栏的关系

- `collectPrisonGuardReport()` 继续报告超阈值，便于知道踩了哪些线
- report / state 增加 `bypassActive`（或由 GUI 直接读 `options.prisonBypass`）
- GUI 摘要在 bypass 开启时明确提示：检测仍可能显示硬风险，但惩处结果不会生效
- `prison.repair` 保留，供不想开 bypass、只想压阈值的场景使用

## UI

位置：GUI `常用 -> 小黑屋` 面板。

- 新增开关按钮：`屏蔽小黑屋`
- 状态文案：
  - 关：`惩处结果生效中（检测仍可用）`
  - 开：`已屏蔽：520 / 禁存档 / Map695 传送将被拦截`
- metrics 增加拦截相关计数（至少汇总拦截次数或分项）
- 命令路径：`trainer.options.set`，guardrail 级别与 `invincible` 相同（`disable-guard`）

## 状态字段

```text
options.prisonBypass: boolean

prisonBypassStats: {
  blockedSwitch520: number,
  blockedDisableSave: number,
  blockedTransfer695: number,
  rescueCount: number
}

lastSafeMap: { mapId: number, x: number, y: number } | null
```

以上写入 bridge `state.json`，供 GUI 轮询展示。

## 错误与边界

- 钩子安装失败：写入 `bridge.lastError`；GUI 提示屏蔽钩子未就绪；开关值可保留，但应显示无效/未生效
- 尚未进入地图：允许先写入 option；进入可操作场景且 hooks 就绪后执行一次 `applyPrisonBypassNow`
- 读档后：若 bypass 仍开启，再执行一次 `applyPrisonBypassNow`
- 不拦截副作用开关，避免误伤梦魇传送处等正常剧情标记
- 提示文本仍可能出现：这是刻意的范围取舍，优先保证可玩与可存档

## 实现落点

仅允许改动 `nwr_modkit/` 内下列 authored 文件（或同职责新增测试辅助，仍不得触碰游戏根）：

| 文件 | 改动 |
| --- | --- |
| `runtime/bridge/page-bridge.js` | 选项、钩子、脱困、stats、`lastSafeMap`、state |
| `app/gui/src/bridge-commands.ts` 及 Option 类型 | `prisonBypass` 字段 |
| `app/gui/src/command-guardrails.ts` | 按钮 guardrail |
| `app/gui/index.html` | 开关与展示位 |
| `app/gui/src/prison-guard-view.ts` / `app.ts` | 渲染与发送命令 |
| `app/gui/tests/prison-guard-contract.mjs` | 合同断言扩展 |
| `docs/工具使用说明.md` / `docs/技术实现文档.md` / `README.md` | 使用与技术说明；重申不改游戏文件 |

**禁止落点：** 游戏根任意路径、`www/**` 实体文件、`runtime/game-app` 内对 junction 目标的写入、自动 repack 回 `www/data`。

## 测试计划

扩展现有合同测试，不新建重型测试框架：

1. Bridge 源码合同：存在 `prisonBypass`、结果层拦截标记、`applyPrisonBypassNow`
2. GUI 合同：HTML 开关、命令 builder / guardrail 标记
3. 可选 vm 行为测：
   - bypass 下 `setValue(520, true)` 保持 false
   - 传送 695 被拒绝
   - 开启时从 map 695 触发脱困路径

手动验收：

1. 不开 bypass，用超阈值触发已知路径，确认仍会惩处（回归对照）
2. 开 bypass 后把金币/物品改到超阈值，确认不进 Map695、520 保持关、可存档
3. 先中招进 695，再开 bypass，确认自动脱困
4. 读档后 bypass 仍开时，确认不会再次被 520 锁死

## 成功标准

- GUI 可开关「屏蔽小黑屋」，状态可从 bridge state 读回
- 开启后，已知惩处结果路径无法把玩家送进小黑屋或锁存档
- 开启时若已中招，可自动脱困到非 695 地图
- 现有 prison 检测与 repair 仍可用
- 合同测试通过；文档说明了能力与已知限制
- **实现 diff 与运行流程均不修改游戏本体文件**；原版启动仍可打开游戏
- 仍符合 `AGENTS.md`：不改游戏根 `package.json` / `www/index.html`，不静默覆盖 `www/save`

## 后续可选（不在本设计范围）

- 存档编辑器放开硬风险导出（仍不得自动写 `www/save`）
- ~~永久 data 补丁~~：**默认否决**——会改游戏文件并触发启动检测；除非用户明确接受风险并改为纯手动、可回滚流程
- 连「终身监禁」提示一并屏蔽（仍限内存 hook）
- 拦截更多尚未发现的判定入口（仍限 bridge 内存层）
