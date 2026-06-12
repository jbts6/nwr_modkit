# SAVE EDITOR NOTES

## OVERVIEW

Independent React/Vite offline save editor. It edits local `.rpgsave` files in the browser without launching the game or using the NW runtime.

## STRUCTURE

```text
app/save-editor/
|-- src/                  # authored React and codec source
|-- public/               # generated/static data index assets
|-- dist/                 # generated Vite build output
|-- package.json          # dev/build/preview scripts
`-- vite.config.ts
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| File load/export flow | `src/App.tsx` | Coordinates editor mode, JSON export, save export, guard checks. |
| Structured save UI | `src/SimpleEditor.tsx` | Tabs for variables, switches, inventory, actors, skills. |
| Save codec | `src/codec.ts` | `LZString Base64 -> zlib deflate -> JSON` and reverse. |
| Prison-risk guardrails | `src/prisonGuards.ts` | Hard export blockers and one-click repair values. |
| Browser entry | `src/main.tsx`, `index.html` | Vite app bootstrap. |
| Launcher | `../../tools/launch-save-editor.ps1` | Opens `http://127.0.0.1:5176/` by default. |

## CONVENTIONS

- Preserve strict TypeScript build behavior: `npm.cmd run build` runs `tsc -b` before Vite.
- Export is intentionally blocked when `hasBlockingPrisonRisk(report)` finds hard prison risks.
- One-click guard repair restores safe values or adds a required item; it does not remove actors from the party.
- `public/game-data-index.json` is ignored generated lookup data, not hand-written UI logic.

## ANTI-PATTERNS

- Do not weaken prison guard checks to make export easier.
- Do not edit `dist/` as source.
- Do not overwrite live saves from this app; exported files should be manually placed after backup/verification.
- Do not add server-side assumptions. The editor is designed to process local files in the browser.

## COMMANDS

```powershell
cd .\nwr_modkit\app\save-editor
npm.cmd install --registry https://registry.npmmirror.com
npm.cmd run dev
npm.cmd run build
npm.cmd run preview

cd ..\..
.\tools\launch-save-editor.ps1
.\tools\launch-save-editor.ps1 -Port 5177
```
