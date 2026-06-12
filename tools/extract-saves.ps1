param(
  [string]$GameRoot,
  [string]$NpmRegistry
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "modkit-config.ps1")
$GameRoot = Resolve-Dq2GameRoot -ProjectRoot $ProjectRoot -GameRoot $GameRoot
Set-Dq2RuntimeEnvironment -ProjectRoot $ProjectRoot -GameRoot $GameRoot

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "node_modules"))) {
  $npmCommand = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
  if (-not $npmCommand) {
    $npmCommand = (Get-Command npm -ErrorAction Stop).Source
  }
  $registry = if ($NpmRegistry) { $NpmRegistry } elseif ($env:NWR_NPM_REGISTRY) { $env:NWR_NPM_REGISTRY } elseif ($env:DQ2_NPM_REGISTRY) { $env:DQ2_NPM_REGISTRY } else { "https://registry.npmmirror.com" }
  Push-Location $PSScriptRoot
  try {
    & $npmCommand install --omit=dev --registry $registry
    if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}

& node (Join-Path $PSScriptRoot "extract-saves.mjs") --game-root $GameRoot
if ($LASTEXITCODE -ne 0) {
  throw "extract-saves.mjs failed with exit code $LASTEXITCODE"
}

$OutDir = Join-Path $ProjectRoot "output\extract\save"
Get-ChildItem -LiteralPath $OutDir | Select-Object Name, Length
