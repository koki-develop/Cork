## Context

Cork uses Tauri v2 with a React/TypeScript frontend following atomic design. Tasks are Markdown files in a workspace directory. Currently there is no in-app deletion — users must manually remove `.md` files via the OS file manager.

`TaskDetailDialog` handles task editing and is wired through `BoardPage` (owns side-effect handlers) → props. `IconButton` and `Select` are the primary interaction atoms/molecules. `Select.tsx` already implements a click-outside + Escape dropdown pattern that `DropdownMenu` will replicate.

## Goals / Non-Goals

**Goals:**

- Allow users to delete a task from the task detail dialog via a menu button
- Confirm before deletion (irreversible — deletes the `.md` file permanently)
- Show success feedback via toast
- Add a reusable `DropdownMenu` molecule for future use

**Non-Goals:**

- Undo / restore deleted tasks
- Deleting multiple tasks at once
- Delete action from the Kanban card (only from the detail dialog)
- A generic `ConfirmDialog` molecule (existing `Modal` is sufficient; extract if a second use-case appears)

## Decisions

### DropdownMenu as a reusable molecule

The trigger + panel dropdown pattern is identical to `Select.tsx`. Extracting it as `molecules/DropdownMenu.tsx`:

- Keeps `TaskDetailDialog` focused on task editing logic
- Follows atomic design (molecules compose atoms + Lucide icons)
- Enables future reuse on `KanbanCard` or other organisms

**Alternative considered:** Inline dropdown state inside `TaskDetailDialog`. Rejected — conflates editing state with action-menu state, and makes the organism harder to follow.

### Re-use existing `Modal` for confirmation

The confirmation dialog uses the existing `Modal` component nested inside `TaskDetailDialog`. No new `ConfirmDialog` molecule today (YAGNI).

**Alternative considered:** Browser `confirm()`. Rejected — breaks visual design consistency and ignores the cork-\* design system.

### Z-index strategy

- `DropdownMenu` panel: `z-20` (absolute, within modal's content area)
- Confirmation modal: uses existing `Modal` at `z-50` (fixed); renders later in DOM than the outer modal, so naturally stacks on top

The outer `Modal` has `overflow-y-auto` (not `overflow: hidden`), so the absolutely-positioned dropdown is not clipped.

### Delete button placement in DropdownMenu

The Delete item uses `danger` color (red-400 text, red-500/10 hover background) to signal a destructive action — consistent with the existing `Button` `color="danger"` pattern. The item includes a `Trash2` icon.

### Loading state on confirm button

The Delete confirm button is disabled and shows a loading state during the async `delete_task` call, preventing double-submission (per UX interaction guidelines).

### Post-deletion flow

On success: close both the confirmation modal and the detail dialog, then emit `toast.success("Task deleted")`. The board re-renders via the existing file-watch mechanism in `useWorkspace`.

### Header layout

The dialog header becomes: `[Task heading] ... [DropdownMenu trigger] [Close button]` — both action buttons grouped on the right side as `flex items-center gap-1`.

## Risks / Trade-offs

- [Nested Modal z-index] If a future component renders at `z-50` after the outer modal, the confirmation modal could be obscured → keep a documented z-index scale; promote to `z-[60]` if nesting becomes an issue
- [DropdownMenu overflow] If the modal is scrolled such that the header is near the bottom of the visible area, the dropdown panel may be clipped by the `overflow-y-auto` container → acceptable for now given the typical dialog height (max-h: 85vh) and top-of-content header position
