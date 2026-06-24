## Why

Today the task-body editor renders fenced code blocks as a single unstyled monospaced block — even ` ```js …``` ` reads as one flat slab of text. Reading code in a task body is the most code-shaped thing people paste into a task, and shipping it without color highlighting leaves the editor feeling unfinished next to every other Markdown surface a developer uses (GitHub, VS Code, Obsidian). Adding token-level color highlighting is a small, self-contained polish that closes the gap.

We add it now because everything we need is already in the dependency tree: the editor already registers `@lexical/code`'s `CodeNode`, and `@lexical/code` 0.45 bundles a Prism-based tokenizer with **16 grammars** (`js`, `ts`, `py`, `rust`, `java`, `c`/`cpp`, `css`, `markup` (HTML/XML), `sql`, `swift`, `objectivec`, `powershell`, `markdown`, `diff`, plus `clike` as a base) — `go`, `kotlin`, `ruby`, etc. are absent and fall to rule 2 (see below). The work is wiring, theming, and one small custom plugin.

## What Changes

- Fenced code blocks gain token-level syntax coloring inside `MarkdownEditor`, driven by the fence's info string (` ```ts `, ` ```python `, …).
- Three resolution rules — implemented exactly, no fuzzy fallback chains:
  1. Info string present **and** grammar is bundled in `@lexical/code` → highlight with that language.
  2. Info string present **but** grammar is unbundled (`go`, `kotlin`, etc.) → highlight with the default "auto" grammar (Lexical's `DEFAULT_CODE_LANGUAGE`, currently JavaScript, which doubles as Prism's `clike` for keyword/string/comment shapes).
  3. Info string absent (bare ` ``` `) → leave the block unhighlighted (no Prism pass at all — not even "auto").
- The Markdown round-trip is preserved verbatim: rule 2 does **not** rewrite the stored language back to `javascript`. The original `go` info string stays on disk; highlighting is a render-time concern only.
- `CodeHighlightNode` is added to the editor's registered node list (required by the highlight transforms).
- A small Cork-themed token palette is added to `theme.codeHighlight`, drawn from existing `cork-*` color tokens so it harmonizes with the rest of the editor and stays WCAG-AA legible against the `cork-bg` code-block well.
- Existing keyboard behavior is preserved: arrow-key escape at code-block boundaries, Shift+Enter escape, `$convertFromMarkdownString`/`$convertToMarkdownString` round-trip, and the inline-format guard for code-block text all continue to work. (Design.md justifies why we do **not** call upstream's `registerCodeHighlighting` wholesale — it bundles a `registerCodeIndentation` step that would clobber our arrow-key escape.)
- **Out of scope** (deferred to a separate task by the user): UI for changing the language of an already-inserted code block.

## Capabilities

### New Capabilities

- _none_

### Modified Capabilities

- `task-body-editor`: adds one new requirement — fenced code blocks SHALL be syntax-highlighted per the three rules above, without rewriting the stored info string.

## Impact

- **Code (frontend only)**
  - `src/components/molecules/MarkdownEditor/MarkdownEditor.tsx`: register `CodeHighlightNode`; extend `theme` with `codeHighlight`; mount the new highlight plugin.
  - **New** `src/components/molecules/MarkdownEditor/CodeBlockHighlightPlugin.ts`: a thin plugin that registers only the Prism highlight transforms (a custom `Tokenizer` implementing the three rules, plus the `CodeNode` / `TextNode` / `CodeHighlightNode` transforms). It deliberately does **not** call `registerCodeIndentation`, so existing arrow/Tab behavior is unaffected. (`.ts`, not `.tsx`: the plugin returns `null` like the other transform-only plugins in this folder — `CodeBlockEscapePlugin.ts`, `FormatShortcutPlugin.ts`, etc.)
- **Dependencies**: no new packages. `@lexical/code` 0.45 (already a dep) transitively pulls in `@lexical/code-prism` and `prismjs`, including all 16 bundled language grammars as side-effect imports. We use only the public API surface of `@lexical/code`.
- **APIs / data on disk**: none. Code-block info strings round-trip exactly as today.
- **Backend (Rust)**: no impact.
- **Tests**: no new test framework; verification is `bunx tsc --noEmit` + `bun run lint` + `bun run fmt:check` + manual smoke in `bun run tauri dev` (the project has no frontend test framework — see `AGENTS.md`).
- **Risk surface**
  - Bundle size: Prism + the 16 bundled grammars are already on disk via the existing `@lexical/code` dep; enabling them adds no new download.
  - Performance: highlighting runs as a Lexical node transform, debounced by Lexical's update batching. Large pasted blocks tokenize once on paste; subsequent edits diff against existing children so the surgical splice is small.
  - Keyboard regressions: the chosen plugin design (only the highlight transforms, no `registerCodeIndentation`) intentionally avoids overlap with `CodeBlockEscapePlugin`, `ListTabIndentationPlugin`, and `HorizontalRuleKeyboardPlugin`.
