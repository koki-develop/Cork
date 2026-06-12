import { $isAutoLinkNode, $isLinkNode, formatUrl, type LinkNode } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { clsx } from "clsx";
import { $getNearestNodeFromDOMNode, $getNodeByKey, isDOMNode } from "lexical";
import { Check, ExternalLink, SquarePen, Unlink, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useClickOutside } from "@/hooks/ui/useClickOutside";
import { isImeKeyEvent } from "@/lib/keyboard";

import { $closestProseLink, isBrowserOpenable } from "./link";
import { anchorsEqual, type Anchor, firstLineAnchor, placeBelowStart } from "./placement";

export type FloatingLinkEditorPluginProps = {
  /** Opens a link's URL (wired to the system browser via @/api). */
  onOpenLink: (url: string) => void;
};

// The link currently surfaced by the editor: its URL, the node key (the panel
// edits and re-anchors by key, never by selection — it's hover-driven), and the
// viewport anchor.
type LinkBox = { url: string; key: string; anchor: Anchor };

// Fallback panel size used to position the first frame before it has been
// measured; the real size takes over on layout (see the measure effect).
const ESTIMATED_SIZE = { width: 240, height: 36 };

// Hover dwell before the panel appears, and the grace period before it hides
// after the pointer leaves. The hide delay bridges the gap between the link and
// the panel below it, so moving onto the panel (which cancels the timer) doesn't
// race the hide.
const SHOW_DELAY = 350;
const HIDE_DELAY = 250;

