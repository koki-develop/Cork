## ADDED Requirements

### Requirement: A frontend test runner SHALL be installed and runnable from the repo root

The repository SHALL ship a test runner that can execute TypeScript + JSX test files against the same module-resolution rules (alias `@/*`, React JSX, ES modules) as the production build, without a separate Babel/TS configuration.

#### Scenario: `bun run test` runs the full test suite

- **WHEN** a developer runs `bun run test` from the repo root
- **THEN** the configured test runner SHALL discover every `*.spec.ts` and `*.spec.tsx` file under `src/`
- **AND** SHALL execute them once (non-watch) and exit with a non-zero status if any test fails

#### Scenario: `bun run test:watch` re-runs affected tests on file change

- **WHEN** a developer runs `bun run test:watch` from the repo root
- **THEN** the configured test runner SHALL stay running and re-execute the tests affected by any subsequent file change under `src/`

#### Scenario: Tests resolve `@/*` paths the same way production code does

- **WHEN** a test file imports `@/components/molecules/MarkdownEditor`
- **THEN** the import SHALL resolve to `src/components/molecules/MarkdownEditor/index.ts`
- **AND** SHALL behave identically whether the runner is invoked by `bun run test`, the IDE's test integration, or CI

### Requirement: The test runner SHALL execute tests inside a real browser engine

