import { $insertGeneratedNodes } from "@lexical/clipboard";
import { $convertFromMarkdownString } from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getTableCellNodeFromLexicalNode } from "@lexical/table";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
  type RangeSelection,
} from "lexical";
import { useEffect } from "react";

import { $isInsideCodeBlock } from "./codeBlock";
import { $insertSpacersBetweenAdjacentQuotes, MARKDOWN_TRANSFORMERS } from "./transformers";

// Plain-text paste (e.g. `> hello world` copied from anywhere that doesn't
// also put a text/html or Lexical clipboard payload on the clipboard) falls
// through to RichTextPlugin's default `text/plain` importer, which inserts
// the literal characters as a raw TextNode — the same Markdown source that
// renders correctly on file load (`$seedMarkdownEditorState`) stays inert
// until the dialog is closed and reopened. This plugin steps in for exactly
// that fallthrough case and runs the pasted text through the same
// `MARKDOWN_TRANSFORMERS` import pipeline the file-load path uses, so the
// two paths render identically.
//
// Registered at COMMAND_PRIORITY_LOW, after PasteLinkPlugin in the tree (see
// MarkdownEditor.tsx) — same-priority listeners run in registration order,
// so a bare-URL paste over a real selection is still claimed by that more
// specific plugin first; this one only ever sees what PasteLinkPlugin
// declined.
//
// Bails (returns false, falling through to the default importer) whenever:
//   - the clipboard also carries `text/html` or `application/x-lexical-editor`
//     — both already render correctly via RichTextPlugin's richer importers,
//     and reinterpreting that payload as Markdown source would be a lossy
//     downgrade (e.g. real HTML bold/italic with no Markdown-syntax
//     equivalent in the copied plain text).
//   - the caret sits inside a fenced code block or a table cell — both are
//     restricted content zones where a typed `#` / `>` / `- ` already stays
//     literal text (see transformers.ts's cell-aware wrappers and
//     `$isInsideCodeBlock`'s callers), so a paste should match that instead
//     of silently promoting to a block element the zone doesn't support.
export function MarkdownPastePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!(event instanceof ClipboardEvent)) return false;
        const { clipboardData } = event;
        if (clipboardData == null) return false;
        if (
          clipboardData.types.includes("text/html") ||
          clipboardData.types.includes("application/x-lexical-editor")
        ) {
          return false;
        }

        const text = clipboardData.getData("text/plain");
        if (text === "") return false;

        const selection = $getSelection();
        if (!$isRangeSelection(selection) || $touchesRestrictedZone(selection)) {
          return false;
        }

        // Windows/Word-style clipboard payloads use CRLF; MarkdownImport
        // splits on bare `\n`, so an unstripped `\r` would ride along as
        // trailing garbage on every imported line's text content.
        const normalizedText = text.replace(/\r\n?/g, "\n");

        // Parse into a detached scratch paragraph rather than the real root
        // — `$convertFromMarkdownString` unconditionally `.clear()`s
        // whatever node it's given, which would wipe the live document if
        // passed `$getRoot()`. Same pattern `transformers.ts`'s
        // `$createTableCell` already uses for cell-body markdown.
        const scratch = $createParagraphNode();
        $convertFromMarkdownString(normalizedText, MARKDOWN_TRANSFORMERS, scratch, true);
        const nodes = scratch.getChildren();
        if (nodes.length === 0) return false;
        for (const node of nodes) node.remove();

        // `$convertFromMarkdownString` moves the selection to the start of
        // its `node` argument (the now-empty scratch paragraph) as its last
        // step. Reassert the real pre-paste selection before inserting, or
        // `$insertGeneratedNodes` would insert relative to the discarded
        // scratch node instead of where the user's caret actually was.
        $setSelection(selection);
        $insertGeneratedNodes(editor, nodes, selection);
        // Import strips the empty paragraph between two adjacent quotes at
        // root level (see this helper's header in transformers.ts) —
        // restore it so pasting a quote next to an existing one doesn't
        // visually fuse the two.
        $insertSpacersBetweenAdjacentQuotes();

        event.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

function $touchesRestrictedZone(selection: RangeSelection): boolean {
  const anchorNode = selection.anchor.getNode();
  const focusNode = selection.focus.getNode();
  return (
    $isInsideCodeBlock(anchorNode) ||
    $isInsideCodeBlock(focusNode) ||
    $getTableCellNodeFromLexicalNode(anchorNode) != null ||
    $getTableCellNodeFromLexicalNode(focusNode) != null
  );
}
