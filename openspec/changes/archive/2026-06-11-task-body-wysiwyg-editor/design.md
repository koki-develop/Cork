## Context

The task body is stored as the plain-text body of a Markdown file (`---\nfrontmatter\n---\n\n{body}`), exchanged with the backend as a `string` through `create_task` / `update_task`. On the frontend it is edited with the `Textarea` atom:

- **CreateTaskDialog** — `useState("")`, `onChange={(e) => setBody(e.target.value)}`, persisted at form submit via `onCreateTask(..., body.trim(), ...)`.
- **TaskDetailDialog** — `useTaskDialogState` holds `body` (`useState(task.body)`) and an `originalRef` baseline for dirty-tracking; `onChange` updates `body`, `onBlur={handleBodyBlur}` auto-saves when `body !== originalRef.current.body`.

Both treat the body as a controlled `value: string` / `onChange(string)` pair. The on-disk format and both Tauri commands stay exactly as-is — this change is confined to the editing surface.

Lexical (`facebook/lexical`, latest `0.45.0`; `@lexical/react` peer-deps `react >=17`, so React 19 is supported) is the chosen editor framework, per the task request. `@lexical/markdown` provides `$convertFromMarkdownString` / `$convertToMarkdownString` and the default `TRANSFORMERS` set.

## Goals / Non-Goals

**Goals:**

