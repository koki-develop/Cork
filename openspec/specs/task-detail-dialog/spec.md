## Requirements

### Requirement: Task detail dialog opens on card click

The system SHALL open a modal dialog showing task details in editable form fields when the user clicks a Kanban card.

#### Scenario: Clicking a card opens the detail dialog

- **WHEN** the user clicks a Kanban card
- **THEN** a modal dialog SHALL appear with editable form fields for the task

#### Scenario: Dialog shows all task fields as editable inputs

- **WHEN** the task detail dialog is open
- **THEN** the title SHALL be shown in an `<Input>` component
- **THEN** the status SHALL be shown in a `<Select>` component with all available status options
- **THEN** the body SHALL be shown in a `<textarea>` with at least 5 rows
- **THEN** all fields SHALL be editable immediately — no view/edit mode distinction

#### Scenario: Dialog closes on Escape key

- **WHEN** the task detail dialog is open
- **AND** the user presses the Escape key
- **THEN** the dialog SHALL close

#### Scenario: Dialog closes on backdrop click

- **WHEN** the task detail dialog is open
- **AND** the user clicks the backdrop overlay
- **THEN** the dialog SHALL close

### Requirement: Auto-save on field blur

Changes to any field SHALL be persisted automatically when the field loses focus.

#### Scenario: Title change saves on blur

- **WHEN** the user modifies the title
- **AND** the title field loses focus (blur event)
- **THEN** the system SHALL call the `update_task` Tauri command with the new title
- **THEN** if the title changed, the file SHALL be renamed on disk
- **THEN** the dialog SHALL stay open with the updated values

#### Scenario: Status change saves immediately on selection

- **WHEN** the user selects a new status from the dropdown
- **THEN** the system SHALL call the `update_task` Tauri command immediately on selection (onChange), not on blur
- **THEN** the task card SHALL update its column position (via optimistic local state update)

#### Scenario: Body change saves on blur

- **WHEN** the user modifies the body text
- **AND** the textarea loses focus
- **THEN** the system SHALL call the `update_task` Tauri command with the new body

#### Scenario: No save on blur if value unchanged

- **WHEN** a field loses focus
- **AND** its value is unchanged from the original
- **THEN** the system SHALL NOT call the Tauri command

#### Scenario: Dirty save on modal close

- **WHEN** the user closes the dialog (via Escape, backdrop click, or close button)
- **AND** there are unsaved changes in any field
- **THEN** the system SHALL blur the currently focused field (triggering auto-save)
- **AND/OR** SHALL save all dirty fields explicitly before the dialog closes
- **THEN** the dialog SHALL close only after all pending saves complete
- **AND** any save errors SHALL be shown as a toast

### Requirement: Consistency with existing design

The dialog SHALL follow the same design conventions as the existing `CreateTaskDialog`.

#### Scenario: Wider dialog for detail view

- **WHEN** the task detail dialog is open
- **THEN** the modal SHALL be wider than `max-w-md` (use `max-w-2xl` or equivalent)

#### Scenario: Consistent styling

- **WHEN** the task detail dialog is rendered
- **THEN** it SHALL use the same `cork-*` design tokens
- **THEN** it SHALL use the same `rounded-2xl`, `border`, `backdrop-blur` patterns as `Modal`
- **THEN** it SHALL use `lucide-react` icons (not emojis)

### Requirement: Task detail dialog header has a menu button

The task detail dialog header SHALL include a `DropdownMenu` trigger button alongside the existing close button, providing access to task-level actions.

#### Scenario: Header layout includes both menu and close buttons

- **WHEN** the task detail dialog is open
- **THEN** the header SHALL display the "Task" heading on the left
- **AND** a `MoreHorizontal` icon menu button and the `X` close button SHALL be grouped on the right side

### Requirement: Task detail dialog provides a Tags field

