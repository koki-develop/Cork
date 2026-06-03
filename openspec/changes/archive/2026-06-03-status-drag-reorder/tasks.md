## 1. Card — Switch to `useSortable`

- [x] 1.1 Replace `useDraggable` with `useSortable` from `@dnd-kit/react/sortable`
- [x] 1.2 Pass `id`, `index`, `group` (column label), `type: "card"`, `accept: "card"`
- [x] 1.3 Accept `group` and `index` as props from Column

## 2. Column — Sortable-only, no `useDroppable`

- [x] 2.1 Remove `useDroppable` entirely
- [x] 2.2 Configure `useSortable` with `type: "column"`, `accept: ["column", "card"]`, `collisionPriority: CollisionPriority.Low`
- [x] 2.3 Attach `handleRef` to the `GripVertical` icon, `ref` to the outer column wrapper
- [x] 2.4 Take `label`, `index`, `taskIds`, `tasksById` as props
- [x] 2.5 Render `Card` components from `taskIds.map((id, i) => ...)` with `group={label}` and `index={i}`
- [x] 2.6 Use `useDragOperation` to gate the card-landing highlight (`isDropTarget && source?.type === "card"`)

## 3. Board — Extract drag state into a hook

- [x] 3.1 Create `src/hooks/useBoardDragState.ts` owning `columnOrder`, `tasksByColumn`, `tasksById`, `handleDragOver`, `handleDragEnd`
- [x] 3.2 Derive `columnOrder` and `tasksByColumn` from `statuses` / `tasks`; mirror into `useState` and sync via render-phase snapshot pattern
- [x] 3.3 In `handleDragOver`, dispatch `move(prev, event)` to `setColumnOrder` for `source.type === "column"` and to `setTasksByColumn` for `source.type === "card"`
- [x] 3.4 In `handleDragEnd`, persist column reorder via `onReorderStatuses` and card-column changes via `onTaskStatusUpdate`
- [x] 3.5 Refactor `Board.tsx` to consume the hook and pass `taskIds` / `tasksById` down to each Column

## 4. useWorkspace — Reorder method

- [x] 4.1 Expose `reorderStatuses(StatusEntry[])` that calls `invoke("save_statuses", { statuses })` then reloads via `loadStatuses`

## 5. Verify

- [x] 5.1 `bun run build` passes (typecheck + vite build)
- [x] 5.2 `bun run format` passes (biome check)
- [x] 5.3 Column reorder works visually and persists across page reload ✅
- [x] 5.4 Card drag-and-drop between columns still works ✅
- [x] 5.5 Settings panel reordering still works ✅
