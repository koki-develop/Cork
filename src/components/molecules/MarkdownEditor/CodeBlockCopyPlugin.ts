import { $isCodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNearestNodeFromDOMNode, isDOMNode } from "lexical";
import { useEffect, useEffectEvent } from "react";

import { useCopyToClipboard } from "@/hooks/ui/useCopyToClipboard";

import { COPY_BUTTON_CLASS } from "./CorkCodeNode";

// Click-triggered copy-to-clipboard for the button `CorkCodeNode` overlays
// inside the dark code well's top-right corner (see `.cork-code-block-code-area`
// in `CorkCodeNode.ts`'s header comment). Delegated on the editor root by
// class name — mirroring `FloatingCodeLanguageEditorPlugin`'s language tab —
// rather than a listener attached inside `CorkCodeNode.createDOM`: that file
// only describes DOM *shape*, plugins own *behavior* (see its header
// comment).
//
// `codeNode.getTextContent()` (NOT the DOM's `Element.textContent`) is the
// only correct source for the copied string. A code block's line breaks are
// represented as `LineBreakNode` children (or, pre-highlight, literal "\n"
// inside a single TextNode) — never as literal "\n" characters next to a
// `<br>` — and `<br>` elements contribute nothing to `Element.textContent`.
// Reading the live DOM directly would silently concatenate every line into
// one, losing every line break. `getTextContent()` normalizes all of that to
// real "\n" characters (see `CodeBlockEscapePlugin.ts`'s own comment on the
// exact same fact, verified against `@lexical/code-core`'s own test suite),
// so it always returns the exact source text, however the lines happen to
// be represented at the moment of the click.
export function CodeBlockCopyPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const copyToClipboard = useCopyToClipboard();

  // `preventDefault` on mousedown so clicking the button doesn't shift native
  // focus/selection into the editor first — same reason the tab's own click
  // handling does this in `FloatingCodeLanguageEditorPlugin`.
  const onMouseDown = useEffectEvent((e: MouseEvent) => {
    const target = e.target;
    if (!isDOMNode(target) || !(target instanceof Element)) return;
    if (target.closest(`.${COPY_BUTTON_CLASS}`) != null) {
      e.preventDefault();
    }
  });

  const onClick = useEffectEvent((e: MouseEvent) => {
    const target = e.target;
    if (!isDOMNode(target) || !(target instanceof Element)) return;
    const button = target.closest(`.${COPY_BUTTON_CLASS}`);
    if (button == null) return;
    e.preventDefault();

    const text = editor.read(() => {
      const node = $getNearestNodeFromDOMNode(button);
      return $isCodeNode(node) ? node.getTextContent() : null;
    });
    if (text == null) return;

    copyToClipboard(text, {
      success: "Copied code block to clipboard",
      failure: "Failed to copy code block to clipboard",
    });
  });

  useEffect(() => {
    return editor.registerRootListener((rootElement) => {
      if (rootElement != null) {
        const down = (e: MouseEvent) => onMouseDown(e);
        const click = (e: MouseEvent) => onClick(e);
        rootElement.addEventListener("mousedown", down);
        rootElement.addEventListener("click", click);
        return () => {
          rootElement.removeEventListener("mousedown", down);
          rootElement.removeEventListener("click", click);
        };
      }
    });
  }, [editor]);

  return null;
}
