# TOOLS NOTES

## OVERVIEW

Operational scripts for setup, launching, extraction, encryption, save patching, diagnostics, and index generation. PowerShell wrappers are the user-facing entry points; Node `.mjs` files hold most codecs and data logic.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Resolve game root/config | `modkit-config.ps1`, `modkit-config.mjs` | Supports parent auto-detect, `-GameRoot`, env, and local config. |
| Runtime setup | `setup-runtime.ps1`, `clean-runtime.ps1` | Creates/removes NW runtime links and extracted bytecode. |
| Main launchers | `launch-gui.ps1`, `launch-save-editor.ps1`, `launch-runtime.ps1` | Preferred manual QA surfaces. |
| Data codec | `data-codec.mjs`, `extract-data.mjs`, `encrypt-data.mjs` | AES-192-CBC game data flow. |
| Save codec | `save-codec.mjs`, `extract-saves.mjs`, `encrypt-saves.mjs`, `patch-save.mjs` | LZString/zlib save flow. |
| Key validation | `probe-data-key.mjs`, `trace-loaders.mjs` | Data key and loader tracing. |
| Prison checks | `diagnose-prison-checks.mjs` | CLI guardrail diagnostics for saves. |
| Save editor index | `build-save-editor-index.mjs` | Regenerates browser lookup data. |

## CONVENTIONS

- Keep `.ps1` wrappers usable from the game root and from inside `nwr_modkit` where existing scripts support both.
- Preserve `-GameRoot`, `NWR_GAME_ROOT`, and `config.local.json` resolution paths.
- Preserve `NWR_NPM_REGISTRY` or explicit registry options for dependency install paths.
- Scripts should write generated cleartext to `output/extract/` and repacked data to `output/repack/`; they should not silently overwrite live game files.
- `.mjs` files are ESM even though `tools/package.json` uses CommonJS defaults.

## ANTI-PATTERNS

- Do not convert launcher wrappers into one-off local paths. This install may move.
- Do not remove reports such as `_extract-report.json` or `_repack-report.json`; they are the audit trail for generated output.
- Do not rely on `npm test`; the package contains only the default failing stub.
- Do not hand-copy decrypted data back into `www/data` from scripts without an explicit backup/manual replacement step.

## COMMANDS

```powershell
.\tools\launch-gui.ps1
.\tools\launch-save-editor.ps1
.\tools\setup-runtime.ps1 -Force
.\tools\extract-all.ps1
.\tools\extract-data.ps1 -GameRoot .
.\tools\encrypt-data.ps1
.\tools\extract-saves.ps1 -GameRoot .
.\tools\encrypt-saves.ps1
node .\tools\probe-data-key.mjs --game-root .
node .\tools\diagnose-prison-checks.mjs --game-root .
```
