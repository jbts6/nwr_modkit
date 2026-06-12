param(
  [string]$GameRoot,
  [string]$InputDir,
  [string]$OutputDir
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "modkit-config.ps1")

if (-not $OutputDir) {
  $OutputDir = Join-Path $ProjectRoot "output\extract\js-bytecode"
}

$ArgsList = @(
  (Join-Path $PSScriptRoot "extract-js-bytecode.mjs"),
  "--output", $OutputDir
)

if ($InputDir) {
  $ArgsList += @("--input", $InputDir)
} else {
  $GameRoot = Resolve-Dq2GameRoot -ProjectRoot $ProjectRoot -GameRoot $GameRoot
  Set-Dq2RuntimeEnvironment -ProjectRoot $ProjectRoot -GameRoot $GameRoot
  $ArgsList += @("--game-root", $GameRoot)
}

& node @ArgsList
if ($LASTEXITCODE -ne 0) {
  throw "extract-js-bytecode.mjs failed with exit code $LASTEXITCODE"
}

Get-ChildItem -LiteralPath $OutputDir -Recurse -File |
  Where-Object { $_.Name -ne "_js-report.json" } |
  Select-Object -First 30 FullName, Length
