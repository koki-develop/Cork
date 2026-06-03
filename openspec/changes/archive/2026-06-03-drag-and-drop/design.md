## Context

The Cork kanban board has a 3+ column layout (dynamic statuses) where each column shows tasks filtered by status. Currently, users change a task's status by clicking "Move to {status}" buttons on each card. The backend (`update_task_status` in Rust) already handles the status update by rewriting the YAML frontmatter of the `.md` file on disk.

The frontend uses React 19 with hooks (`useWorkspace`) and passes data down as props: `Board → Column → Card`. There is no state management library (no Redux, Zustand, etc.).

## Goals / Non-Goals

**Goals:**
- Cards are draggable and can be dropped into any column
- Visual feedback: dragged card follows cursor (ghost), target column highlights when hovered
- On drop, the task's status is persisted via the existing `invoke("update_task_status")`
- The board refreshes after each drop to reflect the change
- Keyboard accessibility: cards can be dragged using keyboard (Space/Enter to pick up, arrow keys to move, Space/Enter to drop)
- The existing "Move to {status}" buttons continue to work as an alternative

**Non-Goals:**
- Reordering cards within a column (sorting is file-name-based)
- Animated card transitions between columns on other users' screens (no real-time sync)
- Drag-and-drop for status reordering in the Settings panel
- Multi-select or dragging multiple cards at once

## Decisions

### Library: `@hello-pangea/dnd` over alternatives

| Alternative | Why rejected |
|---|---|
| `@dnd-kit` | More flexible but requires more code for the same kanban result. No built-in drop animations. Larger API surface. |
| `@atlaskit/pragmatic-drag-and-drop` | Low-level, no built-in sortable or drop indicator. Too much DIY for a 3-column board. |
| `react-beautiful-dnd` | Deprecated, no React 19 support. |

`@hello-pangea/dnd` is the maintained fork of `react-beautiful-dnd` with React 19 support. It provides a simple declarative API (`DragDropContext → Droppable → Draggable`) that maps directly to `Board → Column → Card`. It includes polished drag animations, keyboard accessibility, and screen reader announcements out of the box.

### Component wrapping strategy

Each Column's card container becomes a `Droppable`, and each Card becomes a `Draggable`. When a `Draggable` is dropped into a `Droppable` with a different `droppableId` (the status label), the `onDragEnd` handler in `Board` calls `update_task_status` with the new status.

### Type safety

`@hello-pangea/dnd` types are `any`-based for the `DropResult` type. We'll cast minimally at the integration boundary and keep typed interfaces in the components.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `@hello-pangea/dnd` attaches event listeners to `document` and uses `position: fixed` which may behave unexpectedly inside a Tauri webview | Test in Tauri dev mode (`bun run tauri dev`) early. The library is widely used in Electron/Tauri apps. |
| Smooth drag animations may cause jank in the system webview | The app has a small number of cards (local markdown files). No virtualisation needed. |
| Keyboard drag-and-drop is complex for screen reader users | `@hello-pangea/dnd` ships with built-in ARIA live region announcements. The existing buttons provide a fallback. |
| Conflicts with React Compiler (babel-plugin-react-compiler) | `@hello-pangea/dnd` uses refs internally (stable API). Test with `bun run build` to verify no compiler warnings. |
