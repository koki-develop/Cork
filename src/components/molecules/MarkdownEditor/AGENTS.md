# MarkdownEditor (`src/components/molecules/MarkdownEditor/`)

WYSIWYG Markdown editor (Lexical) for the task body. **Uncontrolled** — seeded once from `initialValue`, emits a Markdown string via `onChange`, forwards `onBlur`. Inline Markdown shortcuts + undo/redo + selection-triggered floating toolbar (no static toolbar, no slash commands).

`onOpenLink` is a required prop (Tauri side-effect injected from the page per the org/molecule contract).

`MarkdownEditor.tsx` exports `NODES` and `buildInitialConfig`. **Tests must import both** so the test editor always matches production's node set + theme + state-seed pipeline (`$convertFromMarkdownString` → `$insertSpacersBetweenAdjacentQuotes` → `$highlightAllCodeBlocks`).

## Custom plugins

One-line summaries — each plugin file's header comment owns the why-this-design rationale.

- **`LinkOpenPlugin`** — click a link → `onOpenLink(url)` to the system browser.
- **`ListTabIndentationPlugin`** — Tab / Shift+Tab indent inside list items.
- **`ListExitPlugin`** — Backspace at list-item start exits the list instead of folding into the previous line; Ctrl+A across a leading list clears the doc (snapshot-gated so word-select doesn't trigger).
- **`NoListInTablePlugin`** — safety net that unwraps any `ListNode` that slips into a `TableCellNode` via a non-transformer path (raw command, paste of pre-built nodes).
- **`CodeBlockEscapePlugin`** — Shift+Enter exits a code block; Up/Down at top/bottom edge escape.
- **`CodeBlockHighlightPlugin`** — async syntax highlighting via Shiki.
- **`FloatingFormatToolbarPlugin`** — selection bubble toolbar (bold / italic / strike / inline-code).
- **`FloatingLinkEditorPlugin`** — Notion-style hover panel for editing manual `[text](url)` links (excludes autolinks, which round-trip as text).
- **`PasteLinkPlugin`** — selection + pasted URL → wrap as `[text](url)`. Bails inside an existing link / code block / cross-block / cross-line selection.
- **`QuoteNestingShortcutPlugin`** — live `> ` inside an existing quote converts to a deeper nested QuoteNode (upstream's element-transformer shortcut only fires at root).
- **`QuoteExitPlugin`** — Enter on an empty trailing quote line and Backspace at the start of a quote line exit / unwrap correctly. Also handles the spacer paragraph between two adjacent QuoteNodes.
- **`HorizontalRuleKeyboardPlugin`** — Up/Down arrows can select an adjacent `HorizontalRuleNode` (Lexical's default vertical handlers leap over block decorators).
- **`FormatFormattableTextPlugin`** — owns ranged `FORMAT_TEXT_COMMAND`: skips code-block text, and toggles by "enable unless all targets already have the format" (matches the toolbar's active state).
- **`FormatShortcutPlugin`** — inline-format shortcuts (`**bold**` / `*italic*` / `~~strike~~` / `` `code` `` / `==hi==` / `***bi***` / `___bi___`) with the same set-ON semantics as the toolbar (upstream toggles based on the first node's state).
- **`CheckListShortcutPlugin`** — live `[ ] ` / `[x] ` typed inside a bullet item converts to a check list; rewrite tagged `HISTORY_MERGE_TAG` so undo lands on the pre-marker state.
- **`CheckListIndentPlugin` / `CheckListOutdentPlugin`** — own `INDENT_/OUTDENT_CONTENT_COMMAND` so Tab / Shift+Tab across mixed list types preserves each item's `__listType` (upstream silently re-types items into the receiving list).
- **`TableKeyboardPlugin`** — keyboard-only table editing (Tab adds column on rightmost cell; Enter adds row / exits trailing empty row; Backspace deletes empty column / row; cell-aware Arrow up/down; auto-scrolls the wrapper on cell focus).

Lexical's built-in `AutoLinkPlugin`, `ListPlugin`, `CheckListPlugin`, `TablePlugin`, `HorizontalRulePlugin`, `MarkdownShortcutPlugin` are also enabled — see `MarkdownEditor.tsx` for the full plugin order.

## Shared helpers

- **`codeBlock.ts`** — `$getSelectedTextNodes` (selection's text nodes with zero-width boundaries dropped, matching `selection.extract()`'s trim shape), `$isInsideCodeBlock`, `$isFormattableTextNode`, `$getSelectedFormattableTextNodes`. Use these so the toolbar's active state and a command's toggle direction always read the exact same node set.
- **`link.ts`** — `$closestProseLink`, `isBrowserOpenable`.
- **`placement.ts`** — viewport positioning for the two floating panels.
- **`tableHelpers.ts`** — `$cellFromSelection`, `$tableOf`, `$rowOf`, `$isCellEmpty`, `$isRowEmpty`, `$isColumnEmpty`, `$isHeaderRow`, `$hasBodyRow`.

## Architectural decisions

These are cross-cutting trade-offs that are not localized in any single file. The fine-grained mechanics live in code comments alongside the implementation.

**Quote tree shape — `QuoteNode > ParagraphNode > inline`, not the upstream flat `QuoteNode > inline`.** Cork-owned QUOTE element transformer in `transformers.ts` replaces upstream's (filtered out of the merged list). Two reasons: (1) nested `> > >` imports as nested QuoteNodes (one per depth level) instead of literal `>` text; (2) the wrapping paragraph becomes the nearest block ancestor, so the default Enter split lands a sibling paragraph **inside** the QuoteNode — no `insertNewAfter` override needed for the non-empty case. Adjacent QuoteNodes get an empty spacer paragraph restored after import via `$insertSpacersBetweenAdjacentQuotes` (the upstream import strips it).

**Check-list transformer ordering.** `STRICT_CHECK_LIST` registered **ahead** of `UNORDERED_LIST` / `ORDERED_LIST` so first-match-wins import reads `- [ ] task` as a check item, not a bullet whose body is `[ ] task`. The regex is intentionally tighter than upstream's `CHECK_LIST` (required single-space marker prefix, required `(\s|x)` inside the brackets) — anything that doesn't round-trip byte-identically with `$listExport`'s output stays as literal text on both import and export.

**Lists inside table cells are banned.** Cell key surface (Tab navigation, Backspace-deletes-column) conflicts with list key surface (Tab to indent, Backspace to exit), and nested lists don't fit a cell's footprint. Enforced two-layer: `cellAware` wrappers around the list transformers in `transformers.ts` (typed `- ` / `1. ` / `- [ ] ` inside a cell stays literal text), and `NoListInTablePlugin` as the safety net for raw-command / paste paths. The `HORIZONTAL_RULE` transformer has the same cell guard for `---` / `***` / `___`.

**Horizontal rule marker normalization.** Import accepts `---` / `***` / `___`; export always writes `---` (`HorizontalRuleNode` doesn't carry the source marker). Files using `***` or `___` get rewritten on first save — deliberate trade-off, unlike tables which preserve their input shape.

**Format-shortcut / `MarkdownShortcutPlugin` split.** Text-format transformers (`MARKDOWN_TEXT_FORMAT_SHORTCUT_TRANSFORMERS`) are passed only to `FormatShortcutPlugin`; everything else (`MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS`) goes to upstream's `MarkdownShortcutPlugin`. Import/export still use the full `MARKDOWN_TRANSFORMERS`.

**Table round-tripping.** Created live by typing one pipe row + Space/Enter (Space → grow header, Enter → finish header + add body row). On import the literal source shape is preserved (no auto-promotion of bare rows). Cell bodies are escape-encoded (`encodeCell` / `decodeCell` handle `\`, `|`, newlines) so a `|` inside a cell isn't read as a column boundary on reload. Export always emits `| --- |` after the first row so output is valid GFM.

## Testing

Specs live next to their target as `*.spec.ts` / `*.spec.tsx`. Shared helpers in `__tests__/utils.tsx` — go through them so every test starts from the production-shaped editor.

| Shape                      | Example                                                                            | When to use                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure `$`-helper            | `codeBlock.spec.ts`                                                                | Pure structural / tree-walk helpers. Wrap with `createTestHeadlessEditor()` — no React, no DOM mount.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Transformer round-trip     | `transformers.spec.ts`, `transformers.quote.spec.ts`, `transformers.table.spec.ts` | Import/export through `MARKDOWN_TRANSFORMERS`. `$setMarkdown` + `$readMarkdown` on a headless editor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Plugin keyboard contract   | `QuoteExitPlugin.spec.tsx`, `TableKeyboardPlugin.spec.tsx`                         | A plugin gated on a key press. `renderTestEditor({plugins: <YourPlugin />})` + `dispatchKeyDown(editor, "Backspace")`. The helper wraps the dispatch in a discrete `editor.update` so the listener's mutations commit synchronously (default dispatch defers to a microtask). Pair with `<TablePlugin>` when the plugin under test depends on TableNode behaviors.                                                                                                                                                                                                        |
| Live-typing → rendered DOM | `markdownShortcuts.spec.tsx`, `tableShortcuts.spec.tsx`                            | "Type chars → DOM mutates" (shortcuts, converters). `renderTestEditor` with the plugin and its transformer set, then `await user.click(textbox); await user.keyboard(...)`. Use real `userEvent` from `vitest/browser` (CDP events — composition / `beforeinput` / selection behave like a real keystroke). The MarkdownShortcutPlugin only fires its element transformers when the LAST char typed is a space (or on Enter via `triggerOnEnter: true`); the trigger char shape determines which commit branch runs (e.g. TABLE's `$seedHeaderColumn` vs `$seedBodyRow`). |
| Node-transform safety net  | `NoListInTablePlugin.spec.tsx`                                                     | A plugin whose contract is "if a node lands here in a forbidden shape, rewrite it" (no key press, no typing). Programmatically build the forbidden shape inside `editor.update({discrete: true})`; the plugin's `registerNodeTransform` callback fires on commit and Lexical re-fires until no dirty matching nodes remain — assert the post-transform shape directly.                                                                                                                                                                                                    |
| Mount-time initial value   | `MarkdownEditor.spec.tsx`                                                          | "Open an existing task body" path. `renderTestEditor({initialValue: "..."})` runs the production `buildInitialConfig` initializer end-to-end.                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Assert against the structural triple** — `editorRoot.children` length + `firstElementChild.tagName` + `firstElementChild.textContent` — rather than `toBeInTheDocument()` / `toBeVisible()` alone. The matchers pass even when an extra paragraph renders alongside the expected one; the triple pins the rendered shape exactly without freezing theme classes or Lexical-internal attributes (`dir`, `data-lexical-text`, ...) that an `innerHTML` snapshot would lock down.

**Import conventions** (NOT interchangeable with Testing Library):

- `render` from `vitest-browser-react` — returns retry-able `Locator`s integrated with `expect.element`. `await render(...)` (it resolves after the first effect flush).
- `userEvent` / `page` from `vitest/browser` — real Chrome DevTools Protocol events.
- `expect.element(...).toBeInTheDocument()` etc. are built into `@vitest/browser` (27 matchers, auto-registered). **Do NOT** import from `@testing-library/*` — different `render`, faked `userEvent`, different cleanup timing.
