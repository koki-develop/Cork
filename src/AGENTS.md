# Frontend conventions (`src/`)

## Path alias

`@/* → src/*` (configured in `tsconfig.json` `compilerOptions.paths` + `vite.config.ts` `resolve.alias`). Use `@/...` for cross-layer imports; relative paths (`./Foo`) only for same-folder siblings.

## Export style

Named exports throughout. **The one exception is `App.tsx`** — it keeps `export default` because `main.tsx` uses default import. Barrels (`index.ts`) re-export named items plus type re-exports: `export { Foo, type FooProps } from "./Foo"`.

## File-vs-folder

1 component = 1 file by default. Promote to a same-name folder (`Button.tsx` → `Button/Button.tsx` + `Button/index.ts`) only when adding tests, sub-components, or a co-located hook.

## Side-effect boundary

| API                                | Allowed in                                 |
| ---------------------------------- | ------------------------------------------ |
| `@tauri-apps/api/core` (`invoke`)  | `src/api/` only                            |
| `@tauri-apps/api/event` (`listen`) | `src/api/` only                            |
| `@tauri-apps/plugin-fs` (`watch`)  | `src/hooks/` and `src/api/` only           |
| Project hooks (`@/hooks/*`)        | `App.tsx` and `src/components/pages/` only |

Enforced by `.oxlintrc.json` (`no-restricted-imports` + per-path `overrides`).

## Tree

- `api/` — thin Tauri command wrappers (`invoke()` / `listen()` only here)
- `lib/` — pure helpers (no React, no Tauri, no `@/api`)
- `hooks/` — stateful React hooks; allowed to call `@/api` + `@/lib`
- `types/` — domain types
- `components/` — UI (atomic design; see `components/AGENTS.md`)
- `App.tsx` — routing root; calls `useWorkspace` and routes between pages

## Styling

Tailwind 4 via `@import "tailwindcss"` in `style.css` — no `tailwind.config`, no `@tailwind` directives. Project tokens are CSS variables defined in `@theme {}` and used as `cork-*` utility classes (e.g. `bg-cork-surface`, `text-cork-muted`).
