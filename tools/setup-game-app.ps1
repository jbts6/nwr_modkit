param(
  [string]$GameRoot,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "modkit-config.ps1")
$GameRoot = Resolve-Dq2GameRoot -ProjectRoot $ProjectRoot -GameRoot $GameRoot
$AppRoot = Join-Path $ProjectRoot "runtime\game-app"
New-Item -ItemType Directory -Path $AppRoot -Force | Out-Null

$RuntimeFiles = @(
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
  "package.json",
  "resources.pak",
  "v8_context_snapshot.bin",
  "bg_script",
  "loading"
)

foreach ($file in $RuntimeFiles) {
  $source = Join-Path $GameRoot $file
  $dest = Join-Path $AppRoot $file
  if (-not (Test-Path -LiteralPath $source)) {
    throw "source file missing: $source"
  }
  if ((Test-Path -LiteralPath $dest) -and $Force) {
    Remove-Item -LiteralPath $dest -Force
  }
  if (-not (Test-Path -LiteralPath $dest)) {
    try {
      New-Item -ItemType HardLink -Path $dest -Target $source -ErrorAction Stop | Out-Null
    } catch {
      Copy-Item -LiteralPath $source -Destination $dest -Force
    }
  }
}

foreach ($dir in @("locales", "swiftshader", "www")) {
  $source = Join-Path $GameRoot $dir
  $dest = Join-Path $AppRoot $dir
  if (-not (Test-Path -LiteralPath $source)) { continue }
  if ((Test-Path -LiteralPath $dest) -and $Force) {
    $item = Get-Item -LiteralPath $dest -Force
    if ($item.LinkType) {
      [System.IO.Directory]::Delete($item.FullName, $false)
    } else {
      throw "Refusing to remove non-link directory: $dest"
    }
  }
  if (-not (Test-Path -LiteralPath $dest)) {
    New-Item -ItemType Junction -Path $dest -Target $source | Out-Null
  }
}

Write-Host "Prepared app root: $AppRoot"
