## MODIFIED Requirements

### Requirement: Task detail dialog opens on card click

The system SHALL open a modal dialog showing task details in editable form fields when the user clicks a Kanban card.

#### Scenario: Clicking a card opens the detail dialog

- **WHEN** the user clicks a Kanban card
- **THEN** a modal dialog SHALL appear with editable form fields for the task

#### Scenario: Dialog shows all task fields as editable inputs

- **WHEN** the task detail dialog is open
- **THEN** the title SHALL be shown in an `<Input>` component
- **THEN** the status SHALL be shown in a `<Select>` component with all available status options
- **THEN** the body SHALL be shown in a WYSIWYG `MarkdownEditor` that renders the task's Markdown body and fills the body column height
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

- **WHEN** the user modifies the body in the `MarkdownEditor`
- **AND** the editor loses focus
- **THEN** the system SHALL call the `update_task` Tauri command with the new body serialized as a Markdown string

#### Scenario: No save on blur if value unchanged

- **WHEN** a field loses focus
- **AND** its value is unchanged from the original
- **THEN** the system SHALL NOT call the Tauri command

#### Scenario: No save when the body is opened and closed without editing

- **WHEN** the task detail dialog is opened for a task whose stored Markdown body is not in the editor's canonical serialized form
- **AND** the user does not edit the body
- **AND** the editor loses focus or the dialog closes
- **THEN** the system SHALL NOT call the `update_task` Tauri command for the body

#### Scenario: Dirty save on modal close

- **WHEN** the user closes the dialog (via Escape, backdrop click, or close button)
- **AND** there are unsaved changes in any field
- **THEN** the system SHALL blur the currently focused field (triggering auto-save)
- **AND/OR** SHALL save all dirty fields explicitly before the dialog closes
- **THEN** the dialog SHALL close only after all pending saves complete
- **AND** any save errors SHALL be shown as a toast
