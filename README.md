# NWR Modkit

《梦魇：无归》的本地工具包。项目提供两个主要入口：

- 运行时 GUI 修改器：通过手动 bridge 版游戏连接运行中的 RPG Maker/NW.js 页面，提供金币/积分、倍率、物品、装备、技能、角色、地图、公共事件、战斗辅助和诊断面板。
- 离线存档编辑器：在浏览器里读取 `.rpgsave`，编辑 JSON 或结构化字段，然后导出新的存档文件。

项目还包含数据/存档编解码脚本、运行时 bridge、存档护栏和技术文档。仓库只保存工具源码和可复现脚本，不包含游戏本体、解密输出、运行时二进制、用户存档或本地配置。

## 要求

- Windows
- Node.js 18 或更高版本
- PowerShell
- 一份本地《梦魇：无归》游戏目录

检查 Node.js：

```powershell
node --version
npm.cmd --version
```

安装 Node.js LTS：

```powershell
winget install -e --id OpenJS.NodeJS.LTS
```

如果 PowerShell 禁止运行 `.ps1`，可以只对当前用户放开脚本策略：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

也可以每次用单次绕过方式执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\launch-gui.ps1"
```

## 安装位置

推荐把仓库放在游戏根目录下，和 `Game.exe`、`www` 同级：

```text
Nightmare without return/
  Game.exe
  www/
  nwr_modkit/
```

这种布局不需要额外配置。进入工具目录后直接启动：

```powershell
cd "<游戏目录>\nwr_modkit"
.\tools\launch-gui.ps1
```

如果 `nwr_modkit` 放在别处，复制本地配置模板并填写游戏目录：

```powershell
Copy-Item .\config.example.json .\config.local.json
notepad .\config.local.json
```

`gameRoot` 指向包含 `Game.exe` 和 `www\index.html` 的目录。`config.local.json` 已被 Git 忽略。

也可以临时传入或设置环境变量：

```powershell
$env:NWR_GAME_ROOT = "D:\Games\Nightmare without return"
```

## 运行时 GUI 修改器

启动 GUI：

```powershell
.\tools\launch-gui.ps1
```

基本流程：

1. 打开 GUI 后保留默认启动方式 `Prepare manual bridge game`。
2. 点击 `准备桥接`。工具会生成 `runtime/game-app/` 和 `runtime/game-app/start-manual-bg-bridge.cmd`。
3. 等 GUI 中的准备状态变成 `已准备`。
4. 点击 `打开游戏`，或手动运行 `runtime/game-app/start-manual-bg-bridge.cmd`。
5. 游戏窗口打开后回到 GUI，等待状态变为 `已连接`。

运行时修改器需要从准备好的 bridge 版游戏启动。已经打开的普通根目录 `Game.exe` 不能后附加连接。

GUI 当前覆盖的面板包括：

- 常用：金币/积分、经验倍率、掉率倍率、小黑屋护栏、存档/标题刷新。
- 物品角色：物品、武器、防具、技能、角色属性和点数。
- 世界：地图传送、公共事件、诊断。
- 战斗：按当前 bridge 暴露的战斗状态提供辅助开关。

小黑屋护栏会读取运行时状态并提示已知风险。展开 `查看小黑屋触发条件` 可以看到直接传送、惩处开关、关键物品、提示副作用开关和运行时参数说明。`修复可修复项` 会调低已知硬阈值、补关键物品并关闭 `Switch520`。

## 离线存档编辑器

启动：

```powershell
.\tools\launch-save-editor.ps1
```

默认地址：

```text
http://127.0.0.1:5176/
```

可选端口：

```powershell
.\tools\launch-save-editor.ps1 -Port 5177
```

打开页面后选择 `config.rpgsave`、`global.rpgsave` 或 `fileN.rpgsave`。编辑器不会直接写回 `www/save`，导出的 `.rpgsave` 需要用户自行备份并替换。

启动脚本会根据本地游戏数据生成 `app/save-editor/public/game-data-index.json`，用于显示变量、开关、物品、技能等名称和图标索引。这个文件来自本机游戏数据，已被 Git 忽略。没有可用游戏目录时，编辑器仍可打开存档，但列表会退回到原始 ID。

## 数据和存档脚本

常用命令：

```text
tools/launch-gui.ps1                  启动运行时 GUI 修改器
tools/launch-save-editor.ps1          启动离线存档编辑器
tools/launch-runtime.ps1              准备手动 bridge 游戏
tools/setup-runtime.ps1               刷新 NW 运行时链接和 harness
tools/clean-runtime.ps1               清理生成文件
tools/trainer-send.mjs                运行时命令行接口
tools/save-codec.mjs                  存档编解码
tools/extract-saves.ps1               导出存档 JSON
tools/encrypt-saves.ps1               重新编码存档
tools/data-codec.mjs                  数据 JSON 加解密
tools/extract-data.ps1                导出 www/data/*.json
tools/encrypt-data.ps1                重新加密 data JSON
tools/extract-data-pak.mjs            导出 data.pak
tools/extract-usedata.mjs             导出 useData
tools/build-save-editor-index.mjs     生成存档编辑器索引
tools/diagnose-prison-checks.mjs      检查小黑屋风险
```

更完整的用法见 [工具使用说明](docs/工具使用说明.md)。

## 项目结构

```text
app/gui/                 运行时 GUI 修改器，app.ts 编译为 app.js
app/save-editor/         React/Vite 离线存档编辑器
runtime/bridge/          注入游戏页面的 bridge 脚本
runtime/game-app/        手动 bridge 游戏目录，运行时生成
runtime/bridge-state/    命令队列、状态和日志，运行时生成
runtime/save-harness/    存档/数据探针 harness
tools/                   PowerShell 入口和 Node 脚本
output/extract/          解包/解密输出，生成物
output/repack/           回包/重新加密输出，生成物
output/backup/           GUI 备份目录，生成物
docs/                    使用文档和技术说明
```

## 开发

GUI 修改器源码在 `app/gui/app.ts`，NW 实际加载 `app/gui/app.js`：

```powershell
cd .\app\gui
npm.cmd install --registry https://registry.npmmirror.com
npm.cmd run build
```

存档编辑器：

```powershell
cd .\app\save-editor
npm.cmd install --registry https://registry.npmmirror.com
npm.cmd run build
```

启动脚本会在需要时自动安装依赖。默认 npm registry 为 `https://registry.npmmirror.com`，可以通过参数或环境变量覆盖：

```powershell
$env:NWR_NPM_REGISTRY = "https://registry.npmmirror.com"
```

## 生成文件

以下内容不会提交到仓库：

- `node_modules/`
- `app/save-editor/dist/`
- `app/save-editor/public/game-data-index.json`
- `runtime/game-app/`
- `runtime/bridge-state/`
- `runtime/*-profile*/`
- `output/extract/*`
- `output/repack/*`
- `output/backup/*`
- 从游戏目录生成的 NW 运行时文件、DLL、EXE、PAK、DAT、BIN、JSC

清理生成文件：

```powershell
.\tools\clean-runtime.ps1
```

连工具依赖一起清理：

```powershell
.\tools\clean-runtime.ps1 -IncludeDependencies
```

## 文档

- [工具使用说明](docs/工具使用说明.md)：面向用户的命令和操作流程。
- [技术实现文档](docs/技术实现文档.md)：面向维护者的数据格式、bridge 协议和护栏规则。

## 使用边界

这个项目面向本地研究、备份和单机存档管理。使用前请备份存档和数据文件。脚本默认把结果写入 `nwr_modkit/output`，不会自动覆盖游戏目录里的原始数据或存档。
