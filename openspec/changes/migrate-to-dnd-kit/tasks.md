## 1. Dependency management

- [x] 1.1 Run `bun remove @hello-pangea/dnd` to remove the old dependency
- [x] 1.2 Run `bun add @dnd-kit/react @dnd-kit/helpers` to install new dependencies
- [x] 1.3 Run `bun install` to verify lockfile is consistent

## 2. Update Board.tsx — DragDropProvider

- [x] 2.1 Replace `import { DragDropContext, type DropResult } from "@hello-pangea/dnd"` with `import { DragDropProvider } from "@dnd-kit/react"`
- [x] 2.2 Replace `<DragDropContext>` wrapper with `<DragDropProvider>`
- [x] 2.3 Rewrite `handleDragEnd` to use the new event shape: `event.operation.source.id` for `draggableId` and `event.operation.target?.id` for the target status
- [x] 2.4 Add null check for `event.canceled` and `event.operation.target` in the handler

## 3. Update Column.tsx — useDroppable hook

- [x] 3.1 Replace `import { Droppable } from "@hello-pangea/dnd"` with `import { useDroppable } from "@dnd-kit/react"`
- [x] 3.2 Call `useDroppable({ id: title, accept: 'card' })` at the top of the Column component
- [x] 3.3 Attach `ref` to the card container div
- [x] 3.4 Add `isDropTarget` class-based styling for visual feedback when a card hovers over the column
- [x] 3.5 Remove the `<Droppable>` wrapper and `provided.placeholder`

## 4. Update Card.tsx — useDraggable hook

- [x] 4.1 Replace `import { Draggable } from "@hello-pangea/dnd"` with `import { useDraggable } from "@dnd-kit/react"`
- [x] 4.2 Call `useDraggable({ id: task.id, type: 'card' })` at the top of the Card component
- [x] 4.3 Attach `ref` to the card's root div
- [x] 4.4 The entire card is the drag handle (no `handleRef` needed — `ref` on the root div is sufficient)
- [x] 4.5 Remove the GripHorizontal icon and its import
- [x] 4.6 Remove the `<Draggable>` render-prop wrapper
- [x] 4.7 Remove the `index` prop from Card (no longer needed without Draggable's index)

## 5. Verify

- [x] 5.1 Run `bun run build` (tsc + vite build) to confirm zero type errors
- [ ] 5.2 Run `bun run tauri dev` to manually test drag-and-drop between columns, keyboard accessibility, and Escape-to-cancel behavior (manual - verify in Tauri webview)
