## 1. Backend: Update task command

- [x] 1.1 Add `update_task` Tauri command in `src-tauri/src/lib.rs` that accepts `path`, optional `title`, `status`, `body`; handles file rename when title changes with conflict check; returns updated `Task`
- [x] 1.2 Register `update_task` in `generate_handler![]` and add `updateTask` wrapper in `src/api/tasks.ts`
- [x] 1.3 Verify `update_task` follows security model: canonicalize path, check workspace boundary, reject access denied
- [x] 1.4 Add `updateTask` method in `src/hooks/useWorkspace.ts`: calls `updateTaskApi`, performs optimistic local state updates (instant status column move, instant body/title update), reloads tasks on title change to reconcile IDs

## 2. Frontend: Task detail dialog (always editable, auto-save on blur)

- [x] 2.1 Create `src/components/organisms/board/TaskDetailDialog.tsx` with editable form fields: `Input` for title, `Select` for status, `<textarea>` for body; no view/edit toggle, no save button
- [x] 2.2 Wire auto-save: title/body save on `onBlur`, status saves on `onChange`; skip save if value unchanged; single `isSaving` flag prevents race conditions; handleClose saves dirty fields before closing
- [x] 2.3 Handle errors during auto-save with toast notification
- [x] 2.4 Re-export `TaskDetailDialog` from `src/components/organisms/board/index.ts`

## 3. Frontend: Card click wiring

- [x] 3.1 Add optional `onClick` prop to `KanbanCard` component and attach it to the card's root div
- [x] 3.2 In `BoardPage`, add `detailDialogTaskId` state, `openDetailDialog`/`closeDetailDialog` handlers
- [x] 3.3 Pass `onClick` to `KanbanCard` that opens detail dialog for that task
- [x] 3.4 Add `handleSaveTask` in `BoardPage` that calls `useWorkspace.updateTask` (optimistic update + persist via `update_task` API); pass as `onSaveTask` prop to `TaskDetailDialog`
- [x] 3.5 Render `TaskDetailDialog` in `BoardPage`, passing `task` by ID lookup, `statuses`, and save/close handlers

## 4. Verification

- [x] 4.1 Run `bunx tsc --noEmit` to type-check all changes
- [x] 4.2 Run `bunx biome check src` to verify lint rules
- [x] 4.3 Run `cargo clippy` in `src-tauri/` for Rust lint
- [x] 4.4 Manual smoke test: click card → edit fields inline → blur to save → verify card updates on board