- A reusable, framework-agnostic-in-spirit `MarkdownEditor` that takes an initial Markdown string and notifies an updated Markdown string on edit, plus an `onBlur` hook.
- Inline Markdown-shortcut editing (`# `, `## `, `- `, `1. `, `> `, ` ``` `, `**bold**`, `*italic*`, `` `code` ``, links) rendered WYSIWYG.
- Drop-in replacement for the body field in both dialogs with **no change** to their save semantics, dirty-tracking, or the backend.
- Minimal footprint: no toolbar, no floating menu, no slash commands.

**Non-Goals:**

- Rendering Markdown in the Kanban card body preview (stays a raw-text slice).
- A formatting toolbar / buttons, image upload, tables beyond default transformers.
- Changing the frontmatter/body file format or the Tauri command signatures.
- Syntax highlighting inside code blocks (plain `CodeNode` only).

## Decisions

### Decision 1: `MarkdownEditor` is a molecule, not an atom

`Textarea` is an atom (single element, no state, no side-effects). A Lexical editor is a multi-element composition (`LexicalComposer` + `RichTextPlugin` + `ContentEditable` + plugins) that owns editor state and registers side-effecting listeners — which atoms forbid. It has no domain meaning, composes external utilities, and holds only minimal local state, which matches the molecule contract ("small compositions of atoms + external utilities, minimal local state, may import `@/hooks/ui/*`, no `@/api`, no Tauri"). It does not call `invoke`/`listen`, so no `.oxlintrc.json` override is needed.

Placement: `src/components/molecules/MarkdownEditor/` (folder, because it has a co-located theme module and barrel).

- `MarkdownEditor.tsx` — the composer, plugin wiring, and a small inline `OnChangeMarkdownPlugin`.
- `theme.ts` — the Lexical `EditorThemeClasses` mapping node types → Tailwind utility classes.
- `index.ts` — barrel (`export { MarkdownEditor, type MarkdownEditorProps }`).

**Alternative considered:** replace `Textarea` in place (keep it an atom). Rejected — it violates the atom "no local state / no side-effects" rule and would force Lexical, a stateful framework, into the lowest layer.

### Decision 2: Bridge Lexical's uncontrolled model to the existing `value`/`onChange(string)` contract

Lexical is inherently uncontrolled: it owns its `EditorState`; you do not feed it a `value` prop every render. The component therefore exposes:

- `initialValue: string` — the Markdown to seed **once** at mount, via `initialConfig.editorState: () => $convertFromMarkdownString(initialValue, TRANSFORMERS)`. It is intentionally **not** re-applied on prop change (the dialogs remount via a `key` bump on open, so re-seeding isn't needed).
- `onChange: (markdown: string) => void` — fired on real edits. Implemented with `@lexical/react`'s `OnChangePlugin`, reading `editorState.read(() => $convertToMarkdownString(TRANSFORMERS))`.
- `onBlur?: () => void` — forwarded from `ContentEditable`'s `onBlur`.
- `placeholder?`, `ariaLabel?`, `className?` — to preserve the field's current a11y label and `flex-1` fill behavior.

Consumers keep their `body: string` state and pass `onChange={setBody}`. CreateTaskDialog: `<MarkdownEditor initialValue="" onChange={setBody} />`. TaskDetailDialog: `<MarkdownEditor initialValue={task.body} onChange={setBody} onBlur={handleBodyBlur} />`. **`useTaskDialogState` is unchanged** — `body`, `originalRef`, `handleBodyBlur`, and the whole 2-step close machine keep working because they only ever touched `body` as a string.

How the props map to Lexical's verified `0.45.0` API:

- `onBlur` → passed straight to `<ContentEditable onBlur={...}>`; `ContentEditableElement` spreads unknown props (`...rest`) onto the contenteditable `<div>`, so native `onBlur` fires on focus loss.
- `ariaLabel` → `<ContentEditable ariaLabel={...}>` (the component renders it as `aria-label` on the div). This preserves the current `aria-label="Body"` accessible name the dialogs and spec rely on.
- `placeholder` is **not** a native string attribute. Render it as a positioned overlay element via `RichTextPlugin`'s `placeholder` prop (a `<div>` absolutely positioned inside a `relative` wrapper around the editor); Lexical shows/hides it through `useCanShowPlaceholder`. When no placeholder string is supplied, pass `null`.
- `className` → applied to the contenteditable box.

**Alternative considered:** a fully controlled wrapper that diffs `value` against editor content each render and patches the editor. Rejected — fragile (cursor jumps, re-entrancy with `OnChangePlugin`) and unnecessary given the remount-on-open pattern.

### Decision 3: Avoid spurious auto-saves from Markdown normalization

Round-tripping `$convertFromMarkdownString` → `$convertToMarkdownString` can normalize syntax (bullet markers, blank-line spacing). If `onChange` fired at initialization, TaskDetailDialog's `handleBodyBlur` would see `body (normalized) !== originalRef (raw file)` and auto-save a normalized rewrite on a no-edit open/close — unwanted file churn.

This is avoided because initialization does **not** trigger `OnChangePlugin`. Verified against `@lexical/react@0.45.0` source — three independent guards each suffice:

1. **Registration timing** — `LexicalComposer` runs `initializeEditor` synchronously inside `useMemo` at construction, before `OnChangePlugin`'s `useLayoutEffect` registers its update listener. The init update is never observed.
2. **`HISTORY_MERGE_TAG`** — the function-form `editorState` runs via `editor.update(fn, {tag: HISTORY_MERGE_TAG})`. `OnChangePlugin`'s `ignoreHistoryMergeTagChange` (default `true`) returns early for any update carrying that tag.
3. **`prevEditorState.isEmpty()`** — `OnChangePlugin` also returns early when the previous state is empty (`nodeMap.size === 1 && selection === null`), which the pre-init state always is.

The empty-initial case (CreateTaskDialog, `initialValue=""`) is also safe: `$convertFromMarkdownString("")` leaves the root holding one empty `ParagraphNode` (the import keeps the last empty paragraph when `childrenSize === 1`), so the post-init `nodeMap.size === 2` is **not** empty — the user's first keystroke fires `onChange` normally; no first-character loss.

Net effect: `body` stays exactly equal to the raw `task.body` until the user actually edits, so a no-edit blur takes the `body === original` no-save path. Normalization only reaches disk when the user has genuinely edited the body — which is correct.

**Smoke check (belt-and-suspenders):** during implementation, confirm via `bun run tauri dev` that opening a task with non-canonical Markdown and closing it without editing performs **no** `update_task` call.

### Decision 4: Required nodes and transformers

Verified against `@lexical/markdown@0.45.0`: the default `TRANSFORMERS` (= `ELEMENT_TRANSFORMERS` + `MULTILINE_ELEMENT_TRANSFORMERS` + `TEXT_FORMAT_TRANSFORMERS` + `TEXT_MATCH_TRANSFORMERS`) declare exactly these node dependencies — `HeadingNode`, `QuoteNode` (`@lexical/rich-text`), `ListNode`, `ListItemNode` (`@lexical/list`), `CodeNode` (`@lexical/code` — which re-exports the class from `@lexical/code-core`, so registering `@lexical/code`'s `CodeNode` matches the transformer's class identity), `LinkNode` (`@lexical/link`). No `HorizontalRuleNode` or `CodeHighlightNode` is required by the default set. These six go in `initialConfig.nodes`.

Plugins: `RichTextPlugin`, `HistoryPlugin` (undo/redo), `MarkdownShortcutPlugin` (with `TRANSFORMERS`), and the inline markdown `OnChangePlugin`. Dependencies to add: `lexical`, `@lexical/react`, `@lexical/markdown`, `@lexical/rich-text`, `@lexical/list`, `@lexical/code`, `@lexical/link` (pinned exact, matching the repo's pinned-version convention).

### Decision 5: Styling via the Lexical theme object, in Tailwind

The Lexical `theme` maps node types to class names; populate it with Cork's Tailwind utilities (e.g. `theme.heading.h1 = "text-xl font-semibold ..."`, `theme.list.ul = "list-disc pl-5"`, `theme.code = "font-mono ..."`) so WYSIWYG output matches the app's typography. The outer `ContentEditable` reuses the body field's existing box styling (the `cork-border` / `cork-elevated` border, padding, rounded, `min-h-[16rem] flex-1`) so the field looks unchanged. This keeps styling in Tailwind with no `tailwind.config` and avoids a bespoke CSS file where possible; any unavoidable structural rule (e.g. nested-list markers) goes in `style.css`.

### Decision 6: Remove the `Textarea` atom

After both dialogs migrate, `Textarea`'s only consumers are gone (verified: grep shows usage solely in the two dialogs). Per rigorous standards, remove the dead atom: delete `Textarea.tsx`, drop its barrel export and its `atoms/AGENTS.md` row. `AutoresizeInput` (the title field) is unrelated and stays.

## Risks / Trade-offs

- **Bundle size grows** (Lexical core + react + markdown + 4 node packages) → Accepted: this is the explicit cost of the user's Lexical request; offset by keeping the integration minimal (no extra plugins).
- **Markdown normalization differs from hand-written syntax** (e.g. `-` vs `*` bullets) on the first real edit → Acceptable and expected for a WYSIWYG round-trip; storage stays valid Markdown. Documented as a known behavior.
- **Card preview now shows raw Markdown syntax** for structured bodies → Out of scope here; the preview already showed raw text. Noted as a possible follow-up.
- **"Init never emits onChange"** is load-bearing for the no-churn guarantee → Verified at the source level in Decision 3 (three independent guards); a dev-smoke check (no-edit open/close issues no `update_task`) backs it up as defense-in-depth.
- **`$convertFromMarkdownString` moves selection to the start** → Cosmetic only; the field isn't auto-focused on open today, so no regression.

## Migration Plan

1. Add the seven Lexical packages (`bun add`), pinned exact.
2. Build `MarkdownEditor` molecule (component + theme + barrel) and register it in the molecules barrel + `molecules/AGENTS.md`.
3. Swap the body field in `CreateTaskDialog` and `TaskDetailDialog`; leave `useTaskDialogState` untouched.
4. Remove `Textarea` (atom file, barrel export, `atoms/AGENTS.md` row); update `organisms/board/AGENTS.md` to describe the body field as the editor.
5. Verify: `bunx tsc --noEmit` + `bun run lint` + `bun run fmt:check`, then `bun run tauri dev` smoke test (create, edit, shortcut transforms, no-edit-close = no save, blur auto-save).

Rollback: revert the change set; no data migration occurred (on-disk format unchanged), so rollback is purely code-level.

## Open Questions

None blocking. (Card-preview Markdown rendering is intentionally deferred, not open.)
