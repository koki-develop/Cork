## MODIFIED Requirements

### Requirement: Update task command

The Tauri backend SHALL provide a `update_task` command that updates a task's frontmatter fields (title, status, tags) and body in a single call, and renames the file when the title changes.

#### Scenario: Update task body only
- **WHEN** the `update_task` command is called with a task `id` (file path) and a new `body`
- **THEN** the command SHALL rewrite the file with the updated body content
- **THEN** the command SHALL preserve existing frontmatter fields (status, order, tags) unchanged
- **THEN** the command SHALL return the updated `Task` object

#### Scenario: Update task status
- **WHEN** the `update_task` command is called with a new `status`
- **THEN** the command SHALL update the `status` field in the YAML frontmatter
- **THEN** the command SHALL preserve all other fields (including `tags`)

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
- **THEN** the command SHALL preserve `tags` across the rename

#### Scenario: Security — reject paths outside workspace
- **WHEN** the `update_task` command is called with an `id` (file path) outside the workspace directory
- **THEN** the command SHALL return an error "Access denied"
- **THEN** the command SHALL NOT modify any files

#### Scenario: Update with no changes
- **WHEN** the `update_task` command is called with the same title, status, body, and tags as the existing file
- **THEN** the command SHALL succeed without modifying the file
- **THEN** the command SHALL return the unchanged `Task` object

#### Scenario: Update task tags with a new list
- **WHEN** the `update_task` command is called with `tags=Some(vec!["bug", "p0"])`
- **AND** the existing frontmatter has `tags: ["feature"]`
- **THEN** the command SHALL replace the `tags` value in the YAML frontmatter with `["bug", "p0"]`
- **THEN** the command SHALL preserve all other frontmatter fields (status, order)
- **THEN** the returned `Task.tags` SHALL be `["bug", "p0"]`

#### Scenario: Add tags to a task that previously had none
- **GIVEN** the existing frontmatter does not contain a `tags` key
- **WHEN** the `update_task` command is called with `tags=Some(vec!["ui"])`
- **THEN** the command SHALL add the `tags` key to the YAML frontmatter with `["ui"]`
- **THEN** other frontmatter fields SHALL remain unchanged

#### Scenario: Clear all tags by passing an empty array
- **GIVEN** the existing frontmatter has `tags: ["bug", "frontend"]`
- **WHEN** the `update_task` command is called with `tags=Some(vec![])`
- **THEN** the command SHALL remove the `tags` key from the YAML frontmatter entirely (no `tags: []` line)
- **THEN** the returned `Task.tags` SHALL be `[]` (empty array)
- **THEN** other frontmatter fields SHALL remain unchanged

#### Scenario: Preserve existing tags when `tags` is omitted
- **GIVEN** the existing frontmatter has `tags: ["bug"]`
- **WHEN** the `update_task` command is called without the `tags` parameter (`tags=None`)
- **THEN** the command SHALL NOT modify the `tags` key
- **THEN** the returned `Task.tags` SHALL remain `["bug"]`

### Requirement: API wrapper on frontend

The frontend SHALL have a thin API wrapper for the `update_task` command.

#### Scenario: updateTask wrapper
- **WHEN** the frontend calls `updateTask(path, updates)` from `@/api/tasks`
- **THEN** it SHALL invoke the `update_task` Tauri command with `path`, `title?`, `status?`, `body?`, `tags?` parameters
- **THEN** it SHALL return the updated `Task`

#### Scenario: updateTask accepts a tags array
- **WHEN** the frontend calls `updateTask(path, { tags: ["bug", "ui"] })`
- **THEN** the wrapper SHALL invoke `update_task` with the `tags` parameter set to `["bug", "ui"]`
- **THEN** other update fields (`title` / `status` / `body`) SHALL NOT be sent

#### Scenario: updateTask accepts an empty tags array as "clear all"
- **WHEN** the frontend calls `updateTask(path, { tags: [] })`
- **THEN** the wrapper SHALL invoke `update_task` with the `tags` parameter set to `[]`
- **THEN** the backend SHALL clear all tags (per the corresponding backend scenario)
