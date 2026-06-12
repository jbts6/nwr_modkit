param(
  [string]$GameRoot,
  [string]$InputDir,
  [string]$OutputDir,
  [string]$KeyHex,
  [string]$Password,
  [string]$Salt,
  [string]$IvHex
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "modkit-config.ps1")

if (-not $OutputDir) {
  $OutputDir = Join-Path $ProjectRoot "output\extract\data"
}

$ArgsList = @(
  (Join-Path $PSScriptRoot "extract-data.mjs"),
  "--output", $OutputDir
)

if ($InputDir) {
  $ArgsList += @("--input", $InputDir)
} else {
  $GameRoot = Resolve-Dq2GameRoot -ProjectRoot $ProjectRoot -GameRoot $GameRoot
  Set-Dq2RuntimeEnvironment -ProjectRoot $ProjectRoot -GameRoot $GameRoot
  $ArgsList += @("--game-root", $GameRoot)
}

if ($KeyHex) { $ArgsList += @("--key-hex", $KeyHex) }
if ($Password) { $ArgsList += @("--password", $Password) }
if ($Salt) { $ArgsList += @("--salt", $Salt) }
if ($IvHex) { $ArgsList += @("--iv-hex", $IvHex) }

& node @ArgsList
if ($LASTEXITCODE -ne 0) {
  throw "extract-data.mjs failed with exit code $LASTEXITCODE"
}

$Files = Get-ChildItem -LiteralPath $OutputDir -Filter "*.json" | Where-Object { $_.Name -notlike "_*" }
Write-Host ("Decrypted {0} JSON files to {1}" -f $Files.Count, $OutputDir)
$Files | Select-Object -First 20 Name, Length
