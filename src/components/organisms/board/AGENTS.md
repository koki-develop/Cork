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

Both `CreateTaskDialog` and `TaskDetailDialog` share a 2-column layout (`max-w-4xl` modal): the left column holds Title + a tall Body that fills the column height, the right column (`md:w-60`) holds the Status select + Tag editor. Columns stack vertically below the `md` breakpoint.

The Body field is the `MarkdownEditor` molecule (Lexical WYSIWYG). It's uncontrolled — seeded once from `initialValue` (`""` for create, `task.body` for detail) and reporting edits as a Markdown string via `onChange`. Because init never emits `onChange`, `body` stays equal to the raw stored Markdown until the user actually edits, so TaskDetailDialog's blur-driven auto-save still skips a no-op open/close (no normalization churn). Both dialogs also forward an `onOpenLink` prop (origin: `BoardPage`'s `openUrl` wrapper) down to the editor so clicked links open in the system browser — the molecule can't touch Tauri itself.

## Conventions

- Dialogs are wrapped in `shell/Modal`. Stacking is handled by `Modal` itself via `useIsTopOfModalStack` — every mounted modal automatically becomes inert when another opens on top, so dialogs never need to pass an `inert` prop or otherwise know about each other.
- Cards are addressed by `Task.id` (the file path). dnd-kit droppables of type `card` belong to a column via their `group`.
