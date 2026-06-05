## ADDED Requirements

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

### Requirement: Task detail dialog header has a menu button
The task detail dialog header SHALL include a `DropdownMenu` trigger button alongside the existing close button, providing access to task-level actions.

#### Scenario: Header layout includes both menu and close buttons
- **WHEN** the task detail dialog is open
- **THEN** the header SHALL display the "Task" heading on the left
- **AND** a `MoreHorizontal` icon menu button and the `X` close button SHALL be grouped on the right side
