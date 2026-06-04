## ADDED Requirements

### Requirement: Update task command

The Tauri backend SHALL provide a `update_task` command that updates a task's frontmatter fields (title, status) and body in a single call, and renames the file when the title changes.

#### Scenario: Update task body only
- **WHEN** the `update_task` command is called with a task `id` (file path) and a new `body`
- **THEN** the command SHALL rewrite the file with the updated body content
- **THEN** the command SHALL preserve existing frontmatter fields (status, order) unchanged
- **THEN** the command SHALL return the updated `Task` object

#### Scenario: Update task status
- **WHEN** the `update_task` command is called with a new `status`
- **THEN** the command SHALL update the `status` field in the YAML frontmatter
- **THEN** the command SHALL preserve all other fields

#### Scenario: File rename rejects existing filename
- **WHEN** the `update_task` command is called with a new `title`
- **AND** a `.md` file with the new title already exists in the workspace
- **THEN** the command SHALL return an error (e.g., "A task with this title already exists")
- **THEN** the command SHALL NOT rename or modify any files

#### Scenario: Update task title with file rename
- **WHEN** the `update_task` command is called with a new `title`
- **THEN** the command SHALL update the `title` field in the response
- **THEN** the command SHALL rename the underlying `.md` file from `old-title.md` to `new-title.md`
- **THEN** the command SHALL return the `Task` with the new `id` (updated file path)

#### Scenario: Security — reject paths outside workspace
- **WHEN** the `update_task` command is called with an `id` (file path) outside the workspace directory
- **THEN** the command SHALL return an error "Access denied"
- **THEN** the command SHALL NOT modify any files

#### Scenario: Update with no changes
- **WHEN** the `update_task` command is called with the same title, status, and body as the existing file
- **THEN** the command SHALL succeed without modifying the file
- **THEN** the command SHALL return the unchanged `Task` object

### Requirement: API wrapper on frontend

The frontend SHALL have a thin API wrapper for the `update_task` command.

#### Scenario: updateTask wrapper
- **WHEN** the frontend calls `updateTask(path, updates)` from `@/api/tasks`
- **THEN** it SHALL invoke the `update_task` Tauri command with `path`, `title?`, `status?`, `body?` parameters
- **THEN** it SHALL return the updated `Task`
