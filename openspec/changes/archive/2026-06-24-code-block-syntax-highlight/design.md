## Context

`MarkdownEditor` (`src/components/molecules/MarkdownEditor/MarkdownEditor.tsx`) is the WYSIWYG body editor for tasks. It already registers `@lexical/code`'s `CodeNode` (see `MarkdownEditor.tsx:140`) so that fenced code blocks render as a styled, monospaced block (`theme.code` at `MarkdownEditor.tsx:51` paints the well: `bg-cork-bg`, `border-cork-border/50`, `font-mono text-xs`). It also wires up:

- `CodeBlockEscapePlugin` — Shift+Enter / boundary-ArrowUp-Down to escape a code block.
- `FormatFormattableTextPlugin` + `codeBlock.ts:$isFormattableTextNode` — guards that suppress inline formatting (`**bold**`, `==hl==`, etc.) inside code blocks. The guard uses the ancestor-walking `$isInsideCodeBlock` helper.
- The `CODE` transformer (in `transformers.ts`) that round-trips ` ```lang\n…\n``` ` between Markdown text and the `CodeNode` tree.

What's missing: **highlighting**. Today the code block's content is a single `TextNode` child of `CodeNode`, so every character paints in `cork-text`. The user's task (`tasks/[MarkdownEditor] コードブロックのシンタックスハイライトがほしい.md`) lays out three rules that fully specify the desired behavior:

