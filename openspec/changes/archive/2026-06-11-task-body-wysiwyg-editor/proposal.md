## Why

The task body is currently a plain `<textarea>`. Markdown is the on-disk format, but the editor shows raw syntax (`# Heading`, `**bold**`) with no visual feedback, so authors can't see structure while writing. A WYSIWYG editor that renders Markdown inline — while still saving plain Markdown to the file — closes that gap without changing the storage format.

## What Changes

- Add a reusable `MarkdownEditor` molecule built on [Lexical](https://github.com/facebook/lexical) (`lexical` + `@lexical/react` + `@lexical/markdown` and the node packages the Markdown transformers require). It renders Markdown WYSIWYG, supports Markdown-shortcut input (type `# `, `- `, `**…**`, etc. and it transforms inline), and round-trips through a Markdown string at the boundary.
- The editor is **deliberately minimal**: no toolbar, no floating menu, no slash commands. The only affordances are inline Markdown shortcuts and undo/redo history.
- Replace the body `<textarea>` in **CreateTaskDialog** and **TaskDetailDialog** with `MarkdownEditor`. The editor is seeded from the task's Markdown body and emits an updated Markdown string on edit; the existing save flows (submit-time for create, blur-driven auto-save for detail) are preserved.
- Remove the now-unused `Textarea` atom (its only consumers were the two body fields). **BREAKING** for the atom's public surface (`@/components/atoms` no longer exports `Textarea`), internal-only.
- Add `lexical`, `@lexical/react`, `@lexical/markdown`, `@lexical/rich-text`, `@lexical/list`, `@lexical/code`, and `@lexical/link` to dependencies.

Out of scope (non-goals): rendering Markdown in the Kanban card body preview, a toolbar / formatting UI, image or table support beyond what the default Lexical Markdown transformers provide, and changing the on-disk Markdown frontmatter/body format.

## Capabilities

### New Capabilities

- `task-body-editor`: A minimal WYSIWYG Markdown editor for the task body. Covers initializing from a Markdown string, inline Markdown-shortcut editing, serializing back to a Markdown string, the blur/change notification contract used by the dialogs, and its placement as a shared molecule.

### Modified Capabilities

- `task-detail-dialog`: The body field is no longer a `<textarea>`; it is the WYSIWYG `MarkdownEditor`. The "all fields editable" and "body change saves on blur" requirements are updated to reference the editor instead of a textarea.

## Impact

- **New dependencies**: `lexical`, `@lexical/react`, `@lexical/markdown`, `@lexical/rich-text`, `@lexical/list`, `@lexical/code`, `@lexical/link` (all React 19 compatible; `@lexical/react` peer-deps `react >=17`).
- **New code**: `src/components/molecules/MarkdownEditor/` (component + Lexical theme + barrel).
- **Modified code**: `CreateTaskDialog.tsx`, `TaskDetailDialog/TaskDetailDialog.tsx` (swap the body field), molecules barrel + `molecules/AGENTS.md` (register `MarkdownEditor`), atoms barrel + `atoms/AGENTS.md` (drop `Textarea`), `organisms/board/AGENTS.md` (body field is now the editor).
- **Removed code**: `src/components/atoms/Textarea.tsx`.
- **No backend changes**: `create_task` / `update_task` and the on-disk `.md` format are untouched — the editor exchanges a plain Markdown string exactly where the textarea's `value` string used to flow.
