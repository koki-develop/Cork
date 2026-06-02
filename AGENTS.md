# Cork — Kanban board for local Markdown files

## Stack
- **Desktop**: Tauri v2 (Rust backend, system webview)
- **Frontend**: React 19 + TypeScript 5.8 + Vite 7 + Tailwind 4
- **Package manager**: Bun (not npm/pnpm/yarn). Tool versions managed by `mise`.
- **Lint/format**: Biome 2 (replaces ESLint + Prettier). `cargo clippy` for Rust.

## Commands
| Command | What it does |
|---|---|
| `bun run dev` | Vite dev server on port 1420 |
| `bun run build` | `tsc && vite build` (typecheck + bundle) |
| `bun run tauri` | Tauri CLI passthrough (e.g. `bun run tauri dev`, `bun run tauri build`) |
| `bun run format` | `biome check --write src` |
| `bun run preview` | `vite preview` (serve production build) |

## Pre-commit
- `.husky/pre-commit` runs: `gitleaks` (secret scan) → `lint-staged`
- lint-staged runs `biome check --write` on all files + `cargo clippy` on Rust files

## Dependencies
- **Cargo**: `tauri-plugin-fs = { version = "2", features = ["watch"] }` for file watching and fs scope management
- **npm**: `@tauri-apps/plugin-fs` (frontend `watch()` API)

## Architecture
- **`src/`** — React/TS frontend: `main.tsx` (entry), `App.tsx` (root), `Board.tsx` (3 columns), `Column.tsx`, `Card.tsx`, `DirectoryPicker.tsx`, `types.ts`
  - `App.tsx` runs a file watcher via `watch()` from `@tauri-apps/plugin-fs` when a directory is selected. On `.md` file changes it calls `invoke("list_tasks")` to refresh the UI.
- **`src-tauri/src/`** — Rust backend: `lib.rs` (all commands), `main.rs` (entry → `cork_lib::run()`)
  - `AppState` (with `Mutex<Option<String>>`) stores the selected directory path.
- Tauri commands (in `lib.rs`):
  - `select_directory` — picks folder, saves path to `AppState`, registers it in `fs_scope()` via `FsExt::allow_directory`
  - `list_tasks` — reads directory from `AppState` (no arg), lists `.md` files, parses frontmatter
  - `update_task_status` — validates path via `fs::canonicalize` against the selected directory before writing; returns `"Access denied"` on mismatch
- Capabilities: `"fs:default"` + `"fs:allow-watch"` in `capabilities/default.json`
- CSS: Tailwind 4 via `@import "tailwindcss"` in `src/style.css` (no `tailwind.config`, no `@tailwind` directives)

## Tests
No test framework is installed. No CI workflows exist.

## Change workflow
This project uses **OpenSpec** for feature changes:
- Propose: `.opencode/skills/openspec-propose/SKILL.md`
- Implement: `.opencode/skills/openspec-apply-change/SKILL.md`
- Archive: `.opencode/skills/openspec-archive-change/SKILL.md`
- Explore: `.opencode/skills/openspec-explore/SKILL.md`
- Archived changes live in `openspec/changes/archive/`
