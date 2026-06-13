# Cork — Kanban board for local Markdown files

Frontend = React + atomic design (see `src/AGENTS.md`).
Backend = Tauri v2 + Rust (see `src-tauri/AGENTS.md`).
CLI = the `cork` command, a separate lean Rust crate shipped **inside** the app bundle. `cork` opens a new window; `cork <dir>` opens (or focuses) that workspace. It works by launching the app binary and letting `tauri-plugin-single-instance` forward argv to the running instance (see `src-tauri/AGENTS.md` → "CLI distribution" and "CLI behavior").
Multi-window: a single process can host any number of windows, each with its own workspace. The `File > New Window` menu / `Cmd+Shift+N` opens an empty welcome window, the macOS Dock-reopen path restores the last-used workspace into a fresh window, and the `cork` CLI opens a new / workspace-seeded window. Per-window state lives in `AppState` keyed by `WebviewWindow::label()`; see `src-tauri/AGENTS.md` for the state model.

## Stack

- **Desktop**: Tauri v2 (Rust backend, system webview)
- **Frontend**: React 19 + TypeScript 5.8 + Vite 7 + Tailwind 4
- **Package manager**: Bun (not npm / pnpm / yarn). Tool versions managed by `mise`.
- **Lint / format**: oxlint + oxfmt. `cargo clippy` for Rust.
- **Import restriction rules**: defined in `.oxlintrc.json` with per-path `overrides`.

## Commands

| Command                 | What it does                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run dev`           | Vite dev server on port 1420 (frontend only — Tauri APIs error in browser)                                                                                               |
| `bun run build`         | `tsc && vite build` (full typecheck + bundle)                                                                                                                            |
| `bun run build:sidecar` | Build the `cork` CLI and stage it as a Tauri sidecar (`src-tauri/binaries/cork-cli-<triple>`). Run automatically by `tauri dev` / `tauri build` via the before-commands. |
| `bun run tauri`         | Tauri CLI passthrough (e.g. `bun run tauri dev`, `bun run tauri build`)                                                                                                  |
| `bun run format`        | `oxlint --fix && oxfmt` (lint fix + format)                                                                                                                              |
| `bun run lint`          | `oxlint` (lint check only)                                                                                                                                               |
| `bun run lint:fix`      | `oxlint --fix` (lint with autofix)                                                                                                                                       |
| `bun run fmt`           | `oxfmt` (format only)                                                                                                                                                    |
| `bun run fmt:check`     | `oxfmt --check` (check formatting)                                                                                                                                       |
| `bun run preview`       | `vite preview` (serve production build)                                                                                                                                  |

## Pre-commit

`.husky/pre-commit` runs `gitleaks` (secret scan) → `lint-staged`. lint-staged runs `oxlint --fix` on staged JS/TS files, `oxfmt` on staged files, and `cargo clippy` on Rust files.

## Tests

- **Rust (`src-tauri/`)**: `cargo test` runs unit tests for the testable helpers (frontmatter, security, state, errors, etc.). `#[tauri::command]` bodies and GUI code aren't covered — see `src-tauri/AGENTS.md`.
- **Frontend (`src/`)**: no test framework. Verification of changes is `bunx tsc --noEmit` + `bun run lint` + `bun run fmt:check` + `bun run tauri dev` for visual smoke tests.
- **CI**: `.github/workflows/ci.yml` runs `bun run lint` and `bun run tauri build --no-bundle` on push to `main` and on PRs (no test run).

## Change workflow

This project uses **OpenSpec** for tracked feature changes. Skills live under `.opencode/skills/openspec-{propose,apply-change,archive-change,explore}/`. Archived changes: `openspec/changes/archive/`.
