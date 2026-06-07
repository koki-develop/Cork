# Components (`src/components/`)

UI under atomic design. Each layer has its own `AGENTS.md` for per-layer detail; this file is the cross-layer contract.

## Tree

- `atoms/` — Single-element primitives. See `atoms/AGENTS.md`.
- `molecules/` — Small compositions of atoms. See `molecules/AGENTS.md`.
- `organisms/` — Self-contained UI blocks, domain-split. See `organisms/AGENTS.md`.
- `templates/` — Layout skeletons with slots. See `templates/AGENTS.md`.
- `pages/` — Wiring layer. See `pages/AGENTS.md`.

## Layer responsibilities

| Layer        | Role                                                                      | Local UI state | `@/api` / `@/hooks`     |
| ------------ | ------------------------------------------------------------------------- | -------------- | ----------------------- |
| `atoms/`     | Single-element primitives. No domain meaning.                             | ❌             | ❌                      |
| `molecules/` | Small compositions of atoms (+ external icons / utilities).               | Minimal        | `@/hooks/ui/*` only     |
| `organisms/` | Self-contained UI blocks. Domain-split (`board/`, `settings/`, `shell/`). | ✅             | ❌ — handlers via props |
| `templates/` | Layout skeletons with slots. No data, no state.                           | ❌             | ❌                      |
| `pages/`     | Wiring layer. Composes templates + organisms with hooks.                  | ✅             | ✅                      |

`App.tsx` (one level up) shares page-tier privileges as the routing root and workspace state hoist point.

## Dependency rules

- Lower layer cannot import upper layer (atoms cannot import molecules etc.).
- Upper layer can skip layers downward (a page can import an atom directly).
- Organisms and below receive Tauri / domain-hook side-effects via props.
- Molecules and organisms may import `@/hooks/ui/*` (UI-infra: `useClickOutside`, `useEscapeKey`, `useAnchorRect`, ...) but NOT top-level domain hooks (`@/hooks/useWorkspace`, etc.).
- Enforced by `.oxlintrc.json` `no-restricted-imports` with per-path `overrides`.
