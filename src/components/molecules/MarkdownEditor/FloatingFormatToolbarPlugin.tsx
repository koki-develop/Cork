import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { clsx } from "clsx";
import {
  $getSelection,
  $isRangeSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  mergeRegister,
  SELECTION_CHANGE_COMMAND,
  type TextFormatType,
} from "lexical";
import { Bold, Code, Italic, RemoveFormatting, Strikethrough } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { type ReactNode, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { $getSelectedFormattableTextNodes, $isFormattableTextNode } from "./codeBlock";
import { type Anchor, firstLineAnchor, placeCenteredAbove } from "./placement";

// The four inline formats the toolbar toggles, in display order. Each maps to a
// Lexical `TextFormatType` that `FORMAT_TEXT_COMMAND` flips and the default
// Markdown transformers serialize (`**` / `*` / `~~` / backticks).
type ToolbarFormat = { type: TextFormatType; label: string; icon: typeof Bold };

const FORMATS: readonly ToolbarFormat[] = [
  { type: "bold", label: "Bold", icon: Bold },
  { type: "italic", label: "Italic", icon: Italic },
  { type: "strikethrough", label: "Strikethrough", icon: Strikethrough },
  { type: "code", label: "Inline code", icon: Code },
];

// Separator definition between format toggles and the clear-formatting button.
const CLEAR_FORMAT = { label: "Clear formatting", icon: RemoveFormatting } as const;

// Initial estimate of the toolbar size, derived from the fixed markup below, so
// the first frame can be positioned before the node has been measured (the real
// size is cached on mount and takes over — see `measure`). Each button is a
// 16px icon (`size-4`) in `p-1` (4px) padding = 24px; buttons sit in a `gap-0.5`
// (2px) row inside the panel's `p-1` (4px) + 1px border.
const BUTTON_SIZE = 24;
const BUTTON_GAP = 2;
const PANEL_INSET = 5;
const TOOLBAR_WIDTH =
  (FORMATS.length + 1) * BUTTON_SIZE + FORMATS.length * BUTTON_GAP + 2 * PANEL_INSET;
const TOOLBAR_HEIGHT = BUTTON_SIZE + 2 * PANEL_INSET;

// As the selection is dragged wider, its bounding box — and thus the toolbar's
// target spot — moves. Tweening x/y (rather than snapping) turns that into a
// smooth glide. `instant` skips the tween for scroll/resize, where the toolbar
// should stay glued to the selection instead of springing after it.
const GLIDE = { type: "spring", stiffness: 600, damping: 50, mass: 0.6 } as const;
const INSTANT = { duration: 0 } as const;

// Viewport-space geometry of the current text selection, plus which formats it
// already carries and whether this update should reposition instantly.
type ToolbarPlacement = {
  anchor: Anchor;
  active: TextFormatType[];
  instant: boolean;
};

// `null` means "no toolbar" (collapsed selection, blurred, or selection outside
// the editor). `id` bumps on every fresh appearance so the rendered element is
// keyed per-appearance: that forces a clean remount (re-running `initial` to
// place the toolbar in position) instead of letting AnimatePresence reuse a
// still-exiting node and glide it in from its previous spot.
type ToolbarState = ToolbarPlacement & { id: number };

// A selection-triggered ("bubble") toolbar: select text inside the editor and a
// floating menu fades in above it to toggle bold / italic / strikethrough /
// inline-code. Mouse-first by design — it mirrors how the user made the
// selection. Buttons `preventDefault` on mousedown so the contenteditable keeps
// focus and the selection survives the click; the format is applied on click.
export function FloatingFormatToolbarPlugin(): ReactNode {
  const [editor] = useLexicalComposerContext();
  const [state, setState] = useState<ToolbarState | null>(null);
  // Tracks visibility synchronously (independent of the batched `state`) so a
  // burst of selection-change events doesn't bump `id` more than once per
  // appearance. `idRef` is the per-appearance counter (see ToolbarState.id).
  const shownRef = useRef(false);
  const idRef = useRef(0);
  // Measured toolbar size, seeded with the markup-derived estimate so the very
  // first frame is placed before any measurement exists. After the first mount
  // it holds the real size, so positioning self-corrects if the markup changes.
  const sizeRef = useRef({ width: TOOLBAR_WIDTH, height: TOOLBAR_HEIGHT });

  // Recompute (or clear) the toolbar from the live selection. Wrapped as an
  // effect-event so the listener/scroll effects below can call it without
  // re-subscribing on every state change. `instant` is set by scroll/resize.
  const updateToolbar = useEffectEvent((instant: boolean) => {
    const nativeSelection = window.getSelection();
    const rootElement = editor.getRootElement();

    const placement = editor.getEditorState().read((): ToolbarPlacement | null => {
      const selection = $getSelection();
      // Show only for a real, non-empty text range that lives inside this
      // editor. A collapsed caret or a selection the browser left grayed in
      // another element must not surface the toolbar.
      // The toolbar is also hidden when the selection holds NO formattable
      // text — i.e. it sits entirely within fenced code block(s), where inline
      // formats are no-ops (the block serializes its text literally). As long
      // as one formattable (non-code) character is selected the toolbar shows,
      // and toggling formats that part while leaving the code untouched.
      if (
        !$isRangeSelection(selection) ||
        selection.isCollapsed() ||
        selection.getTextContent() === "" ||
        nativeSelection == null ||
        rootElement == null ||
        !rootElement.contains(nativeSelection.anchorNode)
      ) {
        return null;
      }
      const formattable = $getSelectedFormattableTextNodes(selection);
      if (formattable.length === 0) return null;
      const anchor = selectionRect(nativeSelection);
      if (anchor == null) return null;
      // A button reads "active" when EVERY formattable node carries the format —
      // deliberately ignoring any code-block text in the selection, which can't
      // hold a format. Without this the built-in `selection.hasFormat` (which is
      // just the anchor node's format) would mislight whenever the rest of the
      // selection differs from the anchor. This reads from the same trimmed node
      // set the format command toggles, so the pressed state always matches what
      // a click will do.
      return {
        anchor,
        active: FORMATS.map((f) => f.type).filter((type) =>
          formattable.every((node) => node.hasFormat(type)),
        ),
        instant,
      };
    });

    if (placement == null) {
      shownRef.current = false;
      setState(null);
      return;
    }
    // Bump the appearance id only on the hidden→shown edge; staying shown
    // (selection moved/widened) keeps the same id so the element glides rather
    // than remounting on every change.
    if (!shownRef.current) {
      shownRef.current = true;
      idRef.current += 1;
    }
    setState({ ...placement, id: idRef.current });
  });

  useEffect(() => {
    return mergeRegister(
      // Update listener catches content edits (e.g. a toggle changing the
      // active formats); SELECTION_CHANGE catches caret/drag moves that don't
      // mutate content. BLUR hides the toolbar when focus genuinely leaves the
      // editor — a toolbar-button click can't trigger it because the button
      // preventDefaults its mousedown.
      editor.registerUpdateListener(() => updateToolbar(false)),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbar(false);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          shownRef.current = false;
          setState(null);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  // While visible, follow the selection through scroll/resize: the anchor rect
  // is viewport-relative, so any layout shift must re-place the toolbar. Capture
  // phase catches the editor's own scroll container, not just the window. These
  // updates reposition instantly so the toolbar stays pinned to the selection.
  const visible = state != null;
  useEffect(() => {
    if (!visible) return;
    const reposition = () => updateToolbar(true);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [visible]);

  // Caches the toolbar's real rendered size after mount; `offsetWidth/Height`
  // (not `getBoundingClientRect`) so the enter `scale` animation doesn't skew
  // the measurement.
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (el != null && el.offsetWidth > 0) {
      sizeRef.current = { width: el.offsetWidth, height: el.offsetHeight };
    }
  }, []);

  // Position is derived from the selection rect at render time (toolbar size is
  // known from the constant estimate / last measurement), so the very first
  // frame is already placed — the appear animation is a pure in-place fade,
  // never a fly-in from a stale position.
  const target = state ? placeCenteredAbove(state.anchor, sizeRef.current) : null;
  const moveTransition = state?.instant ? INSTANT : GLIDE;

  return createPortal(
    <AnimatePresence>
      {state && target && (
        <m.div
          key={state.id}
          ref={measure}
          role="toolbar"
          aria-label="Text formatting"
          className="border-cork-border/40 bg-cork-elevated fixed top-0 left-0 z-[60] flex items-center gap-0.5 rounded-lg border p-1 shadow-xl"
          // x/y carry position (animated → glide on selection changes); opacity
          // and scale carry the appear/disappear fade. `initial` seeds x/y with
          // the current target so a fresh mount starts in place.
          initial={{ x: target.x, y: target.y, opacity: 0, scale: 0.96 }}
          animate={{ x: target.x, y: target.y, opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{
            duration: 0.12,
            ease: "easeOut",
            x: moveTransition,
            y: moveTransition,
          }}
        >
          {FORMATS.map(({ type, label, icon: Icon }) => {
            const active = state.active.includes(type);
            return (
              <button
                key={type}
                type="button"
                aria-label={label}
                aria-pressed={active}
                title={label}
                // Keep the editor focused/selection intact across the click.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, type)}
                // ON is an accent-tinted fill with an accent-colored icon; OFF
                // is transparent with a muted-grey icon. The icon hue (accent vs
                // grey) carries the state at a glance, and the hover tints keep
                // the same hue split, so ON/OFF stays legible — hovered or not —
                // without the solid fill reading as too heavy.
                className={clsx(
                  "flex cursor-pointer items-center justify-center rounded-md p-1 transition-colors duration-200",
                  active
                    ? "bg-cork-accent/20 text-cork-accent hover:bg-cork-accent/30"
                    : "text-cork-muted hover:bg-cork-border/50 hover:text-cork-text",
                )}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
          {/* Clear formatting */}
          <div className="bg-cork-border/40 mx-0.5 h-4 w-px" />
          <button
            key="clear-formatting"
            type="button"
            aria-label={CLEAR_FORMAT.label}
            title={CLEAR_FORMAT.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.update(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
                for (const node of selection.extract().filter($isFormattableTextNode)) {
                  node.setFormat(0);
                }
                selection.format = 0;
              });
            }}
            className="text-cork-muted hover:bg-cork-border/50 hover:text-cork-text flex cursor-pointer items-center justify-center rounded-md p-1 transition-colors duration-200"
          >
            <RemoveFormatting className="size-4" />
          </button>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// Viewport-space anchor for placing the toolbar over the active DOM range. The
// first-line-not-bounding-box rationale lives in `firstLineAnchor`; here it
// keeps the toolbar centered on the real text (not dragged toward the editor
// middle by a multi-line selection's full-width line-fill rects).
function selectionRect(selection: Selection): Anchor | null {
  if (selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return firstLineAnchor(range.getClientRects(), range.getBoundingClientRect());
}
