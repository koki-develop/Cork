## ADDED Requirements

### Requirement: Task detail dialog header has a menu button
The task detail dialog header SHALL include a `DropdownMenu` trigger button alongside the existing close button, providing access to task-level actions.

#### Scenario: Header layout includes both menu and close buttons
- **WHEN** the task detail dialog is open
- **THEN** the header SHALL display the "Task" heading on the left
- **AND** a `MoreHorizontal` icon menu button and the `X` close button SHALL be grouped on the right side