The test runner SHALL drive a real, modern browser engine (Chromium via Playwright) so contenteditable, `Selection`, `Range.getBoundingClientRect`, and `PointerEvent` behave as they do in a real browser. The test-execution environment SHALL NOT be a polyfilled / emulated DOM such as jsdom or happy-dom. (Transitive use of `happy-dom` inside `@lexical/headless` as its own internal implementation detail is out of scope — only the runner's execution environment is constrained here; test code MUST NOT import from `happy-dom` directly.)

#### Scenario: Tests run in Chromium

- **WHEN** `bun run test` is invoked
- **THEN** the runner SHALL launch a Playwright-managed Chromium instance
- **AND** SHALL execute every spec file inside that browser context

#### Scenario: `Range.getBoundingClientRect()` returns real layout numbers

- **WHEN** test code creates a `Range` over rendered editor content and calls `range.getBoundingClientRect()`
- **THEN** the call SHALL return a `DOMRect` whose `width` and `height` reflect the rendered geometry (i.e. SHALL NOT be zero for non-empty content; jsdom would have returned zero)

#### Scenario: `Selection` and `contentEditable` behave as in a real browser

- **WHEN** test code mounts a `LexicalComposer` and focuses its contenteditable root
- **THEN** the existing `Selection` SHALL persist across the focus call
- **AND** `element.contentEditable` SHALL read back the value that was set via either the property or the attribute

### Requirement: Pure `$`-prefixed editor helpers SHALL be testable in a headless Lexical editor

The `$`-prefixed helpers defined inside `src/components/molecules/MarkdownEditor/` (e.g. `$isInsideCodeBlock`, `$isFormattableTextNode`, `$closestProseLink`) SHALL be invocable inside an `editor.update(...)` or `editor.read(...)` callback driven by `@lexical/headless`'s `createHeadlessEditor`, without mounting a real `LexicalComposer`.

#### Scenario: A pure helper can be tested without rendering

- **WHEN** a test creates a headless editor with Cork's registered nodes
- **AND** builds a small node tree inside `editor.update(...)` (e.g. an empty `ParagraphNode` under root)
- **AND** invokes `$isInsideCodeBlock(paragraph)` against that tree
- **THEN** the helper SHALL return `false`

### Requirement: Markdown round-trip SHALL be testable in a headless Lexical editor

The `MARKDOWN_TRANSFORMERS` array exported from `src/components/molecules/MarkdownEditor/transformers.ts` SHALL produce identical Markdown when an input string is imported via `$convertFromMarkdownString` and then exported via `$convertToMarkdownString` inside a headless editor — for any input string that is already canonically normalized in Cork's chosen Markdown dialect.

#### Scenario: A heading round-trips through the transformer set

- **WHEN** a test imports `# Hello` into a headless editor with Cork's `MARKDOWN_TRANSFORMERS`
- **AND** exports the resulting editor state back to Markdown
- **THEN** the exported string SHALL equal `# Hello`

#### Scenario: A nested blockquote round-trips at depth 2

- **WHEN** a test imports `> > Hello` into a headless editor with Cork's `MARKDOWN_TRANSFORMERS`
- **AND** exports the resulting editor state back to Markdown
- **THEN** the exported string SHALL equal `> > Hello`
- **AND** the intermediate editor state SHALL contain a depth-2 nested `QuoteNode` tree (`QuoteNode → QuoteNode → ParagraphNode → TextNode("Hello")`)

### Requirement: Custom plugin keyboard contracts SHALL be testable via dispatched Lexical commands

Every custom plugin in `src/components/molecules/MarkdownEditor/` whose behavior is gated on a key-press SHALL respond to a programmatic `editor.dispatchCommand(KEY_*_COMMAND, mockEvent)` invocation inside a test, without requiring a real OS-level keyboard event.

#### Scenario: `QuoteExitPlugin` responds to a dispatched Backspace command

- **WHEN** a test renders a `LexicalComposer` with `QuoteExitPlugin` registered (inside the Playwright Chromium page)
- **AND** seeds the editor state with an empty `QuoteNode` whose `ParagraphNode` child is the only block
- **AND** places the selection inside that empty paragraph
- **AND** dispatches `KEY_BACKSPACE_COMMAND` with a mock `KeyboardEvent`
- **THEN** the editor state SHALL contain a single `ParagraphNode` at the root (the `QuoteNode` SHALL have been unwrapped)

### Requirement: A shared MarkdownEditor test-utility module SHALL provide the helpers tests need

The directory `src/components/molecules/MarkdownEditor/__tests__/` SHALL contain a `utils.tsx` module that exports a minimal set of helpers covering the three testable surface shapes the initial slice locks in (pure helper, transformer round-trip, plugin keyboard contract) — and SHALL be structured so the fourth shape (plugin live-typing transforms driven by `registerUpdateListener`) can be exercised with the same helpers when a follow-up change adds its template. The module SHALL be the single source of truth for "how do I write a MarkdownEditor test" so individual test files do not re-derive setup boilerplate.

#### Scenario: `createTestHeadlessEditor()` returns a headless editor with all Cork nodes registered

- **WHEN** a test calls `createTestHeadlessEditor()`
- **THEN** the returned editor SHALL be a `LexicalEditor` instance
- **AND** SHALL have `HeadingNode`, `QuoteNode`, `ListNode`, `ListItemNode`, `CodeNode`, `CodeHighlightNode`, `LinkNode`, `AutoLinkNode`, `HorizontalRuleNode`, `TableNode`, `TableCellNode`, `TableRowNode` registered (the same set the production `MarkdownEditor` registers)
- **AND** SHALL throw on internal errors (`onError: e => { throw e }`) so test failures surface immediately

#### Scenario: `renderTestEditor()` mounts a LexicalComposer configured like production

- **WHEN** a test calls `renderTestEditor()`
- **THEN** the call SHALL render a `LexicalComposer` whose registered nodes and theme match the production `MarkdownEditor`'s `initialConfig`
- **AND** SHALL return an object containing the captured `LexicalEditor` instance, the locator-aware `screen` produced by the renderer, and a `userEvent` API for keyboard/click simulation

#### Scenario: `$setMarkdown` and `$readMarkdown` round-trip without setup boilerplate

- **WHEN** a test calls `$setMarkdown(editor, "# Hi")` against a headless editor
- **AND** then calls `$readMarkdown(editor)`
- **THEN** the second call SHALL return `"# Hi"` (the helpers internally wrap `editor.update` / `editor.getEditorState().read` and apply `MARKDOWN_TRANSFORMERS`)

### Requirement: CI SHALL run the test suite on every push and pull request

The repository's GitHub Actions workflow SHALL execute `bun run test` as a blocking step on every push to `main` and every pull request, after first installing the Playwright Chromium binary the runner needs. A test failure SHALL cause the workflow to fail.

#### Scenario: Tests run on every pull request

- **WHEN** a pull request is opened or updated
- **THEN** the `lint` workflow job SHALL install the Playwright Chromium browser (with version-keyed caching)
- **AND** SHALL run `bun run test` after the existing `bun run lint` step
- **AND** the job SHALL fail (red check on the PR) if any test fails