// A Notion-style hover editor for manually-authored links (`[text](url)`).
// Dwelling on such a link fades a small panel in below it to open / edit / remove
// the URL; bare-URL autolinks are excluded (they're edited by editing their
// text). Because it's hover- not selection-driven, every mutation targets the
// link by node key rather than the current selection.
export function FloatingLinkEditorPlugin({ onOpenLink }: FloatingLinkEditorPluginProps): ReactNode {
  const [editor] = useLexicalComposerContext();
  const [box, setBox] = useState<LinkBox | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [size, setSize] = useState(ESTIMATED_SIZE);

  // editingRef mirrors `editing` synchronously so hover handlers (which run
  // outside render) never hide or switch the panel mid-edit. keyRef holds the
  // shown link's node key for editing and for scroll/resize re-anchoring.
  // idRef/shownRef key each appearance so a fresh show remounts cleanly
  // (re-running the fade-in in place). The timer/pending refs drive the hover
  // show/hide debounce.
  const editingRef = useRef(false);
  const keyRef = useRef<string | null>(null);
  const idRef = useRef(0);
  const shownRef = useRef(false);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const pendingShowKeyRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Viewport anchor of a link node by key, from its first line box.
  const anchorForKey = useCallback(
    (key: string): Anchor | null => {
      const el = editor.getElementByKey(key);
      if (el == null) return null;
      return firstLineAnchor(el.getClientRects(), el.getBoundingClientRect());
    },
    [editor],
  );

  const clearShow = useCallback(() => {
    if (showTimerRef.current != null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    pendingShowKeyRef.current = null;
  }, []);

  const clearHide = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearShow();
    clearHide();
    shownRef.current = false;
    keyRef.current = null;
    editingRef.current = false;
    setEditing(false);
    setBox(null);
  }, [clearShow, clearHide]);

  // Surface the panel (view mode) for the given link key, reading its current
  // URL. A no-op if the node is gone or isn't a prose link.
  const showLink = useEffectEvent((key: string) => {
    const url = editor.read(() => {
      const node = $getNodeByKey(key);
      return $isLinkNode(node) && !$isAutoLinkNode(node) ? node.getURL() : null;
    });
    if (url == null) return;
    const anchor = anchorForKey(key);
    if (anchor == null) return;
    if (!shownRef.current) {
      shownRef.current = true;
      idRef.current += 1;
    }
    keyRef.current = key;
    setBox({ url, key, anchor });
  });

  const scheduleShow = useEffectEvent((key: string) => {
    if (editingRef.current) return; // don't switch links mid-edit
    clearHide();
    if (shownRef.current && keyRef.current === key) return; // already showing it
    if (pendingShowKeyRef.current === key) return; // already scheduled
    clearShow();
    pendingShowKeyRef.current = key;
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;
      pendingShowKeyRef.current = null;
      showLink(key);
    }, SHOW_DELAY);
  });

  const scheduleHide = useEffectEvent(() => {
    if (editingRef.current) return; // stay open while editing
    clearShow();
    if (hideTimerRef.current != null) return; // already scheduled
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      hide();
    }, HIDE_DELAY);
  });

  // Re-anchor the shown panel to the same link on scroll/resize (the anchor is
  // viewport-relative, so any layout shift must move the panel). Works in view
  // and edit mode since it keys off the stored node, not the pointer. Hides if
  // the stored key no longer maps to a prose link (removed out-of-band, or its
  // NodeKey reused), so the panel can't strand over unrelated content. Skips the
  // state update when the box hasn't moved, so a scroll burst doesn't re-render.
  const reanchor = useEffectEvent(() => {
    const key = keyRef.current;
    if (key == null) return;
    const stillLink = editor.read(() => {
      const node = $getNodeByKey(key);
      return $isLinkNode(node) && !$isAutoLinkNode(node);
    });
    if (!stillLink) {
      hide();
      return;
    }
    const anchor = anchorForKey(key);
    if (anchor == null) return;
    setBox((prev) =>
      prev == null || anchorsEqual(prev.anchor, anchor) ? prev : { ...prev, anchor },
    );
  });

  // Hover detection, delegated on the editor root. mouseover (which bubbles)
  // catches moving onto / between / off links inside the editor; mouseout with a
  // relatedTarget outside the root catches leaving the editor entirely (e.g.
  // toward the panel) — the grace timer then bridges to the panel's own enter.
  const onMouseOver = useEffectEvent((e: MouseEvent) => {
    const target = e.target;
    if (!isDOMNode(target)) return;
    // Cheap pre-filter before entering Lexical: a link always renders as an
    // <a>, so when the pointer isn't over one (the common case — plain prose)
    // skip the read + node-tree walk entirely. (Bare-URL autolinks are also
    // <a>, so the read below still runs to exclude them via $closestProseLink.)
    if (!(target instanceof Element) || target.closest("a") == null) {
      scheduleHide();
      return;
    }
    const key = editor.read(() => {
      const node = $getNearestNodeFromDOMNode(target);
      const link = node != null ? $closestProseLink(node) : null;
      return link != null ? link.getKey() : null;
    });
    if (key != null) scheduleShow(key);
    else scheduleHide();
  });

  const onMouseOut = useEffectEvent((e: MouseEvent) => {
    const related = e.relatedTarget;
    const root = editor.getRootElement();
    if (related instanceof Node && root != null && root.contains(related)) return;
    scheduleHide();
  });

  useEffect(() => {
    return editor.registerRootListener((rootElement) => {
      if (rootElement != null) {
        const over = (e: MouseEvent) => onMouseOver(e);
        const out = (e: MouseEvent) => onMouseOut(e);
        rootElement.addEventListener("mouseover", over);
        rootElement.addEventListener("mouseout", out);
        return () => {
          rootElement.removeEventListener("mouseover", over);
          rootElement.removeEventListener("mouseout", out);
        };
      }
    });
  }, [editor]);

  // Clear any pending timers when the plugin unmounts.
  useEffect(() => () => hide(), [hide]);

  const visible = box != null;
  useEffect(() => {
    if (!visible) return;
    const onScrollResize = () => reanchor();
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [visible]);

  // Focus (and select) the input when entering edit mode so the URL is ready to
  // type over immediately.
  useEffect(() => {
    if (editing) {
      const input = inputRef.current;
      input?.focus();
      input?.select();
    }
  }, [editing]);

  // Measure the rendered panel so positioning self-corrects to the real width
  // (which varies with the URL / the input), keyed on what changes that size.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (el != null && el.offsetWidth > 0) {
      setSize((prev) =>
        prev.width === el.offsetWidth && prev.height === el.offsetHeight
          ? prev
          : { width: el.offsetWidth, height: el.offsetHeight },
      );
    }
  }, [editing, box?.url, box?.key]);

  // Edit / remove operate on the stored node key, not the selection (the link is
  // hovered, not selected).
  const unwrapByKey = useCallback(
    (key: string) => {
      editor.update(() => {
        const node = $getNodeByKey(key);
        if ($isLinkNode(node) && !$isAutoLinkNode(node)) $unwrapLink(node);
      });
    },
    [editor],
  );

  // Apply the typed URL. An empty URL means "no link", so it unwraps — the same
  // as the remove action.
  const applyUrl = useEffectEvent(() => {
    const key = keyRef.current;
    if (key != null) {
      const url = draft.trim();
      if (url === "") unwrapByKey(key);
      else {
        editor.update(() => {
          const node = $getNodeByKey(key);
          if ($isLinkNode(node) && !$isAutoLinkNode(node)) node.setURL(formatUrl(url));
        });
      }
    }
    hide();
  });

  const removeLink = useCallback(() => {
    const key = keyRef.current;
    if (key != null) unwrapByKey(key);
    hide();
  }, [unwrapByKey, hide]);

  const startEdit = useCallback(() => {
    if (box == null) return;
    clearHide();
    setDraft(box.url);
    editingRef.current = true;
    setEditing(true);
  }, [box, clearHide]);

  // While editing, a mousedown outside the panel discards the edit (clicking
  // away cancels — committing requires Enter or the apply button, so a stray
  // click can't silently rewrite or unwrap the link). Same dismissal mechanism
  // as every other popover in the app.
  useClickOutside([panelRef], hide, editing);

  const pos = box == null ? null : placeBelowStart(box.anchor, size);
  const openable = box != null && isBrowserOpenable(box.url);

  return createPortal(
    <AnimatePresence>
      {box != null && pos != null && (
        <m.div
          key={idRef.current}
          ref={panelRef}
          role="dialog"
          aria-label="Edit link"
          onMouseEnter={clearHide}
          onMouseLeave={() => scheduleHide()}
          style={{ left: pos.x, top: pos.y }}
          className="border-cork-border/40 bg-cork-elevated fixed z-[60] flex max-w-[min(28rem,90vw)] items-center gap-1 rounded-lg border p-1 text-xs shadow-xl"
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          {editing ? (
            <>
              <input
                ref={inputRef}
                type="text"
                value={draft}
                aria-label="Link URL"
                placeholder="https://example.com"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Let an in-flight IME composition keep Enter/Escape.
                  if (isImeKeyEvent(e)) return;
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyUrl();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    hide();
                  }
                }}
                className="bg-cork-elevated/60 text-cork-text placeholder:text-cork-muted/50 w-64 max-w-full rounded-md px-2 py-1 focus-visible:outline-none"
              />
              <PanelButton label="Apply" icon={Check} tone="success" onClick={applyUrl} />
              <PanelButton label="Cancel" icon={X} tone="danger" onClick={hide} />
            </>
          ) : (
            <>
              {openable ? (
                <button
                  type="button"
                  title={box.url}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onOpenLink(box.url)}
                  className="text-cork-accent hover:text-cork-accent-hover flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1"
                >
                  <ExternalLink className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate underline underline-offset-2">{box.url}</span>
                </button>
              ) : (
                <span title={box.url} className="text-cork-muted min-w-0 truncate px-2 py-1">
                  {box.url}
                </span>
              )}
              <div className="bg-cork-border/40 mx-0.5 h-4 w-px shrink-0" />
              <PanelButton label="Edit link" icon={SquarePen} onClick={startEdit} />
              <PanelButton label="Remove link" icon={Unlink} onClick={removeLink} />
            </>
          )}
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// Unwraps a link in place: lifts its children out before it, then removes the
// now-empty link. Used by both the edit (empty URL) and remove actions.
//
// Done by hand rather than via @lexical/link's `$toggleLink(null)` because that
// operates on the current selection, and this panel is hover- / key-driven —
// there is no selection on the link. (This mirrors `$toggleLink`'s own
// whole-link removal branch: re-parent children, then remove the empty link.)
function $unwrapLink(node: LinkNode): void {
  for (const child of node.getChildren()) node.insertBefore(child);
  node.remove();
}

// Hover tint per action: neutral by default, green for confirm, red for cancel —
// the icon + wash hue signals the action at a glance.
const TONE_CLASSES = {
  default: "hover:bg-cork-border/50 hover:text-cork-text",
  success: "hover:bg-cork-success-text/15 hover:text-cork-success-text",
  danger: "hover:bg-cork-danger-text/15 hover:text-cork-danger-text",
} as const;

// An icon action in the panel. mousedown is preventDefaulted so the click keeps
// the URL input's focus (edit mode) and doesn't disturb the editor's caret.
function PanelButton({
  label,
  icon: Icon,
  tone = "default",
  onClick,
}: {
  label: string;
  icon: typeof Check;
  tone?: keyof typeof TONE_CLASSES;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={clsx(
        "text-cork-muted flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 transition-colors duration-200",
        TONE_CLASSES[tone],
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
