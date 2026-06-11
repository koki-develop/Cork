## ADDED Requirements

### Requirement: WYSIWYG Markdown editing surface

The system SHALL provide a `MarkdownEditor` component that edits a Markdown string as rendered (WYSIWYG) content rather than raw Markdown source. It SHALL be seeded from an initial Markdown string and SHALL produce a Markdown string representing the current content.

#### Scenario: Editor renders an initial Markdown string as formatted content

- **WHEN** the editor is mounted with an initial value of `"# Title\n\nSome **bold** text"`
- **THEN** the editor SHALL display a rendered heading and rendered bold text, not the raw `#` / `**` characters

#### Scenario: Empty initial value renders an empty editor

- **WHEN** the editor is mounted with an empty initial value
- **THEN** the editor SHALL display an empty editing area showing its placeholder

### Requirement: Inline Markdown shortcut input

The editor SHALL transform Markdown shortcuts into formatted content inline as the user types, covering at least headings, unordered and ordered lists, blockquotes, code blocks, inline bold/italic/code, and links.

#### Scenario: Heading shortcut

- **WHEN** the user types `# ` at the start of a line
- **THEN** that line SHALL become a level-1 heading

#### Scenario: Unordered list shortcut

- **WHEN** the user types `- ` at the start of a line
- **THEN** that line SHALL become an unordered list item

#### Scenario: Inline emphasis shortcut

- **WHEN** the user types `**bold**`
- **THEN** the wrapped text SHALL render as bold and the `**` markers SHALL be removed from the visible content

### Requirement: Markdown string output on edit

When the user edits the content, the editor SHALL notify its consumer with the current content serialized to a Markdown string.

#### Scenario: Edit emits updated Markdown

- **WHEN** the user edits the content
- **THEN** the editor SHALL invoke its change callback with a Markdown string reflecting the current content

#### Scenario: No change notification before the user edits

- **WHEN** the editor has been mounted from an initial value
- **AND** the user has not yet edited the content
- **THEN** the editor SHALL NOT have invoked its change callback

### Requirement: Blur notification

The editor SHALL notify its consumer when the editing area loses focus, so consumers can run blur-driven logic (e.g. auto-save).

#### Scenario: Blur invokes the blur callback

- **WHEN** the editing area has focus
- **AND** focus leaves the editing area
- **THEN** the editor SHALL invoke its blur callback (when one is provided)

### Requirement: Minimal editing affordances

The editor SHALL be minimal: it SHALL NOT render a formatting toolbar, a floating selection menu, or slash-command menus. The only editing affordances SHALL be inline Markdown shortcuts and undo/redo history.

#### Scenario: No toolbar or menus are rendered

- **WHEN** the editor is mounted
- **THEN** no formatting toolbar SHALL be present
- **AND** no floating selection menu SHALL be present
- **AND** no slash-command menu SHALL be present

#### Scenario: Undo reverts the last edit

- **WHEN** the user makes an edit
- **AND** the user triggers undo
- **THEN** the edit SHALL be reverted

### Requirement: Plain-Markdown round-trip preserves the storage format

The editor SHALL exchange content as a plain Markdown string at its boundary, so the on-disk Markdown file format and the `create_task` / `update_task` payloads are unchanged.

#### Scenario: Saved body is a Markdown string

- **WHEN** a consumer reads the editor's current value to persist it
- **THEN** the value SHALL be a Markdown string suitable for writing directly as the task file body
