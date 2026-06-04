## 1. Rust Backend

- [x] 1.1 Add `create_task` command in `src-tauri/src/lib.rs` with canonicalize security check
- [x] 1.2 Register `create_task` in `tauri::generate_handler!` list

## 2. Frontend API

- [x] 2.1 Add `createTask` wrapper in `src/api/tasks.ts`
- [x] 2.2 Re-export `createTask` from `src/api/index.ts`

## 3. State Management

- [x] 3.1 Add `createTask` method to `useWorkspace` hook with optimistic update

## 4. UI — CreateTaskDialog Organism

- [x] 4.1 Create `src/components/organisms/board/CreateTaskDialog.tsx` with form (title, status dropdown, body textarea, Create/Cancel buttons)
- [x] 4.2 Export `CreateTaskDialog` from `src/components/organisms/board/index.ts`

## 5. UI — Wiring

- [x] 5.1 Add "+" button at the top of each `KanbanColumn` body area (pass `onCreateTask` callback + status label as props)
- [x] 5.2 Wire `CreateTaskDialog` + dialog state (including preselected status from column) + keyboard shortcut in `BoardPage`
- [x] 5.3 Pass `createTask` through `App.tsx` → `BoardPage` → `KanbanColumn`
- [x] 5.4 Add board domain override in `biome.json` if needed for `CreateTaskDialog` imports

## 6. Verification

- [x] 6.1 Run `bunx tsc --noEmit` and `bunx biome check src` to verify typecheck + lint
- [x] 6.2 Run `cargo clippy` for Rust lint
- [x] 6.3 Run `bun run tauri dev` for visual smoke test
