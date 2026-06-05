## ADDED Requirements

### Requirement: Task can be deleted from the detail dialog

The system SHALL provide a menu button in the task detail dialog header that opens a dropdown menu with a delete action.

#### Scenario: Menu button is visible in the dialog header

- **WHEN** the task detail dialog is open
- **THEN** a `MoreHorizontal` icon button SHALL be visible in the dialog header alongside the close button

#### Scenario: Menu opens on button click

- **WHEN** the user clicks the menu button
- **THEN** a dropdown panel SHALL appear containing a "Delete" item with a `Trash2` icon in danger (red) color

#### Scenario: Menu closes on outside click

- **WHEN** the dropdown menu is open
- **AND** the user clicks outside the menu panel
- **THEN** the menu SHALL close

#### Scenario: Menu closes on Escape key

- **WHEN** the dropdown menu is open
- **AND** the user presses the Escape key
- **THEN** the menu SHALL close

### Requirement: Deletion requires confirmation before proceeding

The system SHALL present a confirmation modal before deleting a task to prevent accidental data loss.

#### Scenario: Delete selection opens confirmation modal

- **WHEN** the user clicks "Delete" in the dropdown menu
- **THEN** the dropdown SHALL close
- **AND** a confirmation modal SHALL open with a warning that the action cannot be undone

#### Scenario: Cancelling confirmation does not delete the task

- **WHEN** the confirmation modal is open
- **AND** the user clicks "Cancel" or closes the modal
- **THEN** the modal SHALL close
- **AND** the task SHALL NOT be deleted
- **AND** the detail dialog SHALL remain open

#### Scenario: Confirming deletion deletes the task

- **WHEN** the confirmation modal is open
- **AND** the user clicks the "Delete" confirm button
- **THEN** the system SHALL call the `delete_task` Tauri command with the task's file path
- **AND** the task's Markdown file SHALL be removed from the workspace directory
- **AND** both the confirmation modal and the detail dialog SHALL close
- **AND** a `toast.success("Task deleted")` notification SHALL be displayed

#### Scenario: Delete confirm button is disabled during async operation

- **WHEN** the user has clicked the Delete confirm button
- **AND** the `delete_task` command is in progress
- **THEN** the Delete button SHALL be disabled to prevent double-submission

#### Scenario: Deletion error is surfaced to the user

- **WHEN** the `delete_task` Tauri command returns an error
- **THEN** the confirmation modal SHALL remain open
- **AND** an error message SHALL be displayed within the modal
