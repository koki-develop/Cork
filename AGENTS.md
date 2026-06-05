# Cork — Kanban board for local Markdown files

Frontend = React + atomic design (see `src/AGENTS.md`).
Backend = Tauri v2 + Rust (see `src-tauri/AGENTS.md`).

## Stack

- **Desktop**: Tauri v2 (Rust backend, system webview)
- **Frontend**: React 19 + TypeScript 5.8 + Vite 7 + Tailwind 4
- **Package manager**: Bun (not npm / pnpm / yarn). Tool versions managed by `mise`.
- **Lint / format**: oxlint + oxfmt. `cargo clippy` for Rust.
- **Import restriction rules**: defined in `.oxlintrc.json` with per-path `overrides`.

## Commands

| Command             | What it does                                                               |
| ------------------- | -------------------------------------------------------------------------- |
| `bun run dev`       | Vite dev server on port 1420 (frontend only — Tauri APIs error in browser) |
| `bun run build`     | `tsc && vite build` (full typecheck + bundle)                              |
| `bun run tauri`     | Tauri CLI passthrough (e.g. `bun run tauri dev`, `bun run tauri build`)    |
| `bun run format`    | `oxlint --fix && oxfmt` (lint fix + format)                                |
| `bun run lint`      | `oxlint` (lint check only)                                                 |
| `bun run lint:fix`  | `oxlint --fix` (lint with autofix)                                         |
| `bun run fmt`       | `oxfmt` (format only)                                                      |
| `bun run fmt:check` | `oxfmt --check` (check formatting)                                         |
| `bun run preview`   | `vite preview` (serve production build)                                    |

## Pre-commit

`.husky/pre-commit` runs `gitleaks` (secret scan) → `lint-staged`. lint-staged runs `oxlint --fix` on staged JS/TS files, `oxfmt` on staged files, and `cargo clippy` on Rust files.

## Tests

- **Rust (`src-tauri/`)**: `cargo test` runs unit tests for the testable helpers (frontmatter, security, state, errors, etc.). `#[tauri::command]` bodies and GUI code aren't covered — see `src-tauri/AGENTS.md`.
- **Frontend (`src/`)**: no test framework. Verification of changes is `bunx tsc --noEmit` + `bun run lint` + `bun run fmt:check` + `bun run tauri dev` for visual smoke tests.
- **CI**: none.

## Change workflow

This project uses **OpenSpec** for tracked feature changes. Skills live under `.opencode/skills/openspec-{propose,apply-change,archive-change,explore}/`. Archived changes: `openspec/changes/archive/`.
