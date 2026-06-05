## Context

Cork currently has no way to create tasks from within the app. Users must manually create `.md` files in the workspace directory. The app structure follows atomic design with strict import boundaries, and the Rust backend uses a single `lib.rs` with all commands. The existing security model canonicalizes paths before any write operation.

The UI uses a dark theme with indigo accent (`cork-accent: #6366f1`), Inter font, and Tailwind 4. Existing patterns include a `Modal` component for overlays and `Button`/`Input` atoms for forms.

## Goals / Non-Goals

**Goals:**

- Users can create a new task from the board view via a dialog
- Title is required; status and body are optional
- Status defaults to the first status in the workspace config
- New task file is written to the workspace directory as `<title>.md`
- Dialog follows existing visual patterns (dark theme, Modal, etc.)
- Keyboard shortcut `Cmd+N` / `Ctrl+N` opens the dialog

**Non-Goals:**

- Inline editing / quick-add at column level (future enhancement)
- Template-based creation (future enhancement)
- Batch creation (future enhancement)

## Decisions

### 1. Dialog vs Inline Quick-Add

**Decision**: Use a modal dialog (`CreateTaskDialog`) triggered from a "+" button at the top of each column body area (below the column header, above the card list).

**Rationale**: A modal dialog:

- Follows the existing pattern (`SettingsDialog` uses `Modal`)
- Provides space for title, status dropdown, and body textarea
- Allows form validation (required title, duplicate filename check)
- Is consistent with the single-purpose dialog approach used for settings

Per-column trigger:

- Natural mapping — user creates a task into a specific column
- The clicked column's status is pre-selected in the dialog
- No additional header chrome needed

**Alternatives considered**:

- AppHeader button — adds clutter to header, loses column context
- Inline quick-add input — simpler but limited to title-only, no body support, and inconsistent with existing UI patterns.

### 2. Rust command: single `create_task` vs separate steps

**Decision**: Single `create_task` command accepting `title`, `status`, `body`, and `order`.

**Rationale**: Atomic operation that writes the file in one go. The frontend assembles the parameters; the backend validates and writes. This matches the pattern of other write commands (`update_task_status`, `update_task_order`).

**Return value**: Returns the created `Task` struct so the frontend can optimistically update state without a full reload.

### 3. Status dropdown design

**Decision**: Use a native `<select>` element styled with Tailwind to match the design system.

**Rationale**:

- No existing custom select/dropdown component in the project
- A native `<select>` is accessible by default, requires no extra dependencies
- The task is simple (choose from a flat list of statuses)
- Can be styled with Tailwind to match the input aesthetic

**Alternatives considered**: Creating a custom dropdown (`Listbox`-style) — overengineering for a single-select from a flat list.

### 4. Body input

**Decision**: Use a standard `<textarea>` element styled with Tailwind.

**Rationale**: No rich text editing needed. The body is plain markdown. A textarea is the most natural input for multi-line content and requires no dependencies.

### 5. Keyboard shortcut

**Decision**: Register `keydown` listener in `BoardPage` for `Cmd+N`/`Ctrl+N` to open the dialog. Follows the existing pattern of `menu:open-settings` for `Cmd+,`.

**Rationale**: Consistent with the existing shortcut approach. A custom Tauri menu item is not needed since this is frontend-only state.

### 6. Filename sanitization

**Decision**: The Rust command SHALL sanitize the title by stripping characters invalid in filenames (`/`, `\0`) and trimming whitespace.

**Rationale**: The title becomes the filename. Invalid characters would cause filesystem errors. Frontend SHALL also trim and validate before sending.

### 7. Optimistic update

**Decision**: The `useWorkspace` hook appends the returned `Task` to the task list immediately, then calls `loadTasks` to reconcile from disk.

**Rationale**: Matches the existing `updateTaskStatus` pattern. The file watcher (`watch()`) will also trigger a reload, but calling explicitly ensures consistency.

## Data Flow

```
KanbanColumn "+" click (with column label)
  → BoardPage opens dialog, sets preselectedStatus = column label
  → User fills form (title + optional body), clicks Create
  → BoardPage calls useWorkspace.createTask(title, status, body)
  → useWorkspace appends optimistic Task to tasks[]
  → createTask API calls invoke("create_task", {title, status, body})
  → Rust sanitizes title, checks for duplicates, writes <title>.md, returns Task
  → useWorkspace calls loadTasks() to reconcile from disk
  → New card renders in the correct column
```

## Risks / Trade-offs

| Risk                                               | Mitigation                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Title conflicts with existing `.md` file           | Rust command checks for existing file and returns an error message                                 |
| User creates empty-title task                      | Frontend disables submit button when title is empty; backend returns error for blank title         |
| Special characters in title break filesystem       | Sanitize in Rust — replace `/` with `-`, strip null bytes, trim whitespace                         |
| Modal dismisses on backdrop click during form fill | Existing Modal behavior (backdrop click = close) is acceptable; unsaved data is lost (no autosave) |
