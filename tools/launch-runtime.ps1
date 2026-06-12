param(
  [string]$GameRoot,
  [switch]$BgBridgeManual,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "modkit-config.ps1")
$GameRoot = Resolve-Dq2GameRoot -ProjectRoot $ProjectRoot -GameRoot $GameRoot
Set-Dq2RuntimeEnvironment -ProjectRoot $ProjectRoot -GameRoot $GameRoot

if ($BgBridgeManual) {
  & (Join-Path $PSScriptRoot "launch-bg-bridge-runtime.ps1") -GameRoot $GameRoot -PrepareOnly -Force:$Force
  return
}

Write-Host "No runtime route switch supplied; preparing manual background bridge."
& (Join-Path $PSScriptRoot "launch-bg-bridge-runtime.ps1") -GameRoot $GameRoot -PrepareOnly -Force:$Force
