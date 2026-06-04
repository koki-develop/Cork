# Cork — Kanban board for local Markdown files

Frontend = React + atomic design (see `src/AGENTS.md`).
Backend = Tauri v2 + Rust (see `src-tauri/AGENTS.md`).

## Stack

- **Desktop**: Tauri v2 (Rust backend, system webview)
- **Frontend**: React 19 + TypeScript 5.8 + Vite 7 + Tailwind 4
- **Package manager**: Bun (not npm / pnpm / yarn). Tool versions managed by `mise`.
- **Lint / format**: Biome 2 (replaces ESLint + Prettier). `cargo clippy` for Rust.

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | Vite dev server on port 1420 (frontend only — Tauri APIs error in browser) |
| `bun run build` | `tsc && vite build` (full typecheck + bundle) |
| `bun run tauri` | Tauri CLI passthrough (e.g. `bun run tauri dev`, `bun run tauri build`) |
| `bun run format` | `biome check --write src` |
| `bun run preview` | `vite preview` (serve production build) |

## Pre-commit

`.husky/pre-commit` runs `gitleaks` (secret scan) → `lint-staged`. lint-staged runs `biome check --write` on staged files + `cargo clippy` on Rust files.

## Tests

No test framework. No CI. Verification of changes is `bunx tsc --noEmit` + `bunx biome check src` + `bun run tauri dev` for visual smoke tests.

## Change workflow

This project uses **OpenSpec** for tracked feature changes. Skills live under `.opencode/skills/openspec-{propose,apply-change,archive-change,explore}/`. Archived changes: `openspec/changes/archive/`.
