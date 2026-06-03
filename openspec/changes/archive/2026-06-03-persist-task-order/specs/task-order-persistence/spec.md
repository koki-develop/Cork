## ADDED Requirements

### Requirement: Task has order field in frontmatter

Each Markdown file in the workspace SHALL have an optional `order` field in its YAML frontmatter. The `order` field SHALL be a non-negative floating-point number. Tasks without an `order` field SHALL be treated as having no ordering constraint.

#### Scenario: Existing file without order

- **WHEN** a Markdown file has no `order` field in its frontmatter
- **THEN** the `Task` object SHALL have `order: null`

#### Scenario: Existing file with order

- **WHEN** a Markdown file has `order: 2.5` in its frontmatter
- **THEN** the `Task` object SHALL have `order: 2.5`

#### Scenario: Invalid order value

- **WHEN** a Markdown file has `order: abc` (non-numeric) in its frontmatter
- **THEN** the `Task` object SHALL have `order: null` (treated as no order)

### Requirement: list_tasks returns tasks in order

The `list_tasks` command SHALL sort tasks by `order` ascending, then by `title` alphabetically as a fallback. Tasks with `order: null` SHALL sort after all tasks with a defined order.

#### Scenario: Mixed order and no-order tasks

- **WHEN** tasks exist with orders [1, 0, null, 2]
- **THEN** the returned list SHALL be in order: order=0, order=1, order=2, then the no-order task (alphabetically)

#### Scenario: All tasks without order

- **WHEN** all tasks have `order: null`
- **THEN** the returned list SHALL be in alphabetical order by title (current behavior)

### Requirement: update_task_order command persists a single task order

The system SHALL provide a Tauri command `update_task_order(path: String, order: f64)` that updates the `order` field in a single file's frontmatter. The command SHALL validate the path is within the workspace directory and preserve all other frontmatter fields.

#### Scenario: Successful single task order update

- **WHEN** `update_task_order` is called with path `"a.md"` and order `0.5`
- **THEN** `a.md` SHALL have `order: 0.5` in its frontmatter

#### Scenario: Path traversal prevention

- **WHEN** `update_task_order` is called with a path outside the workspace directory
- **THEN** the command SHALL return `Err("Access denied")`

#### Scenario: Preserves existing frontmatter fields

- **WHEN** `update_task_order` is called on a file with existing frontmatter (`status: Doing`)
- **THEN** the `status` field SHALL be preserved and only the `order` field SHALL be added/updated

#### Scenario: No directory selected

- **WHEN** `update_task_order` is called before a workspace directory is selected
- **THEN** the command SHALL return `Err("No directory selected")`

### Requirement: renumber_tasks command reassigns sequential orders

The system SHALL provide a Tauri command `renumber_tasks(paths: Vec<String>)` that assigns sequential order values (0.0, 1.0, 2.0, ...) based on position in the list and writes them to each file's frontmatter. This is used as a fallback when fractional indexing runs out of precision.

#### Scenario: Successful renumber

- **WHEN** `renumber_tasks` is called with paths `["a.md", "b.md", "c.md"]`
- **THEN** `a.md` SHALL have `order: 0.0`, `b.md` SHALL have `order: 1.0`, `c.md` SHALL have `order: 2.0` in their frontmatter

#### Scenario: Path traversal prevention

- **WHEN** `renumber_tasks` is called with a path outside the workspace directory
- **THEN** the command SHALL return `Err("Access denied")`
