# Frontend conventions (`src/`)

Per-directory detail lives in each subdirectory's `AGENTS.md`. This file is the trunk: the tree, the rules that span directories, and the styling layer.

## Tree

- `api/` — Tauri command wrappers (the only place that calls `invoke()` / `listen()`). See `api/AGENTS.md`.
- `lib/` — Pure helpers (no React, no Tauri). See `lib/AGENTS.md`.
- `hooks/` — Stateful React hooks. Domain vs UI-infra split. See `hooks/AGENTS.md`.
- `types/` — Domain types shared across layers. See `types/AGENTS.md`.
- `components/` — UI under atomic design. See `components/AGENTS.md`.
- `App.tsx` — Routing root. Calls `useCurrentDir` and routes between `WelcomePage` and `BoardPage`. Owns `dir` only; workspace state lives inside `BoardPage`.
- `main.tsx` — React entry. Default-imports `App`.

## Path alias

`@/* → src/*` (configured in `tsconfig.json` `compilerOptions.paths` + `vite.config.ts` `resolve.alias`). Use `@/...` for cross-layer imports; relative paths (`./Foo`) only for same-folder siblings.

## Export style

Named exports throughout. **The one exception is `App.tsx`** — it keeps `export default` because `main.tsx` uses default import. Barrels (`index.ts`) re-export named items plus type re-exports: `export { Foo, type FooProps } from "./Foo"`.

## File-vs-folder

1 component / hook = 1 file by default. Promote to a same-name folder (`Button.tsx` → `Button/Button.tsx` + `Button/index.ts`) only when adding tests, sub-components, or a co-located hook.

## Side-effect boundary

| API                                | Allowed in                                 |
| ---------------------------------- | ------------------------------------------ |
| `@tauri-apps/api/core` (`invoke`)  | `src/api/` only                            |
| `@tauri-apps/api/event` (`listen`) | `src/api/` only                            |
| `@tauri-apps/plugin-fs` (`watch`)  | `src/hooks/` and `src/api/` only           |
| Project hooks (`@/hooks/*`)        | `App.tsx` and `src/components/pages/` only |

Enforced by `.oxlintrc.json` (`no-restricted-imports` + per-path `overrides`). The atomic-design layer-vs-layer rules live in `components/AGENTS.md`.

## Styling

Tailwind 4 via `@import "tailwindcss"` in `style.css` — no `tailwind.config`, no `@tailwind` directives. Project tokens are CSS variables defined in `@theme {}` and used as `cork-*` utility classes (e.g. `bg-cork-surface`, `text-cork-muted`).
