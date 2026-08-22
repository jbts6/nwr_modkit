# 游戏倍速调整设计

日期：2026-08-22  
状态：已批准，待实现计划  
范围：仅运行时 bridge 与 GUI；不修改游戏本体文件

## 目标

游戏自带变速齿轮上限只有 2 倍，战斗与长对话耗时仍然偏长。在 GUI 修改器的“常用”面板增加倍速调整，把逻辑推进速度提高到最多 10 倍。

倍速只影响 RPG Maker 场景逻辑的推进频率，不改数值、不改存档、不改游戏本体文件。bridge 断开或游戏重启后回到 1 倍。

## 约束

- 复用已有 `trainer.options.set` 命令，不新增独立命令类型。
- 使用现有 `bridge.options` 与状态轮询，不改变 bridge 文件队列协议。
- 只修改 `nwr_modkit` 内 authored 源码及合同测试。
- 不写入游戏根目录、`www/**`、`runtime/game-app` 的 junction 目标、存档或生成输出。
- 游戏的 `www/js/rpg_managers.js` 是加密产物，无法静态确认 `updateMain` 函体；实现必须靠运行时探测，且在探测失败时安全退回 1 倍。
- 直接启动原版 `Game.exe` 不提供该功能；必须使用 modkit 准备的 bridge 运行时。

## 方案

新增运行时数值选项 `gameSpeed`，与 `expRate`、`goldRate`、`dropRate` 同级。

```text
GUI 档位按钮 / 游戏内热键 [ ]
  -> trainer.options.set({ gameSpeed: number })
  -> page-bridge 更新 bridge.options.gameSpeed
  -> hook SceneManager.updateMain：原调用后额外推进 (n-1) 轮场景逻辑
  -> state.json 回写 gameSpeed、实测逻辑帧率与降级原因
  -> GUI 更新档位与实测帧率
```

### 为什么包装 `updateMain` 而不是改 `_deltaTime`

RPG Maker MV 的 `SceneManager.updateMain` 用固定步长累加器推进逻辑帧：

```js
this._accumulator += fTime;
while (this._accumulator >= this._deltaTime) {
  this.updateInputData();
  this.changeScene();
  this.updateScene();
  this._accumulator -= this._deltaTime;
}
this.renderScene();
```

把 `SceneManager._deltaTime` 改小确实能让逻辑帧变快，但被否决：

- `_deltaTime` 是游戏与插件共享的状态。本作已启用 `Drill_SpeedGear`（变速齿轮，加密字节码，无法审阅其实现），它很可能也在写同一批字段，双方互相覆盖会得到不可预期的倍速。
- `_accumulator` 有 0.25 秒追赶上限。倍速越高，单个渲染帧内需要消化的逻辑帧越多，一旦 CPU 跟不上就会持续积压，表现为整体卡顿而不是干净掉速。

改为在 `updateMain` 外层包装，额外推进逻辑轮次：

```js
const result = original.apply(this, args);   // 游戏原速（含自带齿轮）跑完一轮
for (let i = 1; i < speed; i++) {
  this.changeScene();
  this.updateScene();
}
return result;
```

这样有三点好处：与游戏自带齿轮是乘法叠加而非互相覆盖；不重复 `renderScene`，渲染开销与 1 倍时相同；额外轮次不进累加器，CPU 跟不上时只是掉速，不会积压。

代价是额外轮次绕过了 `updateInputData`。这是有意的：输入采样保持原速，菜单光标与长按手感不变，只有场景逻辑（战斗流程、动画、移动、对话推进）被加速。

### 档位

`1 / 2 / 3 / 4 / 6 / 8 / 10`，`1` 表示关闭。上限取 10：本作单帧逻辑较重，再往上通常已经被 CPU 限制，实际收益递减。

不支持小于 1 的减速。减速需要跳过原始 `updateMain` 调用，无法用包装实现，且与本次诉求相反。

### 热键

沿用 `installQuickSaveHotkey` 的模式，在 document 上注册 capture 阶段监听：

