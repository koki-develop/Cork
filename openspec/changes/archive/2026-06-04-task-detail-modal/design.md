## Context

Currently, Cork tasks are displayed as Kanban cards that show only a title and a 2-line body preview. There is no way to view the full task body or edit it from within the app. The existing `CreateTaskDialog` (in `organisms/board/`) shows the pattern for modal-based task interaction, and the `Modal` component (in `organisms/shell/`) provides a reusable modal shell.

The app already has:
- A `Task` type with `id`, `title`, `status`, `body`, `order`
- Tauri commands for `create_task`, `update_task_status`, `update_task_order`, `renumber_tasks`
- A `update_frontmatter` utility in the Rust backend
- Atomic design architecture with clear layer separation

## Goals / Non-Goals

**Goals:**
- Provide a modal-based task detail view when clicking a task card
- All fields (title, status, body) are always editable — no view/edit mode toggle
- Changes auto-save on blur with no explicit save button
- Edit can change title (including renaming the underlying `.md` file), status, and body
- Follow existing project conventions (atomic design, Tailwind 4, `cork-*` design tokens, lucide icons)

**Non-Goals:**
- Rich text / Markdown preview rendering (plain text is sufficient)
- Multiple simultaneous edit sessions (single modal at a time)
- undo/redo for edits
- Collaborative editing

## Decisions

### 1. New vs extended Modal component

**Decision**: Create a `TaskDetailDialog` organism that uses `Modal` internally, with its own `containerClassName` override for wider width.

`Modal` currently enforces `max-w-md`. The task detail view needs more horizontal space (title field, body textarea). Rather than making `Modal` configurable by default (YAGNI until a second consumer needs it), `TaskDetailDialog` passes a wider `containerClassName`.

### 2. Always editable — no view/edit mode toggle

**Decision**: The dialog always renders form fields (`<Input>`, `<Select>`, `<textarea>`) — no read-only view mode.

**Alternatives considered:**
- View/edit toggle: rejected per requirement. Simplifies the component (no mode-switching state) and reduces cognitive load for the user.

### 3. Auto-save on blur — no save button

**Decision**: Most fields auto-save on `onBlur`. Status auto-saves immediately on `onChange` (because the existing `Select` component keeps focus on the trigger button after selection, making `onBlur` unreliable). The dialog saves any dirty fields before closing.

No explicit Save/Cancel buttons. Rationale: With all fields always editable, a save button becomes noise — the user expects changes to "just work." Auto-save on blur is the standard pattern for inline-editing UIs (notion-style).

**Save triggers by field**:
- **Title**: `onBlur` → `onSaveTask(id, { title })`
- **Status**: `onChange` → `onSaveTask(id, { status })`
- **Body**: `onBlur` → `onSaveTask(id, { body })`
- **On close**: blur active element first, then close; if blur doesn't trigger save (edge case), explicitly save dirty fields before finalizing close

**Risk**: Multiple rapid saves could cause race conditions. → Mitigation: single dialog-level pending flag (`isSaving`). All fields are disabled (or visually frozen) during save.

**Alternatives considered:**
- Auto-save on every keystroke with debounce: rejected — adds complexity and unnecessary Tauri IPC calls.
- Save on modal close only: rejected — risk of losing changes if the app crashes.

### 4. Backend update command — `update_task`

**Decision**: Add a single `update_task` Tauri command that accepts optional fields (title, status, body) and handles file rename when title changes.

Signature:
```
update_task(path: String, title?: Option<String>, status?: Option<String>, body?: Option<String>) -> Result<Task, String>
```

Logic:
1. Canonicalize and validate `path` is inside workspace directory
2. Read current file, parse frontmatter + body
3. If `title` changed:
   - Check if `new-title.md` already exists in workspace → reject with "A task with this title already exists"
   - Write updated content to new path, delete old file
4. If only `status`/`body` changed: rewrite in-place
5. Return updated `Task` (with new `id` if file was renamed)

The existing pattern requires three separate commands for status, order, and (missing) body/title updates. A single command is more ergonomic for the frontend, allows atomic file-rename + content-rewrite, and matches how the `CreateTaskDialog` works (all fields at once). The Rust side validates the canonical path and workspace boundary, matching the security pattern.

**Alternatives considered:**
- Unlink the file and create a new one on rename. Rejected — the file ID (`task.id`) must remain stable when only body/status changes.
- Separate `update_task_body` + `rename_task` commands. Rejected — more frontend round-trips and no atomicity guarantee.

### 5. Click handler on KanbanCard

**Decision**: Add an optional `onClick` prop to `KanbanCard`. The card becomes `cursor-pointer` (instead of `cursor-grab`) when the click handler is provided.

The DnD library (`@dnd-kit/react`) handles pointer event confl ict between drag and click: a short pointer-down→up without movement is a click, while a drag sequence suppresses the click. This means the same element can be both draggable and clickable. We only need to add `onClick` to the card's container div.

### 6. Local state + auto-save on blur

**Decision**: Local React state in `TaskDetailDialog` for the form fields. On the appropriate trigger (blur for title/body, onChange for status), the component calls `onSaveTask(id, { field: newValue })` to persist.

The component tracks original values on open. If a field value hasn't changed, no save call is made. A single dialog-level `isSaving` flag disables all fields during save to prevent race conditions.

### 7. Optimistic updates on save

**Decision**: `useWorkspace.updateTask` performs optimistic local state updates before the Tauri IPC round-trip completes, matching the existing `updateTaskStatus` pattern.

For status changes: immediately move the card to the new column in `tasks` state, then persist.
For body changes: immediately update the body in the local task object, then persist.
For title changes: immediately update the title in the local task object; the `id` (file path) will be updated after the IPC returns.

After any save, `loadTasks()` is called to reconcile with disk. If the title changed, the re-fetch ensures `tasksById` maps new IDs correctly.

## Design System Integration

The UI follows the existing Cork design tokens already defined in `style.css`:

| Token | Value | Usage |
|---|---|---|
| `cork-bg` | `#020617` | Modal outer background |
| `cork-surface` | `#0f172a` | Modal surface |
| `cork-elevated` | `#1e293b` | Input/textarea backgrounds |
| `cork-border` | `#334155` | Borders |
| `cork-accent` | `#6366f1` | Primary actions, focus rings |
| `cork-text` | `#f1f5f9` | Body text |
| `cork-muted` | `#94a3b8` | Labels, secondary text |

Icons from `lucide-react` (already a dependency). A Close button (X icon) in the header reuses the existing `IconButton` atom.

### Typography

- **Title (heading)**: `<Heading level={2} variant="page">` (existing style)
- **Field labels**: `<Text variant="label" size="xs">`
- **Body textarea**: same styling as `CreateTaskDialog` textarea

## Risks / Trade-offs

- **[Risk] DnD click conflict**: `@dnd-kit/react` might consume pointer events and prevent click on the card. → Mitigation: test with actual drag-vs-click interaction. The library's documentation suggests native click events work on sortable elements; if not, use `handle` for drag and make the card body the click target.
- **[Risk] File rename on title change**: Renaming the file changes the task `id` (which is the file path). The DnD state and `tasksById` map use `id` as a key. → Mitigation: the frontend MUST update its local state with the new `id` returned by the `update_task` command, and the board's `tasksById` map must be re-derived after a re-fetch.
- **[Trade-off] Single `update_task` command**: Bundling body + title + status + rename in one command increases the backend surface area but simplifies the frontend. The alternative (separate commands) would cost more round-trips and make atomicity harder.
