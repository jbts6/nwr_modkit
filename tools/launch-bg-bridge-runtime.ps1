param(
  [string]$GameRoot,
  [string]$UserDataDir,
  [switch]$PrepareOnly,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "modkit-config.ps1")
$GameRoot = Resolve-Dq2GameRoot -ProjectRoot $ProjectRoot -GameRoot $GameRoot
Set-Dq2RuntimeEnvironment -ProjectRoot $ProjectRoot -GameRoot $GameRoot

$AppRoot = Join-Path $ProjectRoot "runtime\game-app"
& (Join-Path $PSScriptRoot "setup-game-app.ps1") -GameRoot $GameRoot -Force:$Force

function ConvertTo-JsLiteral {
  param([string]$Value)
  return ($Value | ConvertTo-Json -Compress)
}

function Assert-UnderPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Parent
  )
  $full = [System.IO.Path]::GetFullPath($Path)
  $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  if (-not $full.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to touch path outside runtime root: $full"
  }
}

$GameLoading = Join-Path $GameRoot "loading"
$RuntimeLoading = Join-Path $AppRoot "loading"
$BridgePath = Join-Path $ProjectRoot "runtime\bridge\page-bridge.js"
if (-not (Test-Path -LiteralPath $GameLoading)) {
  throw "Game bg script not found: $GameLoading"
}
if (-not (Test-Path -LiteralPath $BridgePath)) {
  throw "Bridge script not found: $BridgePath"
}

$GameRootJs = ConvertTo-JsLiteral $GameRoot
$ProjectRootJs = ConvertTo-JsLiteral $ProjectRoot
$BridgePathJs = ConvertTo-JsLiteral $BridgePath
$BgBridgeLogJs = ConvertTo-JsLiteral (Join-Path $ProjectRoot "runtime\bridge-state\bg-bridge.log")
$BridgeConfigJs = ([ordered]@{
  projectRoot = $ProjectRoot
  gameRoot = $GameRoot
  runtimeSpoof = $false
  overlay = $false
  dataDumpHooks = $false
  savePathPatch = $false
  disableTitleRefresh = $true
  showWindowOnInject = $true
  bridgeTickHooks = $false
} | ConvertTo-Json -Compress)

$Prelude = @"
;(function () {
  try {
    var fs = require("fs");
    var path = require("path");
    var gameRoot = $GameRootJs;
    process.cwd = function () { return gameRoot; };
    try {
      Object.defineProperty(process, "execPath", {
        configurable: true,
        get: function () { return path.join(gameRoot, "Game.exe"); }
      });
    } catch (_) {}
    try {
      var manifestPath = path.join(gameRoot, "package.json");
      if (typeof nw !== "undefined" && nw.App && fs.existsSync(manifestPath)) {
        var manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        Object.defineProperty(nw.App, "manifest", {
          configurable: true,
          get: function () { return manifest; }
        });
      }
    } catch (_) {}
  } catch (_) {}
}());
"@

$Suffix = @"
;(function () {
  function writeLog(message) {
    try {
      var fs = require("fs");
      var path = require("path");
      var logPath = $BgBridgeLogJs;
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, "[" + new Date().toISOString() + "] " + message + String.fromCharCode(10), "utf8");
    } catch (_) {}
  }

  try {
    var href = String(location && location.href || "");
    writeLog("entered href=" + href + " cwd=" + process.cwd());
    if (href.indexOf("/www/index.html") === -1 || window.__codexLocalTrainerBridge) return;

    var fs = require("fs");
    window.__codexBridgeConfig = $BridgeConfigJs;
    var bridgePath = $BridgePathJs;
    var source = fs.readFileSync(bridgePath, "utf8");
    (0, eval)(source + "\n//# sourceURL=codex-local-trainer-bridge.js");
    writeLog("bridge eval attempted hasBridge=" + !!window.__codexLocalTrainerBridge);
  } catch (error) {
    writeLog("bridge eval failed " + String(error && error.stack || error));
  }
}());
"@

$OriginalLoading = [System.IO.File]::ReadAllText($GameLoading, [System.Text.Encoding]::UTF8)
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
Remove-Item -LiteralPath $RuntimeLoading -Force -ErrorAction SilentlyContinue
[System.IO.File]::WriteAllText($RuntimeLoading, $Prelude + $OriginalLoading + $Suffix, $Utf8NoBom)

$NodeCommand = (Get-Command node -ErrorAction SilentlyContinue).Source
if ($NodeCommand) {
  & $NodeCommand --check $RuntimeLoading
  if ($LASTEXITCODE -ne 0) {
    throw "Generated bg bridge script failed syntax check: $RuntimeLoading"
  }
}

if (-not $UserDataDir) {
  $UserDataDir = Join-Path $ProjectRoot "runtime\bg-bridge-profile"
  Assert-UnderPath -Path $UserDataDir -Parent (Join-Path $ProjectRoot "runtime")
  if (Test-Path -LiteralPath $UserDataDir) {
    Remove-Item -LiteralPath $UserDataDir -Recurse -Force
  }
}
New-Item -ItemType Directory -Path $UserDataDir -Force | Out-Null

$GameExe = Join-Path $AppRoot "Game.exe"
if (-not (Test-Path -LiteralPath $GameExe)) {
  throw "Game.exe not found: $GameExe"
}

$ArgsList = @(
  "--user-data-dir=`"$UserDataDir`"",
  "--force-color-profile=srgb"
)

$ManualLauncher = Join-Path $AppRoot "start-manual-bg-bridge.cmd"
$ManualLauncherText = @"
@echo off
cd /d "%~dp0"
start "" "%~dp0Game.exe" --user-data-dir="$UserDataDir" --force-color-profile=srgb
"@
[System.IO.File]::WriteAllText($ManualLauncher, $ManualLauncherText, $Utf8NoBom)

if ($PrepareOnly) {
  $BridgeStateDir = Join-Path $ProjectRoot "runtime\bridge-state"
  New-Item -ItemType Directory -Path $BridgeStateDir -Force | Out-Null
  $InitialState = @{
    ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    ready = $false
    bridgeVersion = "0.2.32"
    hasParty = $false
    hasDataManager = $false
    manualBgBridge = $true
    manualGameExe = $GameExe
    manualLauncher = $ManualLauncher
    reason = "prepared manual bg bridge runtime; launch start-manual-bg-bridge.cmd"
  }
  [System.IO.File]::WriteAllText((Join-Path $BridgeStateDir "state.json"), ($InitialState | ConvertTo-Json -Depth 20), $Utf8NoBom)
  Write-Host "Prepared manual bg bridge runtime"
  Write-Host "Manual launcher: $ManualLauncher"
  Write-Host "Prepared Game.exe: $GameExe"
  return
}

Start-Process -FilePath $GameExe -WorkingDirectory $AppRoot -ArgumentList $ArgsList
Write-Host "Started bg bridge runtime"
