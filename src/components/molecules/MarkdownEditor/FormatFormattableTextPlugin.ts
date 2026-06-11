import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  type RangeSelection,
  type TextFormatType,
} from "lexical";
import { useEffect } from "react";

import { $getSelectedFormattableTextNodes, $isFormattableTextNode } from "./codeBlock";

// Owns inline-format toggling (bold / italic / strikethrough / inline-code) for
// every ranged FORMAT_TEXT_COMMAND, replacing Lexical's default handler on two
// fronts:
//
//  1. Code blocks. The default handler (`selection.formatText`) sets the format
//     flag on EVERY TextNode in the selection — including the plain TextNode
//     that holds a fenced block's content. That decoration is a lie: the
//     Markdown serializer writes a code block's text literally (no `**`/`*`/
//     `~~`/backticks), so the saved file carries no formatting and reopening the
//     task shows the code block clean. We format only the formattable (non-code)
//     nodes, leaving the code untouched in the first place.
//
//  2. Toggle direction. The default aligns the whole selection to the toggle of
//     its FIRST text node, so "select all + Bold" *removes* bold when the
//     selection happens to start on bold text but *adds* it otherwise — an
//     inconsistency for any mixed selection. We instead turn the format ON
//     unless every formattable node already carries it (only then turn it OFF).
//     That matches the toolbar's pressed state — which lights up only when every
//     node has the format — so a dimmed button always enables, a lit one always
//     clears.
//
// Collapsed selections fall through to Lexical's native handler, preserving the
// usual "toggle the pending format for the next typed character" behavior.
export function FormatFormattableTextPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand<TextFormatType>(
      FORMAT_TEXT_COMMAND,
      (formatType) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
        $formatFormattableText(selection, formatType);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

// Toggles `formatType` across the selection's formattable text (skipping any
// text inside a fenced code block), enabling the format unless every formattable
// node already has it.
function $formatFormattableText(selection: RangeSelection, formatType: TextFormatType): void {
  // Decide direction from the read-only trimmed node set — the exact set the
  // toolbar reads its active state from — so "all on → clear, otherwise enable"
  // and the button's lit/dim state can never disagree about what is selected.
  // Computing this BEFORE extract() also means a selection holding no formattable
  // text (e.g. entirely inside a code block, reachable via Cmd+B) returns without
  // extract() splitting code nodes for nothing (which would burn a no-op undo
  // step). We still return true to the caller, so the native handler — which
  // would format the code — stays blocked.
  const selected = $getSelectedFormattableTextNodes(selection);
  if (selected.length === 0) return;
  const turnOn = !selected.every((node) => node.hasFormat(formatType));

  // Apply to the EXTRACTED nodes: `extract()` splits the boundary text nodes so
  // the returned nodes cover the selection exactly (and repoints anchor/focus
  // onto the split pieces), so partial-node selections format only the
  // highlighted characters. Splitting preserves each node's format, so the
  // already-decided `turnOn` direction stays correct on the split pieces.
  for (const node of selection.extract().filter($isFormattableTextNode)) {
    if (node.hasFormat(formatType) !== turnOn) node.toggleFormat(formatType);
  }

  // Keep `selection.format` coherent with the toggle we just applied (flipping
  // only the toggled bit, leaving the other formats' state untouched), mirroring
  // what native `formatText` does — so anything that reads it next, e.g. the
  // format of the character typed if the user replaces the selection, sees the
  // applied state rather than a stale one. (The toolbar's pressed state is
  // derived from the nodes directly, so it no longer depends on this.)
  const [firstNode] = selected;
  const formatBit = firstNode.getFormatFlags(formatType, null) ^ firstNode.getFormat();
  selection.format = turnOn ? selection.format | formatBit : selection.format & ~formatBit;
}