- `]` 升一档
- `[` 降一档

两个键都不在 RPG Maker MV 的默认按键映射内，不会和游戏操作冲突。在输入框聚焦时不响应。

## 组件与职责

### GUI

- `app/gui/index.html`：在“常用”面板穿墙/快捷存档一行下方增加 `gameSpeedRow`（档位按钮组）与 `gameSpeedState`（状态文本）。
- `app/gui/app.ts`：档位按钮走 `sendOptions({ gameSpeed })`；状态渲染显示请求档位、实际生效档位、实测逻辑帧率。
- `app/gui/src/command-guardrails.ts`：登记 `selector:data-game-speed` 控件，分类 `optimize`，与其他倍率控件一致。

### Page bridge

- `bridge.options.gameSpeed`：默认 `1`，`setTrainerOptions` 用 `clampNumber` 收敛到 `[1, 10]` 并对齐到最近档位。
- `bridge.gameSpeed`：运行状态（生效倍速、实测逻辑帧率、额外轮次计数、降级原因、最近错误）。
- `patchGameSpeedHooks()`：包装 `SceneManager.updateMain`。hook 只装一次，倍速为 1 时包装体直接透传。
- `speedHooksWanted()`：并入 `trainerHooksWanted()`，倍速为 1 时不装 hook。
- `collectState()`：回写 `trainerOptions.gameSpeed` 与 `gameSpeed` 运行状态。

### 测试

`app/gui/tests/game-speed-contract.mjs`，纯 Node 静态契约检查，不启动游戏：

- 档位表在 bridge、GUI、index.html 三处一致。
- bridge 默认 `gameSpeed: 1`，`setTrainerOptions` 有 clamp 与档位对齐。
- `updateMain` 包装体不调用 `renderScene`、不调用 `updateInputData`。
- 包装体有 try/catch 与失败降级路径。
- 热键 `[` `]` 已注册且尊重输入框聚焦。
- `collectState` 回写 `gameSpeed`。
- guardrails 与功能清单已登记控件。

## 状态与错误处理

`bridge.gameSpeed` 字段：

| 字段 | 含义 |
| --- | --- |
| `requested` | GUI 请求的档位 |
| `active` | 实际生效档位；hook 未装或降级时低于 `requested` |
| `hooked` | `updateMain` 是否已成功包装 |
| `logicFps` | 最近一秒实测逻辑帧数，用于判断是否被 CPU 限制 |
| `extraFrames` | 累计额外推进轮次 |
| `degradedReason` | 降级原因；`null` 表示正常 |
| `lastError` | 额外轮次里最近一次异常 |

额外轮次整体包在 try/catch 内。单次异常记入 `lastError` 并立即中断本帧剩余轮次（保证 `renderScene` 仍会执行）。连续 30 帧出现异常时把 `active` 降回 1 并写入 `degradedReason`，避免异常刷屏或游戏卡死；GUI 显示降级提示。

`SceneManager` 或 `updateMain` 缺失时 `hooked` 为 `false`、`active` 为 1、`degradedReason` 说明原因，功能静默不可用而不抛错。

## 验收标准

- GUI 切换档位后 1 秒内 `state.json` 的 `trainerOptions.gameSpeed` 与 `gameSpeed.active` 一致。
- 战斗中开 4 倍：伤害飘字与动画明显加速，画面不出现重复渲染撕裂，BGM 音调不变。
- 切回 1 倍后游戏速度恢复原状，`gameSpeed.extraFrames` 停止增长。
- 高倍速下存档、读档、场景切换、地图传送均正常，不触发 `lastError`。
- `npm run test:game-speed` 与既有全部合同测试通过。
- `npm run build` 通过，`app.js` 为 `app.ts` 的构建产物。

## 非目标

- 小于 1 倍的减速。
- 音频随倍速变调。
- 修改游戏本体文件或替换 `Drill_SpeedGear`。
- 把倍速写入存档或跨进程持久化。
- 按场景（战斗/地图）分别设定不同倍速。
