import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot } from "lexical";
import { useEffect } from "react";

// The Body field's outer grid cell is stretched to a fixed min-height by the
// dialog (`min-h-[20rem]` in TaskDetailDialog.tsx / CreateTaskDialog.tsx),
// but the contentEditable itself only grows to fit its own content — a short
// body leaves empty space between the last line and the field's visible
// bottom edge that belongs to the scroll wrapper (the `min-h-0
// overflow-y-auto` div in MarkdownEditor.tsx), not the contentEditable, and
// silently swallows clicks there. This plugin catches a click that lands on
// that wrapper itself — never on a descendant, since a click that lands
// inside the contentEditable's own box (including the empty space below its
// last line, as long as that space is still part of the box) is already
// handled natively — and explicitly focuses the editor with the caret
// forced to the very end of the document, matching what clicking below the
// last line of a plain <textarea> does.
export function ClickBelowContentPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerRootListener((rootElement) => {
      if (rootElement === null) return;
      const wrapper = rootElement.parentElement;
      if (wrapper === null) return;

      const handleClick = (event: MouseEvent) => {
        if (event.target !== wrapper) return;
        // The wrapper only has dead space below the content — this plugin's
        // whole reason to exist — when the content FITS without scrolling.
        // Once it overflows, the visible viewport is always fully covered by
        // content edge to edge (even scrolled to the very bottom), and a
        // real scrollbar appears. A scrollbar isn't a distinct DOM node, so
        // dragging/clicking it (to scroll and re-read an overflowing body —
        // the exact case this wrapper's `overflow-y-auto` exists for) also
        // fires with `event.target === wrapper`, indistinguishable from a
        // genuine dead-space click by target alone — and, for an
        // overlay-style scrollbar, not distinguishable by click position
        // either, since it reserves no layout space of its own to test
        // against. Bailing whenever the content overflows sidesteps that
        // ambiguity entirely instead of trying to geometrically guess where
        // the scrollbar sits.
        if (wrapper.scrollHeight > wrapper.clientHeight) return;
        rootElement.focus();
        // `discrete: true` commits synchronously, inside this same click
        // handler call — without it the update lands in the next microtask,
        // racing whatever selection the browser's own native `focus()`
        // placement (or Lexical's selectionchange sync of it) produces, and
        // `selectEnd()` can lose that race and never visibly apply.
        editor.update(
          () => {
            $getRoot().selectEnd();
          },
          { discrete: true },
        );
      };

      wrapper.addEventListener("click", handleClick);
      return () => wrapper.removeEventListener("click", handleClick);
    });
  }, [editor]);

  return null;
}
