## Why

Statuses can currently only be reordered through the Settings panel using up/down arrow buttons. This is cumbersome and indirect — users must open a modal, click arrows repeatedly, and save. Since the board already uses drag-and-drop for task cards (via `@dnd-kit/react`), extending the same interaction to column headers for reordering statuses is a natural UX improvement that makes the board fully interactive.

## What Changes

- Board column headers become draggable — users can grab a column header (the grip icon area) and drag it left or right to reorder statuses
- The new column order is persisted to the backend store (reusing the existing `save_statuses` command)
- Settings panel retains its up/down arrow reordering as a secondary method
- Column drag reordering becomes the primary, direct manipulation method

## Capabilities

### New Capabilities
- `column-drag-reorder`: Allow users to reorder board columns (statuses) by dragging column headers horizontally

### Modified Capabilities

None — no existing specs to modify.

## Impact

- **Board.tsx**: Add sortable context for columns using `@dnd-kit/react`; distinguish between column drag (reorder statuses) and card drag (move tasks between statuses)
- **Column.tsx**: Make column header a draggable handle using `useDraggable` (sorted) or equivalent sortable primitive from `@dnd-kit/react`
- **useWorkspace.ts**: Add `reorderStatuses` method that calls `invoke("save_statuses")` with the new order
- **Dependencies**: No new dependencies required — `@dnd-kit/react` v0.4.0 and `@dnd-kit/helpers` v0.4.0 are already present
- **Rust backend**: No changes needed — `save_statuses` command already accepts `Vec<StatusEntry>`