The task detail dialog SHALL include a "Tags" field that displays the task's tags as removable chips and allows the user to add new tags inline.

#### Scenario: Tags field renders between Status and Body

- **WHEN** the task detail dialog is open
- **THEN** the dialog SHALL display a labeled "Tags" section
- **AND** the dialog SHALL show fields in the order Title / Status / Tags / Body
- **AND** the field SHALL use the same label / wrapper styling (`Text variant="label" size="xs"`) as Title / Status / Body

#### Scenario: Existing tags render as removable chips

- **WHEN** the task has `tags=["bug", "ui"]`
- **AND** the dialog opens for that task
- **THEN** the Tags field SHALL display two chips labeled "bug" and "ui" in input order
- **AND** each chip SHALL have a clickable `X` icon button on its right edge with `aria-label="Remove tag {tag}"`

#### Scenario: Inline input enables adding new tags

- **WHEN** the Tags field is rendered
- **THEN** an `<input>` element SHALL be present at the trailing end of the chip list
- **AND** the input SHALL have a placeholder hinting at tag addition (e.g., "Add tag")
- **AND** the input SHALL share visual baseline / height with the chips

#### Scenario: Adding a tag persists immediately via update_task

- **GIVEN** the dialog is open for a task with `tags=["bug"]`
- **WHEN** the user types "ui" in the input and presses Enter
- **THEN** the dialog SHALL invoke `update_task` with `tags=["bug", "ui"]`
- **THEN** the chip list SHALL update optimistically to show "bug" and "ui"
- **AND** the input SHALL be cleared and keep focus

#### Scenario: Removing a chip persists immediately via update_task

- **GIVEN** the dialog is open for a task with `tags=["bug", "ui"]`
- **WHEN** the user clicks the `X` button on the "ui" chip
- **THEN** the dialog SHALL invoke `update_task` with `tags=["bug"]`
- **THEN** the chip list SHALL update optimistically to show only "bug"

#### Scenario: Backspace on empty input removes the last chip

- **GIVEN** the dialog has `tags=["bug", "ui"]` and the input is empty
- **WHEN** the user presses Backspace
- **THEN** the dialog SHALL invoke `update_task` with `tags=["bug"]`
- **THEN** no confirmation modal SHALL be shown

#### Scenario: Closing the dialog flushes a non-empty input as a new tag

- **GIVEN** the dialog has `tags=["bug"]`
- **AND** the input contains the unsubmitted text "perf"
- **WHEN** the user closes the dialog (Escape, backdrop click, or close button)
- **THEN** the dialog SHALL invoke `update_task` with `tags=["bug", "perf"]` before closing
- **AND** the dialog SHALL close only after the save completes
- **AND** any save error SHALL be shown as a toast

#### Scenario: Closing the dialog with an empty input does not call update_task for tags

- **GIVEN** the dialog has `tags=["bug"]`
- **AND** the input is empty
- **AND** the user has not modified any tag since opening
- **WHEN** the user closes the dialog
- **THEN** the dialog SHALL NOT include `tags` in the close-time flush update payload

#### Scenario: Tag entry survives IME composition without misfire

- **GIVEN** the input has Japanese IME composition active
- **WHEN** an Enter key event fires with `isComposing=true`
- **THEN** no new tag SHALL be added
- **AND** the input value SHALL retain the IME-confirmed text

#### Scenario: Tag chips in the editor use the Cork accent tokens

- **WHEN** a tag chip is rendered inside `TagEditor` (any dialog that hosts it)
- **THEN** the chip SHALL be styled with `rounded-full`, `bg-cork-accent/20`, `border-cork-accent/40`, `text-cork-accent-hover`, `font-medium`, `text-xs` (the accent `variant` of `TagChip`)
- **AND** the chip SHALL use a `lucide-react` icon (not an emoji) for the remove control
- **AND** the editor chips SHALL be visually stronger than the board-side `TagList` chips so the editing affordance is clear
