# NWR MODKIT NOTES

## OVERVIEW

Local tooling project for this game install: save editing, data extraction/encryption, runtime bridge experiments, and documentation. This subtree mixes authored source with generated runtime links and tool output.

## STRUCTURE

```text
nwr_modkit/
|-- app/gui/             # NW GUI modifier; TypeScript source plus generated JS/runtime
|-- app/save-editor/     # browser save editor; React/Vite
|-- runtime/             # manual bridge, save harness, generated state
|-- tools/               # PowerShell launchers and Node codecs/extractors
|-- output/              # generated extract/repack/backup artifacts
|-- docs/                # usage and technical docs
`-- config.example.json  # template for config.local.json
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Current workflow | `README.md` | Primary usage and layout guide. |
| Technical format notes | `docs/` | Save format, data key, probe chain. |
| Per-user game root | `config.local.json` | Ignored; use only when parent auto-detect is not enough. |
| GUI modifier | `app/gui/` | `app.ts` is source; `app.js` is generated build output. |
| Offline save editor | `app/save-editor/` | Pure browser app, normally launched by script. |
| Runtime bridge/probe | `runtime/` | Small authored bridge plus generated harness/state. |
| Data/save scripts | `tools/` | Operational entry points. |
| Extracted cleartext data | `output/extract/` | Generated, inspectable, not source of truth. |

## CONVENTIONS

- Prefer running scripts from the game root with `powershell -NoProfile -ExecutionPolicy Bypass -File .\nwr_modkit\tools\...`.
- If this directory is next to `Game.exe`, tools infer the game root from the parent directory.
- Use `NWR_GAME_ROOT`, `-GameRoot`, or ignored `config.local.json` only when the modkit is moved elsewhere.
- Dependency setup defaults to `https://registry.npmmirror.com`; preserve explicit registry support in scripts.
- Generated runtime links and outputs are documented in `.gitignore`; do not promote them to source.

## ANTI-PATTERNS

- Do not modify the game root `package.json` or `www/index.html` for current modkit flows.
- Do not overwrite live `www/save` from code paths that should export files for manual replacement.
- Do not edit `output/`, `dist/`, `node_modules/`, NW runtime DLL/EXE/PAK files, or probe logs as authored files.
- Do not treat `runtime/save-harness` as normal app source; it is mostly generated probe/runtime material.

## COMMANDS

```powershell
.\tools\launch-gui.ps1
.\tools\launch-save-editor.ps1
.\tools\launch-runtime.ps1
.\tools\setup-runtime.ps1 -Force
.\tools\clean-runtime.ps1
.\tools\extract-data.ps1
.\tools\encrypt-data.ps1
.\tools\extract-saves.ps1
.\tools\encrypt-saves.ps1
node .\tools\probe-data-key.mjs --game-root .
node .\tools\diagnose-prison-checks.mjs --game-root .
```

## NOTES

- There is no real automated test harness; validation is by building targeted apps and driving the launcher/editor/script surface.
- `output/extract/data` is regenerated from encrypted `www/data`; check reports before trusting hand-edited extracted files.
