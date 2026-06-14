# MarkdownEditor (`src/components/molecules/MarkdownEditor/`)

WYSIWYG Markdown editor (Lexical) for the task body. Seeded once from `initialValue` (uncontrolled), emits a Markdown string via `onChange`, forwards `onBlur`. Inline Markdown shortcuts + undo/redo, plus a selection-triggered floating toolbar (no static toolbar / slash commands).

`onOpenLink` is a required prop (Tauri side-effect injected from the page per the org/molecule contract).

## Custom plugins

Seven custom plugins bundled in this folder (Lexical's own `AutoLinkPlugin` / `ListPlugin` / `TablePlugin` / `HorizontalRulePlugin` are listed where relevant below):

- **`LinkOpenPlugin`** — click a link → `onOpenLink(url)`, wired to the system browser; handles both `[text](url)` links and bare URLs.
- **`ListTabIndentationPlugin`** — Tab / Shift+Tab indent-outdent inside list items only.
- **`CodeBlockEscapePlugin`** — Shift+Enter exits a code block; ArrowUp/ArrowDown escape a block at the document's top/bottom edge.
- **`FloatingFormatToolbarPlugin`** — select text → a "bubble" toolbar fades in above it to toggle bold / italic / strikethrough / inline-code; mouse-first, portaled to `document.body`, buttons `preventDefault` mousedown to keep the selection.
- **`FloatingLinkEditorPlugin`** — Notion-style hover editor: dwell on a manually-authored `[text](url)` link → a panel fades in below it to open / edit / remove the URL; hover- not selection-driven, so every mutation targets the link by node key — `setURL` to edit, unwrap to remove — never `TOGGLE_LINK_COMMAND`; a show/hide grace timer bridges the gap between link and panel; bare-URL `AutoLinkNode`s are excluded since they round-trip as text and are edited by editing their text. Hover is the sole entry point (mouse-first, like the format toolbar — no keyboard / touch path), and links are created only by typing Markdown `[text](url)`; both are deliberate trade-offs for this desktop editor.
- **`HorizontalRuleKeyboardPlugin`** — Up/Down arrows select an adjacent `HorizontalRuleNode` as a node selection instead of skipping it. Lexical's left/right already step onto a rule, but its vertical handlers deliberately leap over block decorators; this plugin restores the symmetry (runs at `COMMAND_PRIORITY_LOW`, above rich-text's `EDITOR`, and bails unless a rule is the next/previous block) so the caret can land on a rule and delete it. Edge detection is geometric — the caret's client rect vs. the block's — so the rule is reachable from _any_ column of the touching visual line (last line for Down, first for Up), not just the block's start/end, while a wrapped paragraph still navigates line-by-line internally.
- **`FormatFormattableTextPlugin`** — owns ranged `FORMAT_TEXT_COMMAND`: formats only prose, never code-block text (which the Markdown serializer would silently drop), and toggles direction by "enable unless every formattable node already has the format", so a mixed selection always enables, consistent with the toolbar's active state, instead of Lexical's first-node-dependent toggle.

Lexical's **`AutoLinkPlugin`** wraps bare `https://` / `http://` URLs (typed or loaded from file) in `AutoLinkNode`s so they're clickable without `[text](url)` syntax; the Markdown serializer skips `AutoLinkNode`, so URLs round-trip as raw text and the file is never rewritten to `[url](url)`; fenced code blocks are excluded via `excludeParents`. Lexical's **`ListPlugin`** supplies empty-item Enter-to-exit.

## Shared helpers

- **`codeBlock.ts`** — formattable-text helpers (`$isInsideCodeBlock`, `$isFormattableTextNode`, `$getSelectedFormattableTextNodes` — the last trims zero-width boundary nodes so the toolbar's active state and the command's toggle direction read the exact same node set), used by both the toolbar and `FormatFormattableTextPlugin`.
- **`link.ts`** — shared link helpers (`$closestProseLink`, `isBrowserOpenable`).
- **`placement.ts`** — the two floating panels' viewport positioning (`firstLineAnchor`, `placeCenteredAbove`, `placeBelowStart`).
- **`tableHelpers.ts`** — shared table selection/structure helpers (`$cellFromSelection`, `$tableOf`, `$rowOf`, `$isCellEmpty`, `$isRowEmpty`, `$isColumnEmpty`, `$isHeaderRow`, `$hasBodyRow`).

## Horizontal rules