1. **Language specified AND supported** → that grammar's highlighting.
2. **Language specified but unsupported** → "auto" highlighting (i.e. the editor's `DEFAULT_CODE_LANGUAGE` fallback).
3. **Language unspecified** → no highlighting at all, not even auto.

The user also called out one explicit non-goal: changing the language of an existing code block via UI is a **separate task**.

### Dependency landscape (verified)

- `@lexical/code` 0.45.0 is already a dep. It is a thin re-export shim — actual highlighting lives in `@lexical/code-prism`, which it pulls transitively. Confirmed by reading `node_modules` equivalents via `opensrc`:
  - `@lexical/code-prism/src/FacadePrism.ts` does **16** side-effect imports: `prism-c`, `prism-clike`, `prism-cpp`, `prism-css`, `prism-diff`, `prism-java`, `prism-javascript`, `prism-markdown`, `prism-markup`, `prism-objectivec`, `prism-powershell`, `prism-python`, `prism-rust`, `prism-sql`, `prism-swift`, `prism-typescript`. This is the **bundled grammar set**. (The friendly-name map exposes 17 user-facing entries because `html` is an alias for `markup`; the underlying grammar count is 16.)
  - `@lexical/code-prism/src/CodeHighlighterPrism.ts` exports `registerCodeHighlighting(editor, tokenizer?)`, which calls `registerHighlightingOnly` (highlight transforms) **plus** `registerCodeIndentation` (Tab / Shift+Tab / arrow handlers tied to code blocks).
  - `@lexical/code-core/src/CodeNode.ts:58` defines `DEFAULT_CODE_LANGUAGE = 'javascript'`. This is what "auto" resolves to under rule 2.
  - `@lexical/code-prism/src/FacadePrism.ts:74` defines `normalizeCodeLanguage(lang)` (aliases `js→javascript`, `ts→typescript`, `py→python`, `md→markdown`, `text→plain`, etc.).
  - `@lexical/code-prism/src/FacadePrism.ts:116` defines `isCodeLanguageLoaded(lang)` (checks `Prism.languages.hasOwnProperty(lang)`).
- The PUBLIC surface of `@lexical/code` (verified against `packages/lexical-code/src/index.ts`) re-exports: `CodeNode`, `CodeHighlightNode`, `$createCodeHighlightNode`, `$isCodeNode`, `$isCodeHighlightNode`, `DEFAULT_CODE_LANGUAGE`, `getDefaultCodeLanguage`, `PrismTokenizer`, `registerCodeHighlighting`, `normalizeCodeLanguage`, `getLanguageFriendlyName`, `CODE_LANGUAGE_MAP`, `CODE_LANGUAGE_FRIENDLY_NAME_MAP`. It does **NOT** re-export the lower-level helpers `$getHighlightNodes`, `$plainifyCodeContent`, `$mapTokensToLexicalStructure`, `isCodeLanguageLoaded`, or `registerHighlightingOnly`. `isCodeLanguageLoaded` is exported from `@lexical/code-prism` but not bubbled up.
- The single editor instance is `LexicalComposer`-based (not `LexicalExtensionComposer`-based), so the new `CodePrismExtension` path doesn't fit without a deeper refactor.

## Goals / Non-Goals

**Goals:**

- Three-rule behavior as written in the task — exact, no fuzzy fallback.
- No regression to existing keyboard behavior: arrow escape, Shift+Enter escape, Tab in lists, horizontal-rule arrow handling, inline-format guards.
- No regression to Markdown round-trip: the on-disk info string is the source of truth and is **not** rewritten by the highlighter.
- Token coloring that fits the Cork palette and stays legible on `cork-bg` (the code-block well).
- No new npm dependencies. Use only the public API of `@lexical/code` (plus `lexical` for the node primitives we already use).
- The plugin lives inside the `MarkdownEditor/` folder (atomic-design boundary) and is registered alongside the existing plugins in `MarkdownEditor.tsx`.

**Non-Goals:**

- UI affordance to **change** a code block's language post-insertion (deferred to a separate task per the user).
- Line numbers / gutter display (Lexical sets a `data-gutter` attribute; we deliberately leave it unstyled).
- Adding language grammars beyond the 16 already bundled by `@lexical/code-prism`. Anything else falls through to rule 2 (auto).
- A language picker UI for the initial fence creation (fence info strings are typed in Markdown source today; that remains the input surface).
- Highlighting **inline code** (`` `foo` ``). Inline code is a `text.code` formatted `TextNode`, not a `CodeNode`; no Prism semantics apply.
- Theme overrides per code block, custom Prism plugins (line numbers, copy button, diff prefixes beyond Prism's default `diff-*` syntax), or a Shiki upgrade path.

## Decisions

### Decision 1: Use `@lexical/code`'s Prism tokenizer (do not introduce Shiki, Highlight.js, or a custom regex layer)

**Choice**: Reuse the Prism stack that `@lexical/code` already bundles.

**Why:**

- **Zero new bytes**: Prism, the 16 grammars, and the integration glue are already in the dep tree via the existing `@lexical/code` dependency. Adding Shiki or Highlight.js would add hundreds of KB and a second tokenizer pipeline.
- **Integration shape matches**: Lexical's transform model is built around Prism's token stream. `$createCodeHighlightNode` exists exactly to host a Prism token's text + type. Going off-piste means re-implementing diffing and selection retention.
- **Coverage is "good enough"**: the 16 bundled grammars (JS, TS, Python, Rust, Java, C/C++, CSS, markup (HTML/XML), SQL, Swift, Objective-C, PowerShell, Markdown, diff, plus `clike` as base) cover the languages most likely to land in a task body. Anything else falls to rule 2.

**Alternatives considered:**

- **Shiki (textmate-grammar engine)**: more accurate / VS-Code-style coloring, but ~1 MB+ of WASM + grammar bundles, and async tokenization that doesn't compose cleanly with Lexical's synchronous transforms. Overkill for a task-body surface.
- **Highlight.js**: similar token-quality story to Prism, but no Lexical integration — we'd reinvent the node-transform diffing layer.
- **No highlighter, just CSS-class-the-keywords-via-regex**: brittle, breaks on strings/comments, has no path to per-token color anyway because the editor's text is a flat `TextNode`.

### Decision 2: Bypass `registerCodeHighlighting`; write our own thin plugin that registers only the highlight transforms

**Choice**: Implement `CodeBlockHighlightPlugin.ts` that:

1. Registers `CodeHighlightNode` in the editor's `nodes` array (the transforms throw without it — `CodeHighlighterPrism.ts:413` does `editor.hasNodes([CodeNode, CodeHighlightNode])`).
2. Registers a `CodeNode` node transform that re-tokenizes the block's text into `CodeHighlightNode` children per the three rules.
3. Registers a `TextNode` / `CodeHighlightNode` transform that re-tokenizes when raw text appears under a `CodeNode` and reverts a stray `CodeHighlightNode` back to plain `TextNode` if it escapes its `CodeNode` parent (the "code block converted to paragraph" path).
4. Does **NOT** call `registerCodeIndentation`.

**Why — two load-bearing reasons, in this order:**

**(a) Rule 2 dispatch (the dominant reason):** Upstream's `$codeNodeTransform` early-returns when `isCodeLanguageLoaded(language)` is false (`CodeHighlighterPrism.ts:149–155`). For a fenced ` ```go ` block, `Prism.languages['go']` doesn't exist; the upstream transform bails BEFORE calling the tokenizer. **Rule 2 ("info string present but Prism doesn't bundle a grammar → use DEFAULT_CODE_LANGUAGE as auto") cannot be expressed through any custom Tokenizer passed to `registerCodeHighlighting`** — by the time the tokenizer's `$tokenize` would run, the transform has already short-circuited. The only escapes are:

- **Rewrite `node.setLanguage(...)`** to coerce unsupported languages into a bundled one before the transform runs. This breaks the verbatim on-disk round-trip (Decision 4) — opening a ` ```go ` block would silently rewrite the info string to `javascript` on save.
- **Monkey-patch `Prism.languages`** to add an alias for every possible unknown language. Impossible — we don't know the set of strings a user might type.

Owning the transform is the **only** path that preserves both rule 2 and the verbatim round-trip.

**(b) ArrowUp trap (the secondary reason):** Upstream's `registerCodeHighlighting` also calls `registerCodeIndentation`, which installs a `KEY_ARROW_UP_COMMAND` handler at `COMMAND_PRIORITY_LOW` that traps the caret at the first text position of a code block (`CodeIndentation.ts:542–566`, the early `event.preventDefault(); return true` branch when `anchor.offset === 0 && anchorNode.getPreviousSibling() === null && parentIsCode`). The trap fires regardless of whether a preceding paragraph exists, so a user pressing ArrowUp at the top of a non-leading code block can no longer reach the paragraph above — they have to press ArrowLeft first to exit the block. This is solvable in isolation (a `COMMAND_PRIORITY_NORMAL` counter-handler can pre-empt the trap in ~15 lines), but reason (a) already forces us off `registerCodeHighlighting`, so (b) becomes moot.

`registerHighlightingOnly` (which handles (b) without (a) by skipping `registerCodeIndentation`) is marked `@internal` and is **not exported** from the package entry — verified against `@lexical/code-prism/src/index.ts`. So even if rule 2 weren't a concern, the cleanest path to "highlight transforms only, no indent handlers" would still require either reaching into a private API or owning the transforms.

**Alternatives considered (all rejected):**

- **Drop rule 2 and use `registerCodeHighlighting` + a counter-handler for the arrow trap**: violates the task spec (`tasks/[MarkdownEditor] コードブロックのシンタックスハイライトがほしい.md` explicitly requires `auto のシンタックスハイライトをつける` for unsupported languages).
- **`registerCodeHighlighting` + a CodeNode pre-transform that aliases `node.setLanguage('javascript')` for unsupported languages**: breaks Decision 4's on-disk round-trip.
- **Monkey-patch `Prism.languages[anything] = Prism.languages.javascript`** so `isCodeLanguageLoaded` always returns true: mutates a shared global, and we still don't know the unbounded set of strings to alias upfront.
- **Use `CodePrismExtension` with `CodeIndentExtension.disabled = true`**: requires migrating from `LexicalComposer` to `LexicalExtensionComposer`. Out of scope, and still leaves the rule 2 short-circuit problem.

**Cost we accept**: ~120 lines of locally-owned transform code (covered in detail in Decision 6/7). We trade upstream churn risk for the only path that simultaneously expresses all three rules AND preserves the verbatim on-disk round-trip.

### Decision 3: Implement the three rules in our own transform; reuse `PrismTokenizer.$tokenize` for the heavy lifting

**Choice**: Resolve the effective highlight language in our own transform (we call this `resolveHighlightLanguage`), then dispatch to one of two `Tokenizer` objects to do the actual lexical-node construction:

- `PrismTokenizer` (the public, re-exported instance from `@lexical/code`, `defaultLanguage = 'javascript'`) — used for rules 1 and 2. We call `PrismTokenizer.$tokenize(codeNode, effectiveLang)` with the pre-resolved language. Returns `LexicalNode[]` (`CodeHighlightNode`s, `LineBreakNode`s, `TabNode`s).
- `PLAIN_TOKENIZER = { ...PrismTokenizer, defaultLanguage: null }` — used for rule 3. We call `PLAIN_TOKENIZER.$tokenize(codeNode, undefined)` and get the plainified `(TextNode | LineBreakNode | TabNode)[]` shape (because `$tokenize` returns `$plainifyCodeContent(...)` when its resolved `lang` is `null`).

`resolveHighlightLanguage(stored)` returns:

- `null` if `stored` is empty / undefined (rule 3).
- `null` if `normalizeCodeLanguage(stored) === 'plain'` (rule 3 short-circuit — the `plain` / `plaintext` / `text` aliases).
- `normalizeCodeLanguage(stored)` if `getCodeLanguages().includes(normalized)` (rule 1).
- `DEFAULT_CODE_LANGUAGE` otherwise (rule 2 auto).

**Why this works without re-implementing the tokenizer internals:**

- `PrismTokenizer` is a plain object exported from `@lexical/code-prism/CodeHighlighterPrism.ts` and re-exported from `@lexical/code`. Its `$tokenize` method references `$plainifyCodeContent` and `$getHighlightNodes` by closure (both imported at the top of `CodeHighlighterPrism.ts`). When we call `PrismTokenizer.$tokenize(...)` from outside the package, those closures resolve normally — we don't need the private helpers to be re-exported.
- Spreading into `PLAIN_TOKENIZER` carries the same methods over with `defaultLanguage` overridden. Calling `PLAIN_TOKENIZER.$tokenize(...)` binds `this` to `PLAIN_TOKENIZER`, so `this.defaultLanguage` is `null`, and `$tokenize` takes the `$plainifyCodeContent(...)` branch — exactly what rule 3 needs.
- We sidestep `PrismTokenizer.defaultLanguage`'s single-knob limitation (it can't be both `null` for rule 3 and non-null for rule 2) by **picking which tokenizer to call from our transform**, not by configuring one tokenizer's default.
- The upstream `$codeNodeTransform`'s `isCodeLanguageLoaded` early-return (`CodeHighlighterPrism.ts:149–155`) doesn't get in the way because we own the transform (Decision 2) and never go through that path. We pre-resolve the language to one we know Prism can tokenize, so `$tokenize` is always asked a question it can answer.
- `getCodeLanguages()` (re-exported, public) returns the keys of `Prism.languages` filtered to grammars (not helpers). It is the public equivalent of the un-exported `isCodeLanguageLoaded` check.
- `normalizeCodeLanguage` (public, re-exported) maps user-typed aliases (`js`, `ts`, `md`, `py`, `text`, `plaintext`) to their canonical Prism keys before the loaded-check. Without normalization, `js` would fail `getCodeLanguages().includes('js')` (Prism's key is `javascript`) and fall through to rule 2 incorrectly.

**Alternatives considered:**

- **Port `$mapTokensToLexicalStructure` / `$plainifyCodeContent` ourselves** (the earlier version of this design): adds ~80 lines of self-owned code for behavior we get for free by just calling `PrismTokenizer.$tokenize`. Rejected.
- **Hardcode our own allow-list of language aliases**: brittle — we'd diverge from Prism's actual alias table. Better to defer to `normalizeCodeLanguage` + `getCodeLanguages`.
- **Always tokenize and let an unsupported language naturally yield single-text-string Prism tokens**: `Prism.tokenize(code, undefined)` renders the entire block as one untyped span. That's actually rule 3's behavior — but applying it to rule 2 violates the spec.

### Decision 4: The stored info string is sacred — never rewrite it; never fire onChange just from highlighting

**Choice**: The custom tokenizer reads `codeNode.getLanguage()` but never calls `codeNode.setLanguage(...)`. Tokenization is a render-time function of the stored language; the stored language is a function of the on-disk info string and only that. Furthermore, the **initial mount-time tokenization runs inside the `editorState` initializer** (alongside `$convertFromMarkdownString`), NOT as a side effect of the plugin's `useEffect`-time `registerNodeTransform` sweep — so the initial splice happens in Lexical's HISTORY_MERGE-tagged init context and never fires `OnChangePlugin`.

**Why:**

- Upstream's `$codeNodeTransform` rewrites `node.setLanguage(tokenizer.defaultLanguage)` when both the node has no language and `defaultLanguage` is non-null (`CodeHighlighterPrism.ts:139–141`). This silently injects an info string into ` ``` …``` ` blocks — round-tripping `\`\`\`\n…\n\`\`\``as`\`\`\`javascript\n…\n\`\`\``. **Unacceptable**: any task body containing a bare fenced block would silently get rewritten the next time the editor opens.
- Rule 2 (unsupported → auto): we resolve the **effective highlight language** locally inside `resolveHighlightLanguage` and pass `DEFAULT_CODE_LANGUAGE` to Prism. The `CodeNode`'s stored `__language` stays at the user's original value (e.g. `go`). The `CODE` Markdown transformer reads `getLanguage()` on serialize — so the file continues to write ` ```go `, matching what was loaded.
- Side benefit: when the bundled language set grows (Lexical adds Go grammar in a future version), a `go` code block that was previously rule-2 begins to highlight correctly on rule 1 with **zero file changes** and **zero user action**.

**The mount-time onChange trap and its fix:**

`registerNodeTransform` sweeps existing dirty nodes when it registers — Lexical calls `markNodesWithTypesAsDirty` on the registered classes (`LexicalEditor.ts:1367–1370`). If `CodeBlockHighlightPlugin`'s `useEffect` were the only place the transforms ran, then on every mount of an editor containing fenced code blocks, the sweep would replace each `CodeNode`'s single `TextNode` child (the post-`$convertFromMarkdownString` shape) with the Prism-tokenized shape. That splice runs WITHOUT `HISTORY_MERGE_TAG`, dirty-flagging both the element and the leaves. `OnChangePlugin`'s gate (`LexicalOnChangePlugin.ts:35–43`) requires `dirtyElements === 0 && dirtyLeaves === 0` to skip via `ignoreSelectionChange`; both are non-empty, so onChange fires. The consumer (`useTaskDialogState.handleBodyChange`) compares the serialized result against the raw stored body and — because Lexical's Markdown serializer normalizes (`*foo*` ↔ `_foo_`, blank-line counts, etc.) for any non-canonical input — triggers an autosave even though the user did nothing.

The fix is to run the initial tokenization sweep INSIDE the `editorState` initializer:

```ts
editorState: () => {
  $convertFromMarkdownString(initialValue, MARKDOWN_TRANSFORMERS);
  $highlightAllCodeBlocks();  // walks $nodesOfType(CodeNode), splices each
},
```

The `editorState` function form runs inside an editor.update() tagged with `HISTORY_MERGE_TAG` (upstream `LexicalComposer` init path). The splices inside `$highlightAllCodeBlocks` produce dirty flags but don't fire `OnChangePlugin`: OnChangePlugin's `ignoreHistoryMergeTagChange` defaults to true, and OnChangePlugin isn't even mounted yet (it's part of the React tree BELOW `LexicalComposer`). When the plugin's `useEffect` later registers transforms, the sweep finds every `CodeNode` already in its tokenized shape, `getDiffRange` returns an empty diff, the splice is skipped, no dirty flag is set, and onChange remains silent until a real user edit. The documented invariant in `src/components/organisms/board/AGENTS.md:18` ("Because init never emits `onChange`, `body` stays equal to the raw stored Markdown until the user actually edits") is preserved.

**Alternatives considered:**

- **Add a "highlight language" derived field on `CodeNode`**: requires a subclass + custom serialization. Overkill; the upstream transform's "set effective language back onto the node" pattern is the bug, not the model.
- **Tag the plugin's first-sweep splice with `HISTORY_MERGE_TAG` via `$addUpdateTag`**: requires tracking "is this the first sweep?" state inside the transform, since later real-edit transforms must NOT be tagged (or onChange would be permanently suppressed). The editorState-init approach is simpler — initialization-as-initialization, not initialization-via-side-effect.
- **Have the consumer's `handleBodyChange` short-circuit on string equality with `originalRef.current.body`**: shifts the burden onto every consumer of `MarkdownEditor`. Worse: the byte-equal guarantee depends on `$convertToMarkdownString`'s normalization shape being stable, which isn't part of `@lexical/markdown`'s public contract.

### Decision 5: A 7-token Cork-palette color set for `theme.codeHighlight`

**Choice**: Map Prism token types to Tailwind classes drawn from existing `cork-*` tokens. Mapping (full list below in Decision 6):

| Prism token type                               | Color token         | Hex     | Style                       |
| ---------------------------------------------- | ------------------- | ------- | --------------------------- |
| `keyword`, `atrule`, `important`               | `cork-accent`       | #6366f1 | font-semibold (indigo bold) |
| `string`, `char`, `attr-value`, `inserted`     | `cork-success-text` | #4ade80 | (green)                     |
| `number`, `boolean`, `constant`, `symbol`      | `cork-warning-text` | #fbbf24 | (amber)                     |
| `comment`, `prolog`, `doctype`, `cdata`        | `cork-muted`        | #94a3b8 | italic                      |
| `function`, `class-name`, `selector`           | `cork-accent-hover` | #818cf8 | (light indigo)              |
| `tag`, `regex`, `deleted`                      | `cork-danger-text`  | #f87171 | (red)                       |
| `attr-name`, `property`, `variable`, `builtin` | `cork-warning-text` | #fbbf24 | (amber)                     |
| `punctuation`, `operator`, `entity`, `url`     | `cork-text/70`      | —       | (de-emphasized default)     |
| (fallback — any other type)                    | `cork-text`         | #f1f5f9 | inherit                     |

**Why this palette:**

- **Color budget is fixed by Cork's existing tokens** — five chromatic options total (`cork-accent`, `cork-accent-hover`, `cork-success-text`, `cork-warning-text`, `cork-danger-text`) plus `cork-text` and `cork-muted`. Introducing a new `--color-cork-syntax-*` family for syntax highlighting would balloon the design-token surface for one feature. Reusing the existing tokens keeps the editor visually coherent with the rest of the app (link color, focus rings, success/warning toasts).
- **Hierarchy by frequency, not random hue assignment**: comments → muted (low salience), punctuation/operator → 70% text (cheap glue), strings/numbers/keywords → branded colors (high salience). This matches the visual weight users expect from VS Code, GitHub, and Obsidian without copying any specific scheme.
- **Contrast against `cork-bg` (`#020617`, near-black)**: all chosen tokens are intentionally chromatic on a near-black surface, so contrast is expected to be high. The lowest-contrast pair is `cork-accent` (#6366f1) for `keyword` — a mid-saturation indigo. The expectation is that every pair clears WCAG AA for small body text, and most clear AAA. **This SHOULD be verified with a contrast checker during code review** (e.g. WebAIM's contrast checker) and re-checked after the visual review step in `tasks.md` 5.7. If `cork-accent` fails AA, fall back to `cork-accent-hover` (a lighter indigo) for `keyword`.
- **Italic on `comment`, bold on `keyword`**: small typographic cues differentiate semantic groups even for users with color-vision deficiency (we are NOT relying on color alone).
- **Known color overlap — `cork-text/70` vs `cork-muted`**: both composite to a similar mid-grey on `cork-bg` (`cork-text/70` ≈ `#a8acaf` over near-black; `cork-muted` = `#94a3b8`). With the chosen mapping, `comment` (`cork-muted italic`) and `punctuation`/`operator` (`cork-text/70`) lean on the `italic` modifier alone to differentiate. This is **acceptable but borderline**: if visual review judges them too close, switch `punctuation`/`operator` to `cork-text` (full opacity, no de-emphasis) and rely on the italic to set comments apart, OR move `comment` to a different muted color. The mapping in Decision 6 reflects the conservative starting point.
- **Known color overlap — `cork-warning-text` is shared by two groups**: `number`/`boolean`/`constant`/`symbol` AND `attr-name`/`property`/`variable`/`builtin` all map to amber. In attribute-heavy languages (HTML, CSS), the `attr-name` (amber) → `attr-value` (green) alternation reads cleanly, but a numeric literal next to an attribute name would not be visually distinct. **The visual review step (`tasks.md` 5.7) MUST include an HTML/CSS sample alongside JS** to catch this. If it's too noisy, the cleanest fix is to demote `attr-name`/`property`/`variable`/`builtin` to `cork-text/80` (a slightly emphasised default) and keep amber reserved for numeric literals.

**Alternatives considered:**

- **Adopt the Prism "Tomorrow Night" stylesheet wholesale**: introduces a parallel color system that won't track the Cork palette and may clash with focus rings / link color.
- **Single accent + bold-italic-only differentiation (monochrome)**: lower information density, kills the "this is a code block" cognitive cue, doesn't match user expectation for highlighting.
- **Extend `@theme` with a new `--color-cork-syntax-{keyword|string|number|comment|fn}` family**: cleaner namespacing, but adds five tokens for one feature and the existing tokens already cover the cases legibly. Reconsider only if a future feature needs a wider palette (e.g. terminal output).

### Decision 6: Detailed token-class mapping (delivered as a `theme.codeHighlight` record)

The Lexical `EditorThemeClasses.codeHighlight: Record<string, string>` table maps a Prism token type string to a CSS class string. `CodeHighlightNode` reads `theme.codeHighlight[token.type]` at render-time.

The mapping (final form, written into `MarkdownEditor.tsx`'s existing `theme` object):

```ts
codeHighlight: {
  // High-salience semantics
  keyword: "text-cork-accent font-semibold",
  atrule: "text-cork-accent font-semibold",
  important: "text-cork-accent font-semibold",

  // Literals
  string: "text-cork-success-text",
  char: "text-cork-success-text",
  "attr-value": "text-cork-success-text",
  inserted: "text-cork-success-text",
  number: "text-cork-warning-text",
  boolean: "text-cork-warning-text",
  constant: "text-cork-warning-text",
  symbol: "text-cork-warning-text",

  // Names
  function: "text-cork-accent-hover",
  "class-name": "text-cork-accent-hover",
  selector: "text-cork-accent-hover",

  // Markup-shaped tokens (HTML, regex, diff-deleted)
  tag: "text-cork-danger-text",
  regex: "text-cork-danger-text",
  deleted: "text-cork-danger-text",
  "attr-name": "text-cork-warning-text",
  property: "text-cork-warning-text",
  variable: "text-cork-warning-text",
  builtin: "text-cork-warning-text",

  // Glue
  punctuation: "text-cork-text/70",
  operator: "text-cork-text/70",
  entity: "text-cork-text/70",
  url: "text-cork-text/70 underline",

  // De-emphasis
  comment: "text-cork-muted italic",
  prolog: "text-cork-muted italic",
  doctype: "text-cork-muted italic",
  cdata: "text-cork-muted italic",
},
```

Any Prism token type not in this map renders without an extra class, inheriting the parent `code` block's `cork-text` color. That's the desired "graceful unknown token" fallback.

### Decision 7: Plugin structure and registration order

**Choice**: a new file `src/components/molecules/MarkdownEditor/CodeBlockHighlightPlugin.ts` exporting `CodeBlockHighlightPlugin`. (Extension is `.ts`, not `.tsx`: the plugin returns `null` and renders no JSX — matching the project convention used by `CodeBlockEscapePlugin.ts`, `FormatShortcutPlugin.ts`, `HorizontalRuleKeyboardPlugin.ts`, `ListExitPlugin.ts`, `PasteLinkPlugin.ts`, and the rest of the transform-only plugins in this folder. The `.tsx` variants in this folder — `FloatingFormatToolbarPlugin.tsx`, `FloatingLinkEditorPlugin.tsx`, `LinkOpenPlugin.tsx` — render UI.) Registered in `MarkdownEditor.tsx` **after** `CodeBlockEscapePlugin` and adjacent to the other code-block-related plugins. (Order matters only insofar as keyboard handlers register at predictable priorities — this plugin registers no commands, only node transforms, so it composes with anything.)

The plugin's shape:

```ts
import {
  $isCodeHighlightNode,
  $isCodeNode,
  CodeHighlightNode,
  CodeNode,
  DEFAULT_CODE_LANGUAGE,
  PrismTokenizer,
  getCodeLanguages,
  normalizeCodeLanguage,
  type Tokenizer,
} from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $isTabNode,
  $isTextNode,
  $nodesOfType,
  $onUpdate,
  TextNode,
  mergeRegister,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { useEffect } from "react";

export function CodeBlockHighlightPlugin(): null { ... }
```

Internal helpers (private to this file):

- `PLAIN_TOKENIZER: Tokenizer = { ...PrismTokenizer, defaultLanguage: null }` — a sibling tokenizer used only for rule 3. Calling `PLAIN_TOKENIZER.$tokenize(codeNode, undefined)` re-enters upstream's `$tokenize` with `this.defaultLanguage === null`, which takes the `$plainifyCodeContent(...)` branch and returns the plain `(TextNode | LineBreakNode | TabNode)[]` shape — without us needing to re-export or re-implement the upstream helper.
- `BUNDLED_LANGUAGES = new Set(getCodeLanguages())` — module-init snapshot of the Prism grammar set, used for O(1) membership lookups in `resolveHighlightLanguage`. Prism grammars are statically imported via `@lexical/code-prism`'s side-effect imports so the set is frozen at module load.
- `resolveHighlightLanguage(stored: string | null | undefined): string | null` — implements the three-rule decision in one place. Returns `null` for rule 3, the normalized language string for rule 1, and `DEFAULT_CODE_LANGUAGE` for rule 2.
- `$tokenizeCodeNode(node: CodeNode): boolean` — the pure splice-once routine. Computes effective language → calls the appropriate tokenizer → diff-and-splices the children. Returns `true` iff anything changed. Shared between the transform path (wrapped in selection retention + re-entry guard) and the editorState-init path (called directly, no selection to preserve).
- `$codeNodeTransform(transformState, node)` — the transform path. Runs the re-entry guard, then `$updateAndRetainSelection(nodeKey, () => $tokenizeCodeNode(current))`. Clears the guard via `$onUpdate(...)` (mirrors upstream's `didTransform` pattern). **Never calls `node.setLanguage(...)`** under any branch (Decision 4).
- `$textNodeTransform(transformState, node)`: if the text node's parent is a `CodeNode`, delegate to `$codeNodeTransform`. If the node is a `CodeHighlightNode` whose parent is **not** a `CodeNode` (the "code block converted to paragraph" path), replace it with a plain `$createTextNode(node.getTextContent())` so it stops carrying a stale highlight type.

Public exports:

- `CodeBlockHighlightPlugin()` — the React component mounted inside `<LexicalComposer>`. Registers the three transforms via `mergeRegister` on `useEffect`.
- `$highlightAllCodeBlocks()` — called from the `editorState` initializer in `MarkdownEditor.tsx` AFTER `$convertFromMarkdownString`. Walks `$nodesOfType(CodeNode)` and calls `$tokenizeCodeNode` on each, pre-tokenizing every code block inside Lexical's HISTORY_MERGE-tagged init context so the subsequent `useEffect`-time transform sweep finds an empty diff and never dirty-flags the tree. See Decision 4's "The mount-time onChange trap and its fix".

The transform registrations:

```ts
const transformState = { didTransform: false, nodesCurrentlyHighlighting: new Set<NodeKey>() };
mergeRegister(
  editor.registerNodeTransform(CodeNode, (n) => $codeNodeTransform(transformState, n)),
  editor.registerNodeTransform(TextNode, (n) => $textNodeTransform(transformState, n)),
  editor.registerNodeTransform(CodeHighlightNode, (n) => $textNodeTransform(transformState, n)),
);
```

**What we own vs. what we reuse:**

| Helper                       | Source                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Token → LexicalNode mapping  | **Reuse** `PrismTokenizer.$tokenize` (closure-resolved access to upstream's `$getHighlightNodes`) |
| Plain-text shape (rule 3)    | **Reuse** `PLAIN_TOKENIZER.$tokenize` (closure-resolved access to `$plainifyCodeContent`)         |
| Language alias normalization | **Reuse** `normalizeCodeLanguage`                                                                 |
| Loaded-grammar lookup        | **Reuse** `getCodeLanguages()`                                                                    |
| Three-rule resolution        | **Own** `resolveHighlightLanguage`                                                                |
| Diff-and-splice              | **Own** `getDiffRange` (~30 lines, ported from upstream)                                          |
| Selection retention          | **Own** `$updateAndRetainSelection` (~50 lines, ported from upstream)                             |
| Re-entry guard / `$onUpdate` | **Own** (~10 lines, mirrors upstream's `didTransform` pattern)                                    |

Net self-owned code: roughly 100–120 lines (down from ~150 in the prior draft).

### Decision 8: `MarkdownEditor` plumbing changes

- Add `CodeHighlightNode` to the `NODES` array. Without this the transforms throw on registration.
- Add the `codeHighlight` record to `theme`, with per-group color constants (`TOK_KEYWORD`, `TOK_LITERAL`, `TOK_NUMBER`, `TOK_NAME`, `TOK_MARKUP`, `TOK_GLUE`, `TOK_COMMENT`) declared at module scope. Renaming a color is a one-line edit instead of grep-and-replace across the record.
- Mount `<CodeBlockHighlightPlugin />` inside `<LexicalComposer>`. Placement: next to `<CodeBlockEscapePlugin />` for locality.
- Update the `editorState` initializer to call `$highlightAllCodeBlocks()` AFTER `$convertFromMarkdownString(...)`. This pre-tokenizes every code block inside the HISTORY_MERGE-tagged init context — see Decision 4's "The mount-time onChange trap and its fix" for the full rationale.
- No prop changes to `MarkdownEditor`'s public API.

### Decision 9: Compatibility with existing code-block helpers

We verify (do not need to change):

- `codeBlock.ts:$isInsideCodeBlock` walks `getParent()` chains and recognises `CodeNode` ancestors. `CodeHighlightNode` (a `TextNode` subclass) sits **directly under** `CodeNode`, so the walk still terminates at `CodeNode` after one hop. No change needed. (Captured as an observation in the memory layer: codeBlock.ts is compatible with `registerCodeHighlighting`.)
- `codeBlock.ts:$isFormattableTextNode` returns false for any node inside a `CodeNode` — including `CodeHighlightNode` (since `$isCodeHighlightNode` extends `$isTextNode` and `$isCodeNode` is the ancestor check). The inline-format guard continues to suppress `bold`/`italic`/`==hl==`/`` ` `` inside code blocks.
- `CodeBlockEscapePlugin` derives the caret's offset within the block from `getTextContent()` and a walk to the direct child of `CodeNode`. `CodeHighlightNode` is a direct child of `CodeNode`, and `getTextContent()` walks through it transparently. The plugin's logic is unchanged. (Its in-source comment about "single TextNode child" predates this change; after this change, the same logic continues to work because the comment is descriptive of one of two possible representations, both of which round-trip the same `getTextContent()`.) We will update that comment in the same PR to reflect the new reality.
- `PasteLinkPlugin`'s code-block guard already uses `$isInsideCodeBlock` (per the existing `excludeParents` array in `MarkdownEditor.tsx:162`). No change needed.
- The `CODE` Markdown transformer reads `getLanguage()` and the block's text content. Both are unaffected (the language is never rewritten; the text content is the joined `getTextContent()` of all `CodeHighlightNode` children — equivalent to the joined single-`TextNode` text from before).

## Risks / Trade-offs

- **[Risk: Maintenance drift]** We own ~120 lines of transform code that mirror Lexical's upstream. If Lexical fixes a bug in `$codeNodeTransform` (e.g. an edge case in selection retention), we won't get it for free. → **Mitigation**: keep the helper code small, comment it with line-pointers into the upstream file (`CodeHighlighterPrism.ts`), and re-port if Lexical ships a fix we need. The transform is feature-frozen in practice (last upstream change is small) — drift risk is low. The alternative (lean on upstream's `registerCodeHighlighting`) cannot express rule 2 without rewriting the on-disk info string — see Decision 2 for the full rationale.
- **[Resolved: Mount-time phantom onChange]** An earlier draft would have spliced highlight children during `CodeBlockHighlightPlugin`'s `useEffect`-time `registerNodeTransform` sweep, firing `OnChangePlugin` on every open of a task containing a fenced code block. Decision 4 now runs the initial sweep inside the `editorState` initializer (HISTORY_MERGE-tagged) via `$highlightAllCodeBlocks`, so the post-mount transform sweep finds an empty diff and never dirty-flags the tree. The documented `organisms/board/AGENTS.md:18` invariant ("init never emits onChange") is preserved.
- **[Risk: Performance on large pastes]** A paste of a 5,000-line code block triggers one tokenize pass for the whole block. Prism is synchronous; this could block the main thread briefly. → **Mitigation**: same risk exists in upstream's wrapper. Lexical batches the transform inside its update cycle. In practice, task bodies are short (kilobytes). We accept the upstream's perf profile rather than introduce async tokenization.
- **[Risk: Rule 2 footgun — `text` / `plaintext` highlights as JavaScript]** A user typing ` ```text ` gets JavaScript highlighting, which is wrong and surprising. → **Mitigation**: `normalizeCodeLanguage` already maps `text` and `plaintext` to `plain`, and `plain` is **not** in the bundled grammar set, so it would fall to rule 2. We special-case `plain` (and its aliases) in `resolveHighlightLanguage` to short-circuit to rule 3 (no highlight). The user's actual expectation for ` ```text ` is "no highlighting", and this matches.
- **[Risk: Rule 1 footgun — fence info string with trailing chars (e.g. ` ```ts startLine=10 `)]** Prism doesn't parse such info strings; the language would be the raw `ts startLine=10` string. `normalizeCodeLanguage` returns it unchanged; `isCodeLanguageLoaded(...)` returns false; falls through to rule 2 (auto). → **Mitigation**: this matches GitHub's actual rendered behavior closely enough for a task body. We do **not** parse fence parameters in this change.
- **[Risk: User pastes a code block from another tool that uses a different language alias]** (e.g. `kotlin` is unbundled; `golang` instead of `go`). → **Mitigation**: falls to rule 2 (auto JS). The on-disk info string is preserved verbatim per Decision 4, so when the alias becomes bundled / aliased upstream, it begins highlighting correctly with no file rewrite.
- **[Trade-off: `text-cork-text/70` for punctuation/operator]** A 30% alpha softens these tokens, but the resulting grey is visually close to `cork-muted` (used by `comment`). The two groups are differentiated by `italic` on `comment`, but the color overlap is real — see Decision 5's "Known color overlap" notes. → **Mitigation**: trivial single-line flip during visual review (5.7.2 in tasks.md).
- **[Trade-off: No language picker]** Per the user, deferred. Users edit the language only by retyping the fence in Markdown source. → No mitigation needed in this change.
- **[Risk: `data-language` and `data-gutter` attributes appear in the DOM]** Lexical may attach these; CSS doesn't style them, so they're invisible — but they could affect snapshot tests or DOM-inspection tooling. → **Mitigation**: no tests assert on them. The attributes are inert without supporting CSS.

## Migration Plan

- **Deploy**: this change is a frontend-only addition. Ship it in a single PR. No data migration. No on-disk format change. No backend involvement.
- **Rollback**: revert the PR. Existing Markdown files round-trip identically (the info strings are unchanged on disk regardless of whether highlighting was on or off).

## Open Questions

- _none_ — all design points are decided and implemented.
