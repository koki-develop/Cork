## 1. Wire `CodeHighlightNode` and the theme record

- [x] 1.1 In `src/components/molecules/MarkdownEditor/MarkdownEditor.tsx`, import `CodeHighlightNode` from `@lexical/code` alongside the existing `CodeNode` / `$isCodeNode` imports.
- [x] 1.2 Add `CodeHighlightNode` to the `NODES` array (after `CodeNode`). Update the surrounding comment to note that `CodeHighlightNode` is required by the highlight transforms registered by `CodeBlockHighlightPlugin`.
- [x] 1.3 Add the `codeHighlight` Prism-token-to-Tailwind mapping to the `theme` literal exactly as specified in `design.md` Decision 6 (full mapping table).

## 2. Create `CodeBlockHighlightPlugin`

- [x] 2.1 Create the new file `src/components/molecules/MarkdownEditor/CodeBlockHighlightPlugin.ts` (NOTE: `.ts`, not `.tsx` — this plugin returns `null` and registers only transforms, matching `CodeBlockEscapePlugin.ts` and the other transform-only plugins in this folder) and add a header comment that explains: (a) WHY we register our own transforms instead of calling `registerCodeHighlighting` (decision 2 — avoids `registerCodeIndentation`'s ArrowUp trap at code-block start), and (b) WHY we own a custom `Tokenizer.$tokenize` instead of using `PrismTokenizer.defaultLanguage` (decision 3 — the three rules need different behavior for "unspecified" vs "unsupported", which a single default-language setting cannot express).
- [x] 2.2 Define the two tokenizer instances at module scope:
  - Use the public `PrismTokenizer` (re-exported from `@lexical/code`) as-is for rules 1 & 2 (its `defaultLanguage` is `'javascript'` = `DEFAULT_CODE_LANGUAGE`).
  - Define `const PLAIN_TOKENIZER: Tokenizer = { ...PrismTokenizer, defaultLanguage: null }` for rule 3. Add a one-line comment explaining that spreading carries `$tokenize` over with `this`-bound access to the overridden `defaultLanguage`, so calling `PLAIN_TOKENIZER.$tokenize(node, undefined)` takes the `$plainifyCodeContent` branch upstream.
- [x] 2.3 Implement `resolveHighlightLanguage(stored)` per design Decision 3:
  - Returns `null` if `stored` is `null` / `undefined` / empty (rule 3).
  - Normalizes via `normalizeCodeLanguage(stored)`. If the normalized value is `plain` (matching the `plain` / `plaintext` / `text` aliases), return `null` (rule 3 short-circuit; see design Risks section).
  - If `getCodeLanguages().includes(normalized)`, return `normalized` (rule 1).
  - Otherwise return `DEFAULT_CODE_LANGUAGE` (rule 2 auto).
- [x] 2.4 Implement `getDiffRange(prev, next)` (port from `@lexical/code-prism/src/CodeHighlighterPrism.ts:266–311`): leading-match scan + trailing-match scan, returns `{from, to, nodesForReplacement}`. Add an `isEqual(a, b)` helper that compares two nodes as equal when both are `CodeHighlightNode`s with the same `__text` + `__highlightType`, OR both `TabNode`, OR both `LineBreakNode`.
- [x] 2.5 Implement `$updateAndRetainSelection(nodeKey, updateFn)` (port from `CodeHighlighterPrism.ts:203–262`): capture the caret's character offset within the code block, run `updateFn()`, then re-seat the caret at the same offset by walking the (newly-spliced) children.
- [x] 2.6 Implement `$codeNodeTransform(editor, transformState, node)`:
  - Resolve `effective = resolveHighlightLanguage(node.getLanguage())`.
  - Build `nextNodes = effective === null ? PLAIN_TOKENIZER.$tokenize(node, undefined) : PrismTokenizer.$tokenize(node, effective)`.
  - Run the re-entry guard (`transformState.nodesCurrentlyHighlighting`), then `$updateAndRetainSelection(nodeKey, () => { ... splice the diff range ... })`. Clear the guard inside an `$onUpdate(...)` callback (mirrors upstream's `didTransform` pattern).
  - **Do NOT** call `node.setLanguage(...)` under any branch (Decision 4).
- [x] 2.7 Implement `$textNodeTransform(editor, transformState, node)`:
  - If `node`'s parent is a `CodeNode`, delegate to `$codeNodeTransform(editor, transformState, parent)`.
  - Else if `$isCodeHighlightNode(node)`, replace it with `$createTextNode(node.__text)` (the "code block converted to paragraph" path).
- [x] 2.8 Export the React component `CodeBlockHighlightPlugin()` that calls `useLexicalComposerContext()` and registers the three transforms (`CodeNode` + `TextNode` + `CodeHighlightNode`) inside a `useEffect` via `mergeRegister`, returning the disposer.
- [x] 2.9 Extract the splice-once logic into `$tokenizeCodeNode(node)` (no selection retention, no re-entry guard) so it can be shared with the editorState-init sweep. `$codeNodeTransform` calls it inside `$updateAndRetainSelection`; `$highlightAllCodeBlocks` calls it directly.
- [x] 2.10 Export `$highlightAllCodeBlocks(): void` that walks `$nodesOfType(CodeNode)` and calls `$tokenizeCodeNode` on each. This is the public entry point for the editorState initializer to pre-tokenize every code block before the `useEffect`-time transform sweep — fixes the mount-time phantom-onChange bug that would otherwise auto-save every task open (see design.md Decision 4 "The mount-time onChange trap and its fix").

## 3. Mount the plugin

- [x] 3.1 In `MarkdownEditor.tsx`, import `CodeBlockHighlightPlugin` AND `$highlightAllCodeBlocks` from `./CodeBlockHighlightPlugin`.
- [x] 3.2 Mount `<CodeBlockHighlightPlugin />` inside `<LexicalComposer>`, immediately after `<CodeBlockEscapePlugin />` (locality with the other code-block plugins).
- [x] 3.3 Update the `editorState` initializer to call `$highlightAllCodeBlocks()` immediately after `$convertFromMarkdownString(initialValue, MARKDOWN_TRANSFORMERS)`. This pre-tokenizes every code block inside the HISTORY_MERGE-tagged init context, fixing the mount-time phantom-onChange bug.
- [x] 3.4 Extract the per-token Tailwind classes into module-scope constants (`TOK_KEYWORD`, `TOK_LITERAL`, `TOK_NUMBER`, `TOK_NAME`, `TOK_MARKUP`, `TOK_GLUE`, `TOK_COMMENT`) and reference them from `theme.codeHighlight` so each color is defined in one place.

## 4. Verify the surrounding code-block helpers still work

- [x] 4.1 Re-read `src/components/molecules/MarkdownEditor/codeBlock.ts` and confirm `$isInsideCodeBlock` / `$isFormattableTextNode` / `$getSelectedFormattableTextNodes` still treat `CodeHighlightNode` content as non-formattable (they should — they walk ancestors to find a `CodeNode`, which is unchanged).
- [x] 4.2 Update the comment in `codeBlock.ts:$isInsideCodeBlock` (lines 4–8) to remove the parenthetical "(this editor doesn't register syntax highlighting, so it never becomes a `CodeHighlightNode`)" — the new editor DOES register highlighting; the function still works because it walks ancestors.
- [x] 4.3 Update the comment block in `CodeBlockEscapePlugin.ts` (lines 113–121) to reflect the new third representation (alternating `CodeHighlightNode` + `LineBreakNode` children under `CodeNode`); confirm the offset-walk logic still terminates correctly on that representation.
- [x] 4.4 Skim `PasteLinkPlugin.ts` to confirm its code-block exclusion uses `$isInsideCodeBlock` and so is unchanged by the new representation.

## 5. Manual verification matrix

- [x] 5.1 Run `bunx tsc --noEmit` from the repo root and confirm zero errors.
- [x] 5.2 Run `bun run lint` and confirm zero errors.
- [x] 5.3 Run `bun run fmt:check` and confirm clean.
- [x] 5.4 Start `bun run tauri dev` and walk through the following matrix in a task body:
  - [x] 5.4.1 Type ` ```js \n const x = 1; // hello \n ``` ` — confirm `const` is colored, `1` is colored, `// hello` is muted+italic.
  - [x] 5.4.2 Type ` ```typescript \n type Foo = "bar"; \n ``` ` — confirm the alias resolves and TS-specific tokens color.
  - [x] 5.4.3 Type ` ```go \n func main() {} \n ``` ` — confirm the block highlights (rule 2 auto, even though `go` is unbundled).
  - [x] 5.4.4 Type ` ```\n const x = 1;\n``` ` (no info string) — confirm NO highlighting (uniform `cork-text`).
  - [x] 5.4.5 Type ` ```text \n const x = 1;\n``` ` — confirm NO highlighting (rule 3 short-circuit on `plain` alias).
- [x] 5.5 Round-trip verification:
  - [x] 5.5.1 Open a task whose body contains a bare ` ``` ` fence, close without editing, confirm the on-disk file is byte-identical to before opening.
  - [x] 5.5.2 Open a task whose body contains ` ```go ` fence, close without editing, confirm the info string is still `go` on disk (NOT rewritten to `javascript`).
- [x] 5.6 Keyboard regression matrix:
  - [x] 5.6.1 Paragraph → code block: place caret at line 1 col 0 of the code block, press ArrowUp, confirm caret moves to the paragraph above (no trap).
  - [x] 5.6.2 First-block code block: confirm the existing `CodeBlockEscapePlugin` ArrowUp escape (inserts a paragraph before) still works.
  - [x] 5.6.3 Inside a code block: press Shift+Enter, confirm a paragraph is inserted after and caret moves to it.
  - [x] 5.6.4 Inside a code block: type `**bold**`, confirm it stays literal (inline format guard still works).
  - [x] 5.6.5 Inside a code block with multiple lines: press ArrowUp from line 3, confirm caret moves to line 2 (within-block arrow navigation works).
  - [x] 5.6.6 Outside a code block (e.g. in a list): press Tab, confirm the list indents (`ListTabIndentationPlugin` is unaffected).
- [x] 5.7 Visual review against `cork-bg` (the code-block well):
  - [x] 5.7.1 Confirm every Prism token color in a JavaScript sample is legible on the dark well. Run the lowest-contrast pair (`cork-accent` for `keyword` on `cork-bg`) through a WCAG contrast checker (e.g. WebAIM); if it fails AA at the editor's `text-xs` size, switch `keyword` to `cork-accent-hover`.
  - [x] 5.7.2 Open an HTML and a CSS sample to catch the two known color overlaps from design.md Decision 5: (a) is `cork-text/70` (`punctuation`/`operator`) too close to `cork-muted` (`comment`)? (b) in attribute-heavy markup, does the `attr-name` (amber) + numeric literal (amber) overlap read as too noisy? Adjust the theme record per the design's "Mitigation" notes if either fails review.

## 6. Update OpenSpec

- [x] 6.1 Run `openspec status --change "code-block-syntax-highlight"` and confirm `isComplete: true`.
- [x] 6.2 When ready to merge, run the OpenSpec archive flow to fold this change into `openspec/specs/task-body-editor/spec.md` (delete the change directory after archiving).
