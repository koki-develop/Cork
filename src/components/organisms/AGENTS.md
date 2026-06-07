# Organisms (`src/components/organisms/`)

Self-contained UI blocks. Local state allowed. Tauri / domain side-effects come in via props from a page.

## Domain split

- `board/` — Kanban card / column / task dialogs. See `board/AGENTS.md`.
- `settings/` — Settings dialog and its parts. See `settings/AGENTS.md`.
- `shell/` — App-chrome infrastructure (header, modal, popover). Open to all other domains. See `shell/AGENTS.md`.

`board/` ↔ `settings/` cross-import is **forbidden** (per-path `overrides` in `.oxlintrc.json`). `shell/` is open to all.

When you add a new organism domain folder, add a matching `overrides` entry in `.oxlintrc.json` to forbid cross-domain imports.

## Allowed imports

Atoms, molecules, and sibling organisms (the `board/` ↔ `settings/` cross-import is banned; `shell/*` is open to all), plus `@/hooks/ui/*`. No pages / templates, no top-level domain hooks (`useWorkspace`, etc.), no `@/api`, no Tauri (enforced by `.oxlintrc.json`).

## Side-effect placement

dnd-kit's `DragDropProvider` is a UI scope manager and may live in any organism (e.g. `settings/StatusList` owns its own provider because the DnD scope is self-contained). Handlers that perform Tauri side-effects (e.g. persist on drag end) must originate in a page and be passed down as props.
