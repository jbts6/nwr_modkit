param(
  [switch]$IncludeDependencies,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ProjectRootWithSep = $ProjectRoot.TrimEnd("\") + "\"

$RuntimeFiles = @(
  "bg_script",
  "d3dcompiler_47.dll",
  "ffmpeg.dll",
  "Game.exe",
  "icudtl.dat",
  "libEGL.dll",
  "libGLESv2.dll",
  "node.dll",
  "notification_helper.exe",
  "nw_100_percent.pak",
  "nw_200_percent.pak",
  "nw_elf.dll",
  "nw.dll",
  "resources.pak",
  "loading",
  "v8_context_snapshot.bin"
)

$RuntimeDirs = @("Dictionaries", "locales", "swiftshader", "www")
$Targets = @("app\gui", "runtime\trainer", "runtime\save-harness")

$BytecodeFiles = @(
  "plugins.js.jsc",
  "rpg_core.js.jsc",
  "rpg_managers.js.jsc",
  "rpg_objects.js.jsc",
  "rpg_scenes.js.jsc",
  "rpg_sprites.js.jsc",
  "rpg_windows.js.jsc",
  "TK_Expand.js.jsc"
)

$GeneratedSaveHarnessFiles = @("probe-result.json", "missing-globals.json")
$GeneratedSaveHarnessDirs = @(
  "audio",
  "css",
  "data",
  "fonts",
  "icon",
  "img",
  "js"
)
$ExtractedDirs = @(
  "output\extract\data",
  "output\extract\data_runtime_check",
  "output\extract\js-bytecode",
  "output\extract\useData",
  "output\extract\save"
)
$GeneratedDirs = @(
  "app\save-editor\dist",
  "output\qa",
  "runtime\bridge-state",
  "runtime\save-editor-state",
  "runtime\game-app",
  "runtime\extension",
  "runtime\extension-probe",
  "runtime\bg-bridge-profile",
  "runtime\bg-bridge-profile-r2",
  "runtime\cdp-profile",
  "runtime\extension-profile",
  "runtime\extension-probe-profile",
  "runtime\min-profile",
  "runtime\patched-profile",
  "runtime\r1-debug-profile",
  "runtime\root-cdp-profile",
  "runtime\root-extension-profile",
  "runtime\visible-profile",
  "runtime\wrapper-profile",
  "runtime\wrapper-profile-fresh"
)
$GeneratedFiles = @(
  "app\gui\debug.log",
  "app\gui\icons\IconSet.png",
  "app\save-editor\tsconfig.app.tsbuildinfo",
  "app\save-editor\tsconfig.node.tsbuildinfo",
  "output\save-editor-vite.err.log",
  "output\save-editor-vite.log"
)
$DependencyDirs = @(
  "tools\node_modules",
  "runtime\save-harness\node_modules",
  "app\gui\node_modules",
  "app\save-editor\node_modules"
)

function Resolve-FullPath {
  param([string]$Path)
  if (Test-Path -LiteralPath $Path) {
    return (Resolve-Path -LiteralPath $Path).Path
  }
  return [System.IO.Path]::GetFullPath($Path)
}

function Assert-InProject {
  param([string]$Path)
  $fullPath = Resolve-FullPath -Path $Path
  if ($fullPath -ne $ProjectRoot -and -not $fullPath.StartsWith($ProjectRootWithSep, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove outside project: $fullPath"
  }
}

function Remove-GeneratedItem {
  param(
    [string]$Path,
    [switch]$AllowRegularDirectory
  )

  Assert-InProject -Path $Path
  if (-not (Test-Path -LiteralPath $Path)) {
    return 0
  }

  $item = Get-Item -LiteralPath $Path -Force
  if ($item.PSIsContainer -and -not $item.LinkType -and -not $AllowRegularDirectory) {
    throw "Refusing to remove non-link directory: $Path"
  }

  if ($DryRun) {
    Write-Host "Would remove $Path"
  } else {
    if ($item.PSIsContainer -and $item.LinkType) {
      [System.IO.Directory]::Delete($item.FullName, $false)
    } elseif ($item.PSIsContainer) {
      Remove-Item -LiteralPath $Path -Recurse -Force
    } else {
      Remove-Item -LiteralPath $Path -Force
    }
    Write-Host "Removed $Path"
  }
  return 1
}

$removed = 0

foreach ($targetRel in $Targets) {
  $targetDir = Join-Path $ProjectRoot $targetRel

  foreach ($file in $RuntimeFiles) {
    $removed += Remove-GeneratedItem -Path (Join-Path $targetDir $file)
  }

  foreach ($dir in $RuntimeDirs) {
    $removed += Remove-GeneratedItem -Path (Join-Path $targetDir $dir)
  }
}

$saveHarness = Join-Path $ProjectRoot "runtime\save-harness"
foreach ($file in $BytecodeFiles + $GeneratedSaveHarnessFiles) {
  $removed += Remove-GeneratedItem -Path (Join-Path $saveHarness $file)
}
if (Test-Path -LiteralPath $saveHarness) {
  foreach ($file in Get-ChildItem -LiteralPath $saveHarness -File | Where-Object { $_.Name -match "\.(jsc|log|flag)$" }) {
    $removed += Remove-GeneratedItem -Path $file.FullName
  }
}
foreach ($dir in $GeneratedSaveHarnessDirs) {
  $removed += Remove-GeneratedItem -Path (Join-Path $saveHarness $dir)
}

foreach ($dir in $ExtractedDirs) {
  $removed += Remove-GeneratedItem -Path (Join-Path $ProjectRoot $dir) -AllowRegularDirectory
}

foreach ($dir in $GeneratedDirs) {
  $removed += Remove-GeneratedItem -Path (Join-Path $ProjectRoot $dir) -AllowRegularDirectory
}

foreach ($file in $GeneratedFiles) {
  $removed += Remove-GeneratedItem -Path (Join-Path $ProjectRoot $file)
}

if ($IncludeDependencies) {
  foreach ($dir in $DependencyDirs) {
    $removed += Remove-GeneratedItem -Path (Join-Path $ProjectRoot $dir) -AllowRegularDirectory
  }
}

if ($DryRun) {
  Write-Host "Dry run complete. $removed generated paths would be removed."
} else {
  Write-Host "Runtime generated artifacts cleaned. Removed $removed paths."
}
