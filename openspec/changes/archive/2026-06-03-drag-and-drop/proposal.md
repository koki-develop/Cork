## Why

Tasks on the kanban board currently require clicking "Move to {status}" buttons to change their column. This is cumbersome compared to the direct manipulation of drag-and-drop, which is the expected UX for kanban-style boards. Adding DnD will make task re-categorization intuitive and fast.

## What Changes

- Cards become draggable within and between columns
- Columns act as drop targets
- When a card is dropped on a different column, the task status is updated via `invoke("update_task_status")` and the board refreshes
- Visual feedback during drag: card ghost follows cursor, columns highlight when hovered as valid drop targets
- The existing "Move to {status}" buttons are preserved as an alternative interaction method
- `@hello-pangea/dnd` (v18+) is added as a new dependency

## Capabilities

### New Capabilities
- `card-drag-and-drop`: Drag cards between columns to change their status, with visual feedback and keyboard accessibility

### Modified Capabilities

None. No existing capabilities are changing at the spec level.

## Impact

- **New dependency**: `@hello-pangea/dnd` (~30KB gzipped)
- **Modified components**: `Board.tsx` (wrap in `DragDropContext`), `Column.tsx` (wrap card list in `Droppable`), `Card.tsx` (wrap in `Draggable`)
- **Modified hook**: `useWorkspace.ts` (no change needed — `invoke("update_task_status")` already exists)
- **No backend changes**: The existing Rust `update_task_status` command handles the status update logic; no new Tauri commands needed
