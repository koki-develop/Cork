## ADDED Requirements

### Requirement: Fenced code blocks SHALL be syntax-highlighted by language

The editor SHALL render fenced code blocks with token-level syntax highlighting driven by the fence's info string, following these three resolution rules:

1. **Language specified AND the editor bundles a grammar for it** — the block SHALL be highlighted with that language's grammar.
2. **Language specified but no bundled grammar matches** — the block SHALL be highlighted with the editor's default "auto" grammar (the same grammar used as the editor's `DEFAULT_CODE_LANGUAGE`).
3. **No language specified on the fence** — the block SHALL NOT be highlighted (no Prism pass at all, not even with the default grammar).

The fence's info string SHALL be matched against the editor's bundled grammars **after** alias normalization (so `js`, `ts`, `py`, `md`, etc. resolve to their canonical grammar before the lookup). A normalized info string of `plain` / `plaintext` / `text` SHALL be treated identically to "no language specified" (rule 3): no highlighting is applied.

#### Scenario: Bundled language gets its own grammar (rule 1)

- **WHEN** the editor loads a Markdown source containing a fenced block whose info string is `js`
- **THEN** the block's keywords, strings, numbers, and comments SHALL each render with their own visual style (color and/or weight) that distinguishes them from regular prose

#### Scenario: Alias of a bundled language is normalized (rule 1 via alias)

- **WHEN** the editor loads a Markdown source containing a fenced block whose info string is `typescript`
- **THEN** the block SHALL be highlighted with the TypeScript grammar (i.e. the alias is recognized and resolved to the bundled grammar)

#### Scenario: Unsupported language falls back to the default grammar (rule 2)

- **WHEN** the editor loads a Markdown source containing a fenced block whose info string is `go` (or any other language the editor does not bundle)
- **THEN** the block SHALL be highlighted using the editor's default "auto" grammar (i.e. SOME highlighting is visible — keywords are styled, strings are styled — even though the grammar is not the one named by the fence)

#### Scenario: No language means no highlighting (rule 3)

- **WHEN** the editor loads a Markdown source containing a fenced block with NO info string on the opening fence
- **THEN** the block SHALL render as a single uniformly-colored monospaced block (no per-token coloring, no italic comments, no bold keywords)

#### Scenario: Explicit "plain text" info string means no highlighting (rule 3 via alias)

- **WHEN** the editor loads a Markdown source containing a fenced block whose info string is `text`, `plaintext`, or `plain`
- **THEN** the block SHALL render with NO highlighting, identical to the no-info-string case

#### Scenario: Live-typed fence with a supported language highlights as it is typed (rule 1, ingest path)

- **WHEN** the user types ` ```ts ` followed by Enter at the start of an empty line
- **AND** the user then types TypeScript code on subsequent lines (e.g. `const x: number = 1;`)
- **THEN** the new fenced block SHALL be highlighted with the TypeScript grammar as the user types (the highlight is not deferred until reload)

#### Scenario: Live-typed fence with no language stays unhighlighted (rule 3, ingest path)

- **WHEN** the user types ` ``` ` followed by Enter at the start of an empty line
- **AND** the user then types code on subsequent lines
- **THEN** the new fenced block SHALL render with NO per-token coloring (identical to the loaded-from-disk no-info-string case)

### Requirement: Code block highlighting SHALL NOT rewrite the stored language

The highlighting layer SHALL be a pure render-time transformation. The fence's info string SHALL round-trip on disk exactly as it was loaded, regardless of whether the highlighter resolved it via rule 1, rule 2, or rule 3.

#### Scenario: Bare fence stays bare on save

- **WHEN** the editor loads a Markdown source containing a fenced block with no info string
- **AND** the editor's content is serialized back to a Markdown string (e.g. for save)
- **THEN** the serialized fence SHALL still have no info string (the highlighter MUST NOT inject `javascript` or any other default language onto the fence)

#### Scenario: Unsupported-language fence retains its original info string

- **WHEN** the editor loads a Markdown source containing a fenced block whose info string is `go`
- **AND** the editor's content is serialized back to a Markdown string
- **THEN** the serialized fence SHALL still carry the info string `go` (NOT `javascript`, even though `go` was highlighted via rule 2's auto fallback)

#### Scenario: A no-op open-and-close does not modify the file

- **WHEN** a user opens a task containing a fenced block
- **AND** the user makes no edits
- **AND** the editor's content is serialized back to a Markdown string for any reason (open, close, focus change)
- **THEN** the serialized string SHALL be byte-identical to the loaded string (the highlighter MUST NOT trigger a content rewrite on its own)

### Requirement: Highlighting SHALL NOT regress existing keyboard or inline-format behavior

Adding code-block highlighting SHALL NOT change the editor's keyboard behavior outside of code blocks and SHALL NOT change the existing escape/navigation behavior at code-block boundaries.

#### Scenario: ArrowUp at the start of a code block still reaches the block above

- **WHEN** the editor contains a paragraph followed by a fenced code block
- **AND** the caret is on the first line of the code block at column 0
- **AND** the user presses ArrowUp (no modifier)
- **THEN** the caret SHALL move into the paragraph above (i.e. the highlighter MUST NOT trap the arrow inside the code block when a neighboring block exists)

#### Scenario: Shift+Enter still escapes a code block

- **WHEN** the caret is inside a code block
- **AND** the user presses Shift+Enter
- **THEN** a new paragraph SHALL appear immediately after the code block and the caret SHALL move into it (i.e. `CodeBlockEscapePlugin` continues to work)

#### Scenario: Inline format shortcuts inside a code block remain disabled

- **WHEN** the caret is inside a fenced code block
- **AND** the user types `**bold**`
- **THEN** the text `**bold**` SHALL remain literal in the code block (the inline-format guard continues to recognize highlighted code-block text as non-formattable)
