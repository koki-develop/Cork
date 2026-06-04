## Why

Cork is a Kanban board for local Markdown files, but users currently cannot create new tasks from within the app — it is read-only beyond reordering and renaming. To be a productive daily-driver tool, users must be able to create tasks without leaving the app or manually writing `.md` files.

## What Changes

### New Capabilities

- **Rust backend**: Add `create_task` Tauri command that writes a new `.md` file with YAML frontmatter (`status`, `order`) to the workspace directory.
- **API layer**: Add `createTask` wrapper in `src/api/tasks.ts` and re-export it.
- **State management**: Add `createTask` method to `useWorkspace` hook with optimistic update.
- **UI — CreateTaskDialog**: A new organism (`src/components/organisms/board/CreateTaskDialog.tsx`) using the existing `Modal` component, with fields for title (required), status (dropdown from workspace statuses), and body (optional textarea).
- **UI — Trigger**: A "+" button at the top of each `KanbanColumn` body area (below the column header). Clicking it pre-selects that column's status in the dialog.
- **Keyboard shortcut**: Support `Cmd+N` / `Ctrl+N` to open the dialog.

### Modified Capabilities

- None. No existing capability changes at the spec level.

## Impact

| Area | What changes |
|---|---|
| `src-tauri/src/lib.rs` | New `create_task` command + handler registration |
| `src/api/tasks.ts` + `index.ts` | New `createTask` wrapper export |
| `src/hooks/useWorkspace.ts` | New `createTask` method |
| `src/App.tsx` | Pass `createTask` to `BoardPage` |
| `src/components/pages/BoardPage.tsx` | Wire `createTask` + dialog state + preselected status + keyboard shortcut |
| `src/components/organisms/board/KanbanColumn.tsx` | Add "+" trigger button |
| `src/components/organisms/board/` | New `CreateTaskDialog.tsx` + barrel export |
| `src-tauri/capabilities/default.json` | May need to verify fs write permissions |

No new external dependencies. Reuses existing `Modal`, `Button`, `Input`, `Heading`, `Text`, `ErrorBanner` components.
