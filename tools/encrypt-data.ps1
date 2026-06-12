param(
  [string]$InputDir,
  [string]$OutputDir,
  [string[]]$Files,
  [string]$KeyHex,
  [string]$Password,
  [string]$Salt,
  [string]$IvHex
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $InputDir) {
  $InputDir = Join-Path $ProjectRoot "output\extract\data"
}
if (-not $OutputDir) {
  $OutputDir = Join-Path $ProjectRoot "output\repack\data"
}

$ArgsList = @(
  (Join-Path $PSScriptRoot "encrypt-data.mjs"),
  "--input", $InputDir,
  "--output", $OutputDir
)

if ($Files -and $Files.Count -gt 0) { $ArgsList += @("--files", ($Files -join ",")) }
if ($KeyHex) { $ArgsList += @("--key-hex", $KeyHex) }
if ($Password) { $ArgsList += @("--password", $Password) }
if ($Salt) { $ArgsList += @("--salt", $Salt) }
if ($IvHex) { $ArgsList += @("--iv-hex", $IvHex) }

& node @ArgsList
if ($LASTEXITCODE -ne 0) {
  throw "encrypt-data.mjs failed with exit code $LASTEXITCODE"
}

$OutFiles = Get-ChildItem -LiteralPath $OutputDir -Filter "*.json" | Where-Object { $_.Name -notlike "_*" }
Write-Host ("Encrypted {0} JSON files to {1}" -f $OutFiles.Count, $OutputDir)
$OutFiles | Select-Object -First 20 Name, Length