Lexical's `HorizontalRulePlugin` + built-in `HorizontalRuleNode` (an `<hr>` decorator) render thematic breaks. A rule is authored by typing `---`, `***`, or `___` on its own line (the `HORIZONTAL_RULE` element transformer in `transformers.ts` is `triggerOnEnter`); `@lexical/markdown`'s defaults have none, so we add it. Import accepts all three CommonMark markers (3+ chars, non-spaced only — a spaced `- - -` would collide with an unordered-list item); export always writes `---`. This means only `---` round-trips byte-for-byte: a file that used `***` or `___` has its rules **normalized to `---`** the first time the body is edited and saved (a deliberate trade-off — `HorizontalRuleNode` doesn't carry which marker it came from — unlike tables, which preserve their input shape). The transformer also bails inside table cells (`$getTableCellNodeFromLexicalNode`, mirroring `TABLE`), so a cell body of literally `---`/`***`/`___` stays text instead of nesting an `<hr>` in the cell. Styling lives in `style.css` (`cork-hr` draws the line + click target via `::after`, `cork-hr-selected` outlines the selected rule) and is wired through the editor theme's `hr` / `hrSelected` keys; the rule is selectable (and thus deletable) by click, by left/right caret, and — via `HorizontalRuleKeyboardPlugin` — by up/down caret.

## Tables

Lexical's `TablePlugin` enables `TableNode` (cell selection, Tab navigation, `INSERT_TABLE_COMMAND`).

### Creation & round-tripping

- A table is created by typing one GFM pipe row (`| a |`) and committing it — the `TABLE` transformer is `triggerOnEnter` so both Space and Enter commit, and the trailing-whitespace of `match[0]` tells them apart: **Space** keeps building the header (promotes the row to a header and appends an empty header column, caret parked there to name the next column), **Enter** finishes the header (promotes it and adds an empty body row, caret in the first body cell).
- On _import_ (`isImport`) the source's literal shape is kept instead (a bare row stays header-less until the source divider promotes it, body rows arrive as their own lines), so files round-trip unchanged. The divider regex requires `-+` per column (not `-*`) so a blank `|  |` row isn't mistaken for a divider on reload.
- Cells are trimmed on creation (`| aaa |` → `aaa`) and their bodies are escaped on export / unescaped on import (`encodeCell`/`decodeCell`: `\`, `|` and newlines → `\\`/`\|`/`\n`) so a `|` inside a cell isn't read as a column boundary on reload; import splits rows on unescaped pipes only (`/(?<!\\)\|/`).
- Export emits the `| --- |` divider after the first row unconditionally (not per `__headerState`) so the output is always valid GFM (delimiter on line 2, exactly one header).
- The `TABLE` transformer bails (returns false) when its matched row sits inside a table cell (`$getTableCellNodeFromLexicalNode(parentNode)`), so a cell whose text looks like a pipe row — typed live or restored from a cell body on import — stays literal text instead of nesting a table. On import the guard also restores the line text (`$importBlocks` slices the matched text off the node before calling `replace` and doesn't roll back on a false return), or a cell body like `| x |` would reload empty.

### `TableKeyboardPlugin` (editing surface)

Keyboard-only, no toolbar — the table grows/shrinks under the keys (all handlers at `COMMAND_PRIORITY_CRITICAL` so they win over TablePlugin's built-in HIGH Tab/delete handlers, and each returns false the instant the caret isn't in its situation):

- **Tab** on the rightmost cell adds a column to the right and steps into it (every other Tab is left to the built-in cell navigation).
- **Enter** adds a row below and moves into it; **Shift+Enter** inserts an in-cell line break; **Enter** on a trailing empty (non-header) row exits below the table, dropping that row.
- **ArrowDown/ArrowUp** keeps moving within a multi-line cell (returns `true` without `preventDefault` so the browser does the native line move, blocking the built-in whose rect heuristic mis-jumps rows from the line after an in-cell break), and on the cell's edge line escapes into a fresh paragraph below/above when the table is the document's last/first block (edge detection is structural via `$hasLineAboveInCell`/`$hasLineBelowInCell`, not rects).
- **ArrowUp** from the block directly below a table (on its first line) enters the last row's _first_ cell rather than wherever native caret-x lands (which jumps to the right edge).
- **Backspace** in an empty cell deletes the column when the whole column is empty (highest-priority, guarded so the last column never goes this way), else jumps to the end of the cell on its left, else in the empty leftmost cell of an empty row deletes that row — a header row is protected (irreversible) unless no body rows remain (`$hasBodyRow`), so the table can still be fully deleted — removing the whole table when it was the last row.
- **Cmd/Ctrl+Backspace** (DELETE_LINE) is reimplemented for cells since TablePlugin swallows it (delete-to-line-start via `modify` + `removeText`, omitting the cell-escaping `deleteCharacter` fallback).

### Layout & selection

- A wide table scrolls horizontally inside a wrapper div (TablePlugin `hasHorizontalScroll` → `theme.tableScrollableWrapper` = `max-w-full overflow-x-auto pb-2`; editor root carries `min-w-0`) rather than widening the dialog — the wrapper, not the `<table>`, because `border-collapse` tables ignore padding, and the wrapper's `pb-2` reserves a strip so the horizontal scrollbar doesn't overlap the last row.
- A `SELECTION_CHANGE` handler (in `TableKeyboardPlugin`) keeps the caret's cell horizontally in view — moving into an off-screen column via Tab / arrows / typing scrolls the wrapper's `scrollLeft` to follow (rAF-deferred so a just-inserted column is laid out first; only the wrapper scrolls, never the page).
- Cross-cell (grid) selection is Lexical's built-in drag-select; it's made visible via the `tableCellSelected`/`tableSelection` theme classes (`cork-table-cell-selected` overlay + `cork-table-grid-selection` native-selection suppression, both in `style.css`) — without them the selection works but shows no highlight.

### Transformers

The default `@lexical/markdown` transformers have no table or horizontal-rule support, so `transformers.ts` exports `MARKDOWN_TRANSFORMERS` = a GFM `TABLE` element transformer (round-trips `TableNode` ⇄ pipe-delimited Markdown; cell bodies recurse through the same list, hard newlines collapse to literal `\n`) plus a `HORIZONTAL_RULE` element transformer (`---`/`***`/`___` ⇄ `HorizontalRuleNode`), both prepended to the defaults; all three of import / export / `MarkdownShortcutPlugin` use it.
