## Why

Currently, tasks in Cork can only be created with a title, status, and body, but once created there is no way to view or edit the full task body. Users who want to review or modify a task's content must navigate to the underlying Markdown file. Adding a modal-based detail view with inline editing will provide a seamless read/edit experience without leaving the kanban board, matching the expectations of a modern project management tool.

## What Changes

- A new `TaskDetailDialog` organism component that opens as a modal when a kanban card is clicked
- The dialog shows the full task title, status, and body in editable form fields — always editable, no view/edit mode toggle
- Changes are persisted automatically on blur (when a field loses focus), no explicit save button
- A new Tauri backend command `update_task` that can update a task's frontmatter (title, status, order) and body in a single call
- File rename support when the title changes (renames the underlying `.md` file)
- KanbanCard becomes clickable to open the detail modal
- BoardPage wires the detail modal open/close state

## Capabilities

### New Capabilities
- `task-detail-dialog`: Always-editable modal dialog for viewing and editing task title, status, and body, with auto-save on blur
- `backend-update-task`: Tauri command to update task frontmatter + body + file rename in one atomic operation

### Modified Capabilities

- None (no existing specs in this project)

## Impact

- **New frontend component**: `src/components/organisms/board/TaskDetailDialog.tsx`
- **Modified frontend**: `KanbanCard.tsx` (add click handler), `BoardPage.tsx` (wire modal state)
- **New API wrapper**: `src/api/tasks.ts` (add `updateTask` function)
- **New Tauri command**: `src-tauri/src/lib.rs` (add `update_task` command)
- **Modified types**: none required
- **Dependencies**: none new
