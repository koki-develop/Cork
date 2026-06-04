## ADDED Requirements

### Requirement: User can create a task

The system SHALL allow users to create a new task from the board view.

Each kanban column SHALL have a "+" button at the top of its card area (below the column header). Clicking it SHALL open the create task dialog with the status selector pre-selected to that column's status.

The system SHALL open a modal dialog with a form when the user triggers task creation.

The form SHALL include:
- A required title field (text input, auto-focused)
- A status selector (dropdown pre-populated with workspace statuses, defaulting to the clicked column's status)
- An optional body field (textarea for markdown content)
- A "Create" submit button
- A cancel mechanism (X button, Esc key, backdrop click)

The system SHALL create a new `.md` file in the workspace directory named `<sanitized-title>.md` with YAML frontmatter containing `status` and `order` fields.

The system SHALL display the new task card in the appropriate column immediately after creation.

#### Scenario: Create task via column "+" button

- **WHEN** user clicks the "+" button at the top of the "Doing" column
- **THEN** the create task dialog opens with the status selector pre-set to "Doing"
- **THEN** the title field is auto-focused

- **WHEN** user types "Implement login" as the title and clicks "Create"
- **THEN** a file `Implement login.md` is created in the workspace with frontmatter `status: Doing`
- **THEN** a new card with title "Implement login" appears in the "Doing" column

#### Scenario: Override column status and add body

- **WHEN** user clicks the "+" button in the "Todo" column (defaults to "Todo"), changes the status dropdown to "Doing", types "Write docs" as title, writes "## Getting Started\n\nInstall the CLI..." in the body, and clicks "Create"
- **THEN** a file `Write docs.md` is created with status "Doing" and the body content preserved
- **THEN** the card appears in the "Doing" column

#### Scenario: Cancel creation

- **WHEN** user opens the dialog and presses Escape
- **THEN** the dialog closes without creating any file

#### Scenario: Empty title validation

- **WHEN** user clicks "Create" with an empty title
- **THEN** the system SHALL NOT create a file
- **THEN** the system SHALL show an error message "Title is required"

#### Scenario: Duplicate filename

- **WHEN** user creates a task with a title that matches an existing `.md` file in the workspace (case-insensitive)
- **THEN** the system SHALL show an error message "A task with this title already exists"
- **THEN** no file is created

### Requirement: Keyboard shortcut to open dialog

The system SHALL open the create task dialog when the user presses `Cmd+N` (macOS) or `Ctrl+N` (other platforms).

#### Scenario: Keyboard shortcut opens dialog

- **WHEN** user presses `Cmd+N` while viewing the board
- **THEN** the create task dialog opens with the status selector pre-set to the first status in the workspace config

### Requirement: Title sanitization

The system SHALL sanitize the title before using it as a filename.

- Forward slashes (`/`) SHALL be replaced with hyphens (`-`)
- Null bytes SHALL be stripped
- Leading and trailing whitespace SHALL be trimmed
- The sanitized title SHALL be non-empty after sanitization
