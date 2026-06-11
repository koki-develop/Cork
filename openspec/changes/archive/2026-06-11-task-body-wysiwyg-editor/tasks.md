## 1. Dependencies

- [x] 1.1 Add Lexical packages with `bun add` (pinned exact, matching repo convention): `lexical`, `@lexical/react`, `@lexical/markdown`, `@lexical/rich-text`, `@lexical/list`, `@lexical/code`, `@lexical/link`
- [x] 1.2 Confirm `bun.lock` / `package.json` reflect the new deps and `bunx tsc --noEmit` still resolves all imports

## 2. MarkdownEditor molecule

> Consolidated into a single flat file `src/components/molecules/MarkdownEditor.tsx` (theme const + inline `OnChangePlugin` wiring + component) to match the existing flat-file molecule convention and the "minimal" goal, instead of the originally-planned `MarkdownEditor/` folder with separate `theme.ts` / `index.ts`. No separate `style.css` rule was needed — the theme object's Tailwind classes (`list-disc`/`list-decimal`/`pl-6`, nested `list-none`, etc.) cover the markdown elements.

- [x] 2.1 Define the `EditorThemeClasses` `theme` const (top-level in `MarkdownEditor.tsx`) mapping headings / lists / quote / code / inline formats / links to Cork Tailwind utility classes
- [x] 2.2 Build the editor in `src/components/molecules/MarkdownEditor.tsx`: `LexicalComposer` with `initialConfig` (`namespace`, `theme`, `onError`, `nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode]` imported from `@lexical/rich-text` / `@lexical/list` / `@lexical/code` / `@lexical/link`, `editorState: () => $convertFromMarkdownString(initialValue, TRANSFORMERS)`); `RichTextPlugin` with `contentEditable={<ContentEditable ariaLabel={ariaLabel} onBlur={onBlur} className={box styling} />}` (box styling on the ContentEditable mirrors the old Textarea: border, padding, rounded, `flex-1`; `min-h-[16rem] flex-1` comes via the wrapper's `className`), `ErrorBoundary={LexicalErrorBoundary}`, and `placeholder` as a positioned `<div>` overlay (or `null`) inside a `relative flex flex-col` wrapper; `HistoryPlugin`; `MarkdownShortcutPlugin` with `TRANSFORMERS`
- [x] 2.3 Inline `OnChangePlugin` (from `@lexical/react`) reading `editorState.read(() => $convertToMarkdownString(TRANSFORMERS))` and calling `props.onChange`; `ignoreHistoryMergeTagChange` left at its default `true` so initialization does not emit (init runs before listener registration, carries `HISTORY_MERGE_TAG`, and has an empty prev-state — see design Decision 3)
- [x] 2.4 Define and export `MarkdownEditorProps` (`initialValue: string`, `onChange: (markdown: string) => void`, `onBlur?: () => void`, `placeholder?: string`, `ariaLabel?: string`, `className?: string`); `onBlur` / `ariaLabel` (→ ContentEditable's `ariaLabel` prop) / box styling on `ContentEditable`, `className` on the wrapper, `placeholder` on the `RichTextPlugin` overlay
- [x] 2.5 Add the `MarkdownEditor` re-export to `src/components/molecules/index.ts` (flat file — no folder barrel)
- [x] 2.6 No extra `style.css` rule required; all styling lives in the theme object + ContentEditable className

## 3. Wire into the dialogs

- [x] 3.1 In `CreateTaskDialog.tsx`, replace the body `<Textarea>` with `<MarkdownEditor initialValue="" onChange={setBody} ariaLabel="Body" placeholder="Body (optional)" className="..." />`; keep `body` state and the submit-time `onCreateTask(..., body.trim(), ...)` flow
- [x] 3.2 In `TaskDetailDialog.tsx`, replace the body `<Textarea>` with `<MarkdownEditor initialValue={task.body} onChange={setBody} onBlur={handleBodyBlur} ariaLabel="Body" placeholder="Body" className="..." />`; leave `useTaskDialogState` (body state, `originalRef`, `handleBodyBlur`, close machine) untouched (`body` dropped from the destructure since the uncontrolled editor no longer reads it; `setBody` kept)
- [x] 3.3 In both dialogs, add the `MarkdownEditor` import from `@/components/molecules` and drop `Textarea` from the `@/components/atoms` import (keeping `AutoresizeInput` / `Heading` / `Text`)

## 4. Remove the dead Textarea atom

- [x] 4.1 Delete `src/components/atoms/Textarea.tsx`
- [x] 4.2 Remove the `Textarea` re-export from `src/components/atoms/index.ts`
- [x] 4.3 Verify no remaining references: `grep -rn "Textarea" src/` returns nothing

## 5. Docs sync

- [x] 5.1 Add a `MarkdownEditor` row to `src/components/molecules/AGENTS.md`
- [x] 5.2 Remove the `Textarea.tsx` row from `src/components/atoms/AGENTS.md`
- [x] 5.3 Update `src/components/organisms/board/AGENTS.md` so the body-field description references the `MarkdownEditor` instead of `Textarea`

## 6. Verification

- [x] 6.1 `bunx tsc --noEmit` + `bun run lint` + `bun run fmt:check` all pass (also `bun run build` — Lexical bundles cleanly; only the expected chunk-size advisory)
- [x] 6.2 `bun run tauri dev`: create a task with Markdown shortcuts (heading, list, bold) and confirm WYSIWYG rendering + correct Markdown saved to the `.md` file
- [x] 6.3 `bun run tauri dev`: edit an existing task's body, blur, and confirm `update_task` persists the new Markdown
- [x] 6.4 `bun run tauri dev`: open a task whose stored body has non-canonical Markdown, close without editing, and confirm **no** `update_task` call fires (Decision 3; reinforced by the `ignoreSelectionChange` fix so a bare focus/cursor move doesn't serialize either)
- [x] 6.5 `bun run tauri dev`: confirm undo/redo works and no toolbar / floating menu / slash menu is present
