## 1. Install dependency

- [x] 1.1 Run `bun add @hello-pangea/dnd@^18` to install the library

## 2. Update Board.tsx — add DragDropContext

- [x] 2.1 Import `DragDropContext` from `@hello-pangea/dnd`
- [x] 2.2 Wrap the columns container in `<DragDropContext onDragEnd={handleDragEnd}>`
- [x] 2.3 Implement `handleDragEnd` that reads `source.droppableId`, `destination.droppableId`, and `draggableId` from the result
- [x] 2.4 If `source.droppableId !== destination.droppableId`, call `invoke("update_task_status", { path: draggableId, status: destination.droppableId })` and then `onStatusChange()`
- [x] 2.5 Pass `onDragEnd` as a stable callback (use `useCallback`)

## 3. Update Column.tsx — add Droppable

- [x] 3.1 Import `Droppable` from `@hello-pangea/dnd`
- [x] 3.2 Wrap the card container `<div>` in `<Droppable droppableId={title}>`
- [x] 3.3 Render the `provided.innerRef` and `provided.droppableProps` on the card container div
- [x] 3.4 Render `provided.placeholder` at the end of the card list for spacing

## 4. Update Card.tsx — add Draggable

- [x] 4.1 Import `Draggable` from `@hello-pangea/dnd`
- [x] 4.2 Wrap the card's root `<div>` in `<Draggable draggableId={task.id} index={index}>` (need to accept `index` prop)
- [x] 4.3 Render the `provided.innerRef`, `provided.draggableProps`, and `provided.dragHandleProps` on the card's root div
- [x] 4.4 Add `index` prop to `Card` and pass it from `Column` (use `tasks.map` index)

## 5. Verify and polish

- [x] 5.1 Run `bun run build` to typecheck and verify no React Compiler warnings
- [ ] 5.2 Test in Tauri dev mode (`bun run tauri dev`) — verify drag between columns, keyboard drag, and that "Move to {status}" buttons still work (manual)
