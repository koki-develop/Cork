## Context

The board uses `@dnd-kit/react` v0.4.0 for drag-and-drop. The library exposes `useSortable` (from `@dnd-kit/react/sortable`) and the grouping-aware `move` helper (from `@dnd-kit/helpers`). This design extends drag-and-drop from cards-only to a unified sortable hierarchy where columns reorder horizontally and cards remain sortable within and across columns. Future support for card reordering and intra-column sorting falls out of the same architecture without changes to the drag layer.

## Goals / Non-Goals

**Goals:**
- Users can drag column headers (via the grip icon) left/right to reorder statuses
- Column reorder persists via the existing `save_statuses` backend command
- Card drag-and-drop between columns continues to work unchanged
- The architecture supports future card-reordering inside a column with no drag-layer refactor required
- No new external dependencies

**Non-Goals:**
- Persisting per-column card order (planned for a separate change; the architecture supports it but the persistence layer is not yet wired up)
- Multi-column drag (only one column at a time)
- Changing the Settings panel reordering behavior

## Decisions

### 1. Unified `useSortable` hierarchy — no `useDroppable` on columns

Both columns and cards use `useSortable`. Using `useDroppable` and `useSortable` on the same `id` is incorrect in `@dnd-kit/react@0.4.0`: `EntityRegistry.register` overwrites existing entries with the same id, so the `Droppable` created by `useDroppable` evicts the `SortableDroppable` registered by `useSortable`. The remaining `Droppable` only honors its own `accept` rule (e.g. `"card"`), so a typeless column source matches no drop target, and the built-in `OptimisticSortingPlugin` (which iterates `manager.registry.droppables` and filters by `instanceof SortableDroppable`) finds nothing to sort.

Instead, each column registers exactly one sortable entity that accepts both columns and cards:

```ts
useSortable({
  id: label,
  index,
  type: "column",
  accept: ["column", "card"],
  collisionPriority: CollisionPriority.Low,
});
```

`collisionPriority: Low` makes the column lose collision priority against cards inside it, so when a card is hovering near a card inside the column, the card-level sortable wins. Cards register as:

```ts
useSortable({
  id: task.id,
  index,
  group: columnLabel,
  type: "card",
  accept: "card",
});
```

The `group` property ties each card to its column and lets the `move` helper handle intra-group reorder, cross-group transfer, and column-level reorder through one codepath.

**Alternatives considered:**
- Nested `useSortable` (outer column) + `useDroppable` (inner card area): broken in v0.4.0 due to the registry-overwrite issue described above.
- Manual `useDraggable` / `useDroppable` pairs with custom collision logic: more code, reimplements what `useSortable` already provides.

### 2. State shape — flat column order plus grouped task ids

`useBoardDragState` owns two pieces of local state derived from props:

```ts
columnOrder: string[]                          // ordered list of status labels
tasksByColumn: Record<string, string[]>        // status label → ordered task ids
```

`columnOrder` is the flat-array form consumed by `move(items, event)`. `tasksByColumn` is the grouped (`Record`) form, which the same `move` helper handles for cards across and within columns. This means a single `move` call in `onDragOver` covers every card movement (intra-column reorder, cross-column transfer), and another single `move` call covers column reorder.

Both pieces are re-derived from `statuses` / `tasks` props, then mirrored into `useState`. A **render-phase snapshot pattern** (`if (snapshot.statuses !== statuses) { setColumnOrder(derived); ... }`) syncs the state back whenever props change, so the persisted backend state is the long-term source of truth while local state holds the in-flight optimistic order. This avoids `useEffect` and follows the React 19 "Adjusting state on prop change" pattern.

### 3. Optimistic updates in `onDragOver`, persistence in `onDragEnd`

`onDragOver` dispatches the appropriate `move` based on `source.type`:

```ts
if (source.type === "column") setColumnOrder((prev) => move(prev, event));
if (source.type === "card")   setTasksByColumn((prev) => move(prev, event));
```

This keeps React state as the single visual source of truth. The built-in `OptimisticSortingPlugin` detects the externally-changed sortable indices and bows out of its own DOM mutation, leaving React reconciliation to move the elements and `Sortable.animate()` to handle the FLIP-style animation between renders. There is no double-update conflict.

`onDragEnd` persists according to `source.type`:
- column drop → derive `StatusEntry[]` from `columnOrder` and call `onReorderStatuses` (existing `save_statuses` command)
- card drop → look up which column the card now lives in within `tasksByColumn`; if it differs from `task.status`, call `onTaskStatusUpdate`

### 4. Drop-target highlight is gated on source type

The column's `isDropTarget` flag is true for any source over it (column or card). The card-landing visual cue should only appear when a card is being dragged. Each `Column` reads the active source via `useDragOperation` and computes `isCardDropTarget = isDropTarget && source?.type === "card"`. Column-over-column reordering relies on the SortableDraggable's own transform animation, not the drop-target tint.

### 5. Grip icon as column drag handle, full card as card drag handle

For columns, `useSortable.handleRef` is attached to the `GripVertical` icon. The default `PointerSensor` activator is `source.handle ?? source.element`, so providing only `handleRef` (no element-level activator override) means only the grip activates a column drag. This prevents accidental column drags from clicks on the title, badge, or card list.

For cards, no handle is attached; the entire card body is the activator. This matches existing behavior and gives cards an obvious affordance throughout their surface.

### 6. Persist via existing `save_statuses` command

On column drop, the new order is mapped back to `StatusEntry[]` (preserving the existing `StatusEntry` fields by lookup, not by reconstruction) and saved via `invoke("save_statuses")`. No Rust changes needed. Card persistence reuses the existing `update_task_status` command via `onTaskStatusUpdate`.

## Risks / Trade-offs

- **[Double-render on prop sync after persist]** When the persisted state matches the optimistic state, the `useEffect` sync still runs `setState` with a new array reference, causing one extra render. This is cheap and avoids the need for deep-equality bookkeeping.
- **[External prop change mid-drag reverts optimistic state]** If the file watcher fires during a drag (e.g. external file edit), the `useEffect` sync would override the in-flight optimistic state. This is an edge case acceptable for v1; dnd-kit's drag operation completes on the next pointer release regardless.
- **[Simultaneous column + card drag not possible]** A user cannot drag a column and a card at the same time — this is a browser limitation, not specific to this design.
- **[Card order is not yet persisted]** Cards reorder optimistically within a column but the new order is not saved to disk. The next prop change re-derives `tasksByColumn` from `task.status` only, snapping cards back to their persisted order. This is intentional for v1 and will be addressed when the per-column ordering persistence is added.
