# Board organisms (`src/components/organisms/board/`)

Kanban surface — column, card, and the create / detail / delete dialogs. Must not import from `settings/` (enforced by `.oxlintrc.json`).

## Files

- `KanbanColumn.tsx` — Sortable column. Renders the `New Task` button (suppressed for the `Unknown` column), the card list, and provides the column-typed dnd-kit droppable that catches empty-area drops.
- `KanbanCard.tsx` — Draggable card. Renders title + 2-line body preview (`task.body` split on newlines, blanks dropped) + tags.
- `CreateTaskDialog.tsx` — New-task form. Uses `useTagEditorController` to commit a pending tag input on submit.
- `TaskDetailDialog/` — Edit-existing-task dialog with per-field auto-save and a 2-step close flow.
  - `TaskDetailDialog.tsx` — The view.
  - `useTaskDialogState.ts` — Local state machine: editable form + tagged `FieldError` + close discipline (1st attempt persists pending edits and surfaces error inline; 2nd attempt retries with latest values, then discards the offending field and closes with a toast).
- `TaskContextMenu.tsx` — Right-click menu on a card. Items: `Copy path` (writes `task.id` to the clipboard) and `Delete`.
- `DeleteTaskConfirmDialog.tsx` — Confirm dialog reused by `TaskDetailDialog` (nested) and `BoardPage`.

## Conventions

- Dialogs are wrapped in `shell/Modal`. When stacking dialogs, pass `inert` to the parent — see `shell/Modal.tsx` for why native `showModal()` doesn't auto-inert parents.
- Cards are addressed by `Task.id` (the file path). dnd-kit droppables of type `card` belong to a column via their `group`.
