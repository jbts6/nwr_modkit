# NWR Modkit

这是《梦魇：无归》的本地工具项目目录，主要包含两套面向玩家的工具：

- **运行时 GUI 修改器**：连接手动 bridge 版游戏，支持金币/积分、倍率、物品、技能、角色、地图传送、公共事件、战斗辅助等运行时修改。
- **离线存档编辑器**：不启动游戏，直接读取和导出 `.rpgsave` 存档。

项目还包含数据/存档解密脚本、运行时 bridge 脚本和技术文档。

## 快速入口

首次使用前先确认本机有命令行版 Node.js/npm：

```powershell
node --version
npm.cmd --version
```

脚本最低要求 Node.js 18+；新装建议直接安装当前 LTS 版。任选一种：

```powershell
winget install -e --id OpenJS.NodeJS.LTS
```

也可以去 [Node.js 官网](https://nodejs.org/zh-cn/download) 下载 Windows LTS 安装包。安装后重新打开 PowerShell，让 `node` 和 `npm.cmd` 进入 PATH。

如果 Windows 提示“无法加载 .ps1，因为在此系统上禁止运行脚本”，任选一种处理：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

或者进入项目目录后，不修改执行策略，单次绕过执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\launch-gui.ps1"
```

先进入项目目录。最推荐把 `nwr_modkit` 放在游戏根目录下，也就是和 `Game.exe`、`www` 同级；这种布局不需要配置游戏路径，直接启动即可：

```powershell
cd "<你的 nwr_modkit 目录>"
.\tools\launch-gui.ps1
```

这是主入口，会启动运行时 GUI 修改器。离线存档编辑器单独启动：

```powershell
.\tools\launch-save-editor.ps1
```

只有当 `nwr_modkit` 不在游戏根目录下时，才需要复制本地配置并把 `gameRoot` 改成自己的游戏根目录：

```powershell
Copy-Item .\config.example.json .\config.local.json
notepad .\config.local.json
```

`gameRoot` 指向包含 `Game.exe` 和 `www\index.html` 的目录。`config.local.json` 已被 Git 忽略，每个用户可以写自己的路径。

常用脚本：

```text
tools/launch-gui.ps1          启动运行时 GUI 修改器
tools/launch-save-editor.ps1  启动离线存档树形编辑器
tools/launch-runtime.ps1      准备手动 background bridge 游戏
tools/launch-bg-bridge-runtime.ps1
                              生成 runtime/game-app 和手动启动脚本
tools/setup-runtime.ps1       从配置的游戏目录生成/刷新 NW 运行时链接
tools/clean-runtime.ps1       清理生成的 NW 运行时链接、字节码和解包导出
tools/trainer-send.mjs        CLI 发送修改器命令
tools/extract-all.ps1         导出 data.pak、useData、存档
tools/extract-data.ps1        导出 www/data/*.json
tools/encrypt-data.ps1        重新加密 www/data JSON
tools/extract-js-bytecode.ps1 抽取/分类 www/js 的 NW/V8 字节码
tools/extract-data-pak.mjs    导出 data.pak
tools/extract-usedata.mjs     导出 useData
tools/extract-saves.ps1       导出存档
tools/encrypt-saves.ps1       重新加密存档
tools/build-save-editor-index.mjs
                              生成离线存档编辑器字段/物品/技能索引
```

文档：

```text
docs/工具使用说明.md
docs/技术实现文档.md
```

## 结构

```text
app/gui/                 运行时 GUI 修改器 NW 应用，app.ts 编译为 app.js
app/save-editor/         纯网页离线存档树形编辑器
runtime/bridge/          注入游戏页面的 bridge 脚本
runtime/game-app/        运行时修改器准备出的手动 bridge 游戏目录，生成物
runtime/bridge-state/    命令队列、状态、日志，生成物
runtime/save-harness/    存档解密 NW harness
tools/                   CLI 和数据脚本
output/extract/          解密导出结果
output/repack/           重新加密输出
output/backup/           GUI 备份目录
docs/                    使用和技术文档
```

推荐把这个目录放在游戏根目录下，此时工具会自动用 `nwr_modkit` 的父目录作为游戏目录。也可以放在任意位置，只要通过 `-GameRoot`、环境变量 `NWR_GAME_ROOT` 或 `config.local.json` 指定游戏根目录即可。

## 运行时生成

`app/gui`、`runtime/game-app`、`runtime/trainer`、`runtime/save-harness` 里的 NW 运行时文件不是项目源码，而是由脚本从配置的游戏根目录生成的硬链接/目录联接。`runtime/game-app` 只在准备手动 bridge 游戏时生成；`app/save-editor` 是纯网页工具，不需要 NW 运行时。游戏更新后执行：

```powershell
.\tools\setup-runtime.ps1 -Force
```

启动 GUI、准备手动 bridge 游戏、解密存档时，如果运行时文件缺失，也会自动调用 setup。

`setup-runtime.ps1` 还会安装工具脚本依赖，并从当前 `www/js/*.jsc.pak` 重新提取存档解密 harness 需要的字节码。也就是说游戏更新后刷新脚本即可，不需要手动把运行时文件搬进项目。

依赖安装默认使用 `https://registry.npmmirror.com`。如需指定其它 npm registry：

```powershell
.\tools\setup-runtime.ps1 -NpmRegistry "https://registry.npmmirror.com"
```

也可以设置环境变量：

```powershell
$env:NWR_NPM_REGISTRY = "https://registry.npmmirror.com"
```

## GUI TypeScript

GUI 修改器的源码是 `app/gui/app.ts`，NW 实际加载的是编译后的 `app/gui/app.js`。开发时手动构建：

```powershell
cd .\app\gui
npm.cmd install --registry https://registry.npmmirror.com
npm.cmd run build
```

`tools/launch-gui.ps1` 会在发现 `app.ts` 或 `app/gui/src/*.ts` 比 `app.js` 新时自动执行同样的构建流程；启动前也会检查 `output/extract/data`，如果列表数据缺失或游戏更新后数据过期，会按当前游戏布局自动运行 `extract-data.mjs` 或 `extract-data-pak.mjs` 生成 GUI 列表数据。

GUI 中的物品、技能、角色、变量、开关、地图、事件等长列表默认按 `20` 条分页显示，并提供首页、上一页、下一页和末页按钮。当前运行时修改只保留手动 background bridge 准备流程。

## 运行时 GUI 修改器

启动 GUI：

```powershell
.\tools\launch-gui.ps1
```

基本使用流程：

1. 在 GUI 顶部启动方式保留默认的 `Prepare manual bridge game`。
2. 点击 `准备桥接`，脚本会生成 `runtime/game-app/`，并写入 `runtime/game-app/start-manual-bg-bridge.cmd`。
3. 等 GUI 里的 `准备游戏` 变成 `已准备` 后，点击 `打开游戏`。
4. 游戏窗口打开后回到 GUI，等待状态变为 `已连接` 再使用修改功能。

如果 `打开游戏` 按钮不可用，说明还没有准备成功。也可以手动打开 `runtime/game-app/start-manual-bg-bridge.cmd`，它启动的是准备好的 bridge 版游戏，不是根目录的普通 `Game.exe`。

小黑屋护栏：

- GUI 的 `常用 -> 小黑屋` 会从运行中的 bridge 状态自动读取检测结果。
- 点击 `查看小黑屋触发条件` 可以展开直接传送、只开惩处、关键物品、`Switch520`、提示副作用开关和运行时参数风险说明。
- `修复可修复项` 会调低已知硬阈值、补关键物品并关闭 `Switch520`，点击后直接发送命令。
- `actor(2).param(9)` 属于运行时公式/装备/插件判定，GUI 只检测和提示，不自动改。

注意事项：

- 运行时修改器需要 bridge 从游戏启动阶段进入页面；已经打开的普通根目录 `Game.exe` 不能后附加连接。
- 准备流程不修改游戏根目录的 `package.json`、`www/index.html` 或原始存档。
- 命令队列、状态和日志写在 `runtime/bridge-state/`，需要清理时运行 `tools/clean-runtime.ps1`。
- CLI 调试入口是 `node .\tools\trainer-send.mjs ...`，普通使用建议直接走 GUI。

当前保留的运行时功能以 GUI 面板为准，包括金币/积分、经验/掉率倍率、物品/装备、技能、角色编辑、地图传送、公共事件、战斗辅助、诊断和存档/标题刷新等。脱机挂机、熟练倍率、敌人图鉴解锁等旧功能已经移除。

需要清空这些生成产物时执行：

```powershell
.\tools\clean-runtime.ps1
```

默认会删除 NW 运行时链接、手动 bridge 运行目录、profile、bridge 状态、存档 harness 字节码、save-editor 构建产物和 `output/extract/data`、`output/extract/useData`、`output/extract/save` 解包导出；不会删除 `output/backup`、`output/repack` 或 `node_modules`。如果需要连工具依赖也一起清理：

```powershell
.\tools\clean-runtime.ps1 -IncludeDependencies
```

## 离线存档树形编辑器

这个模块不启动游戏、不走 NW 运行时，只在浏览器里处理本地 `.rpgsave` 文件：

```powershell
.\tools\launch-save-editor.ps1
```

打开页面后选择 `config.rpgsave`、`global.rpgsave` 或 `fileN.rpgsave`，编辑原生 JSON 树，再导出新的 `.rpgsave`。导出的文件建议先另存，确认可读后再覆盖原存档。

启动脚本会按当前本地游戏数据生成 `app/save-editor/public/game-data-index.json`，用于显示变量、开关、物品、技能等名称和图标索引。这个文件由游戏数据派生，已被 Git 忽略；如果没有可用游戏目录，编辑器仍可打开存档，但列表会退回到原始 ID。
