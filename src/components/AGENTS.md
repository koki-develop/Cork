# Component rules (atomic design)

## Layer responsibilities

| Layer        | Role                                                                      | Local UI state | `@/api` / `@/hooks`     |
| ------------ | ------------------------------------------------------------------------- | -------------- | ----------------------- |
| `atoms/`     | Single-element primitives. No domain meaning.                             | ❌             | ❌                      |
| `molecules/` | Small compositions of atoms (+ external icons / utilities).               | Minimal        | `@/hooks/ui/*` only     |
| `organisms/` | Self-contained UI blocks. Domain-split (`board/`, `settings/`, `shell/`). | ✅             | ❌ — handlers via props |
| `templates/` | Layout skeletons with slots. No data, no state.                           | ❌             | ❌                      |
| `pages/`     | Wiring layer. Composes templates + organisms with hooks.                  | ✅             | ✅                      |

`App.tsx` (one level up) shares page-tier privileges as the routing root and workspace state hoist point.

## Organism domains

- `board/` — Kanban card / column
- `settings/` — Settings dialog and its parts
- `shell/` — App-chrome infrastructure (header, modal). Importable from any domain.

**`board/` ↔ `settings/` cross-import is forbidden.** `shell/` is open to all.

## Dependency rules

- Lower layer cannot import upper layer (atoms cannot import molecules etc.)
- Upper layer can skip layers downward (a page can import an atom directly)
- Organisms and below receive Tauri / domain-hook side-effects via props
- Molecules and organisms may import `@/hooks/ui/*` (UI-infra: `useClickOutside`, `useEscapeKey`, `useAnchorRect`) but NOT top-level domain hooks (`@/hooks/useWorkspace`, etc.)
- Enforced by `.oxlintrc.json` `no-restricted-imports` with per-path `overrides`

When you add a new organism domain folder, add a matching `overrides` entry in `.oxlintrc.json` to forbid cross-domain imports.

## `pages/BoardPage` is the orchestration hub

It is the **single caller** of `useWorkspace`, `useBoardDragState`, and `useStatusEdit`, and the **owner of**:

- `settingsOpen` state
- The `menu:open-settings` event subscription (the native `Cmd+,` shortcut)
- The board-scoped `DragDropProvider`

`App.tsx` owns only `dir` (via `useCurrentDir`) and routes between `WelcomePage` and `BoardPage`. `BoardPage` is keyed on `dir` so workspace switches remount cleanly. Status-list DnD has its own `DragDropProvider` inside `organisms/settings/StatusList` because the scope is self-contained there.

## Tauri side-effect handler placement

dnd-kit `DragDropProvider` itself is a UI scope manager and may live in any organism. Handlers that perform Tauri side-effects (e.g. persist on drag end) must originate in a page and be passed down as props.
