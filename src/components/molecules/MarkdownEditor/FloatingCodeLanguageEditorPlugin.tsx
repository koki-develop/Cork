import { $isCodeNode } from "@lexical/code";
import {
  CODE_LANGUAGE_MAP,
  getCodeLanguageOptions,
  getLanguageFriendlyName,
  normalizeCodeLanguage,
} from "@lexical/code-prism";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { clsx } from "clsx";
import { $getNearestNodeFromDOMNode, $getNodeByKey, isDOMNode } from "lexical";
import { Check } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useReanchorOnScroll } from "@/hooks/ui/useReanchorOnScroll";
import { isArrowDownKey, isArrowUpKey, isImeKeyEvent } from "@/lib/keyboard";
import { fuzzySubsequenceMatch, fuzzySubsequenceMatchIndices } from "@/lib/tags";

import { LANGUAGE_TAB_CLASS } from "./CorkCodeNode";
import { anchorsEqual, type Anchor, firstLineAnchor, placeBelowStart } from "./placement";

// Every language `getLanguageFriendlyName` can show a proper label for,
// sorted alphabetically by that label for a stable, scannable list — the
// declaration order of `CODE_LANGUAGE_FRIENDLY_NAME_MAP` (this list's
// upstream source) is grouping-by-nothing-in-particular.
const LANGUAGE_OPTIONS = getCodeLanguageOptions()
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label));

// Case-insensitive reverse lookup so typing a friendly label (any casing)
// commits its canonical identifier rather than the literal typed text — e.g.
// typing "javascript" or "JavaScript" both resolve to `js`, matching the task
// spec's "the friendly label displays, but `js` is what's actually saved."
const LANGUAGE_VALUE_BY_LOWER_LABEL = new Map(
  LANGUAGE_OPTIONS.map((o) => [o.label.toLowerCase(), o.value]),
);

// A `Map`, not a lowercased bracket lookup directly against `CODE_LANGUAGE_MAP`
// (a plain object) — that object inherits `Object.prototype`, so typing e.g.
// "constructor" or "toString" would resolve to a built-in function instead of
// falling through to the verbatim-text branch, silently corrupting the saved
// fence language. A `Map` has no prototype chain to leak through.
const CODE_LANGUAGE_ALIAS_BY_LOWER = new Map(
  Object.entries(CODE_LANGUAGE_MAP).map(([alias, canonical]) => [alias.toLowerCase(), canonical]),
);

// Resolves free-typed text to what actually gets stored: an exact (any-case)
// match against a known friendly label wins first (`"JavaScript"` → `js`);
// otherwise a known alias is canonicalized the same way Lexical's own
// `normalizeCodeLanguage` does for typed fence info strings (`"ts"` →
// `typescript`), just case-insensitively — a convenience this combobox
// affords that raw Markdown typing doesn't. Anything else (`"kotlin"`,
// `"go"`) is kept verbatim, in the user's exact casing: fenced code blocks
// accept arbitrary info strings, and `CodeBlockHighlightPlugin` already
// falls back gracefully (`DEFAULT_CODE_LANGUAGE` "auto" highlight) for a
// language it doesn't recognize.
function resolveTypedLanguage(trimmed: string): string {
  const lower = trimmed.toLowerCase();
  const byLabel = LANGUAGE_VALUE_BY_LOWER_LABEL.get(lower);
  if (byLabel) return byLabel;
  const alias = CODE_LANGUAGE_ALIAS_BY_LOWER.get(lower);
  if (alias) return alias;
  return trimmed;
}

// Blank input means "remove the language" (empty fence info string, chip
// hidden) — distinct from picking the `plain` ("Plain Text") option, which
// still writes a visible `plain` info string.
function resolveDraftLanguage(draft: string): string | null {
  const trimmed = draft.trim();
  return trimmed === "" ? null : resolveTypedLanguage(trimmed);
}

// `rows[].value` is always a canonical id (`py`), but a code block's STORED
// language can be a non-canonical alias written by another tool or an older
// version of this app (`python`). Comparing them directly would treat every
// alias-typed fence as "changed" even when the user confirmed with no edit
// at all, silently rewriting the fence and dirtying the document. Normalize
// the stored side the same way before comparing.
function normalizeStoredLanguage(language: string | null): string | null {
  return language == null ? null : normalizeCodeLanguage(language);
}

type LanguageRow = { value: string; label: string; custom?: boolean };

// The fuzzy-filtered option list plus, when the typed text doesn't already
// resolve to one of those options, a trailing "use what I typed verbatim"
// row — the free-input escape hatch the task spec asks for, made a visible,
// clickable choice instead of a keyboard-only side effect of pressing Enter.
function buildRows(draft: string): LanguageRow[] {
  const trimmed = draft.trim();
  if (trimmed === "") return LANGUAGE_OPTIONS;
  const filtered = LANGUAGE_OPTIONS.filter(
    (o) => fuzzySubsequenceMatch(o.label, trimmed) || fuzzySubsequenceMatch(o.value, trimmed),
  );
  const resolved = resolveTypedLanguage(trimmed);
  if (filtered.some((o) => o.value === resolved)) return filtered;
  return [...filtered, { value: resolved, label: trimmed, custom: true }];
}

function HighlightedLabel({ label, query }: { label: string; query: string }) {
  const indices = query ? fuzzySubsequenceMatchIndices(label, query) : null;
  if (!indices || indices.length === 0) return <>{label}</>;
  const matched = new Set(indices);
  const chars = Array.from(label);
  return (
    <>
      {chars.map((ch, i) =>
        matched.has(i) ? (
          <span key={i} className="text-cork-accent-hover font-semibold">
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}

// The code block currently being edited: its node key, its language at the
// moment the panel opened (the commit baseline — see `commitAndHide`), and
// the viewport anchor the panel is positioned against.
type LanguageBox = { key: string; language: string | null; anchor: Anchor };

// Fixed panel width (Tailwind's `w-60` below) — unlike `FloatingLinkEditorPlugin`'s
// URL panel (whose content is unpredictable in length), a language name +
// id reads better at a stable width than one that reflows per keystroke, so
// this is a constant, not measured state. Only the height varies (row count),
// which the measure effect below tracks.
const PANEL_WIDTH = 240;
const INITIAL_HEIGHT = 220;

// Click-triggered floating combobox for changing (or setting) a fenced code
// block's language, opened by clicking `CorkCodeNode`'s tab itself (the tab
// IS the button — no separate pencil icon). Unlike `FloatingLinkEditorPlugin`
// (hover-driven, with a separate view/edit mode), clicking the tab always
// opens straight into "editing" — there's no view mode to toggle back to —
// so this plugin owns exactly one state machine: closed, or open for one
// code block's key.
export function FloatingCodeLanguageEditorPlugin(): ReactNode {
  const [editor] = useLexicalComposerContext();
  const [box, setBox] = useState<LanguageBox | null>(null);
  const [draft, setDraft] = useState("");
  // Whether the user has actually typed since the panel opened. `draft` is
  // pre-filled with the current friendly name so retyping it is quick, but
  // that pre-fill must NOT double as a filter query — otherwise opening the
  // panel would immediately narrow the list down to just the current
  // language (matching itself), hiding every other option until the user
  // cleared the field first. `rows` below uses an empty query (full list)
  // until this flips true.
  const [edited, setEdited] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [panelHeight, setPanelHeight] = useState(INITIAL_HEIGHT);

  const keyRef = useRef<string | null>(null);
  const idRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Set right before an Arrow-key `setSelectedIndex` so the scroll effect
  // below can tell "moved by keyboard" apart from "moved by mouse hover" or
  // "reset by typing" — only a keyboard move should yank the list's scroll
  // position, a stray hover mid-scroll must not fight the user.
  const keyboardNavRef = useRef(false);
  // True from an Arrow-key move until the mouse genuinely moves again.
  // Chromium re-runs hit-testing and dispatches `mouseover`/`mouseenter`
  // whenever the DOM under an UNMOVED cursor changes — which the Arrow-key
  // scroll effect does constantly — so a purely keyboard-driven move
  // visibly "steals" the highlight back to whatever row the stationary
  // mouse now happens to sit over. `mousemove` is the one event type that
  // ONLY fires on genuine pointer movement (never re-fired by a layout
  // change alone, unlike `mouseover`/`mouseenter`), so it's the correct
  // "did the mouse actually move" signal — see the `mousemove` effect below,
  // which is what flips this back to `false`. Comparing coordinates instead
  // (as an earlier version of this fix did) has a gap: it only has a
  // "last real position" to compare against AFTER the first real hover, so
  // the very first scroll-triggered phantom event always slips through.
  // This flag needs no such baseline — it's set unconditionally on every
  // Arrow-key press, before any hover has necessarily happened yet.
  const mouseDisabledRef = useRef(false);

  const rows = useMemo(() => buildRows(edited ? draft : ""), [edited, draft]);

  // Viewport anchor of a code block's tab by node key, so the panel opens
  // flush below the tab's left edge like a dropdown under its trigger.
  const anchorForKey = useCallback(
    (key: string): Anchor | null => {
      const el = editor.getElementByKey(key);
      if (el == null) return null;
      const tab = el.querySelector(`.${LANGUAGE_TAB_CLASS}`) ?? el;
      return firstLineAnchor(tab.getClientRects(), tab.getBoundingClientRect());
    },
    [editor],
  );

  const hide = useCallback(() => {
    keyRef.current = null;
    setBox(null);
    setDraft("");
    setEdited(false);
    setSelectedIndex(-1);
    mouseDisabledRef.current = false;
  }, []);

  // Commits whatever the panel is currently showing (the highlighted row if
  // one is selected, otherwise the typed text resolved per
  // `resolveDraftLanguage`) and closes. Used ONLY by explicit confirmation —
  // Enter and a row click — never by blur/outside-click/switching to a
  // different code block's tab, which must discard instead (see `hide`'s
  // call sites below). A no-op edit (draft resolves back to the language the
  // panel opened with) skips `setLanguage` entirely — it unconditionally
  // marks the node dirty.
  const commitAndHide = useEffectEvent(() => {
    const current = box;
    if (current == null) return;
    const next =
      selectedIndex >= 0 && selectedIndex < rows.length
        ? rows[selectedIndex].value
        : resolveDraftLanguage(draft);
    if (next !== normalizeStoredLanguage(current.language ?? null)) {
      editor.update(() => {
        const node = $getNodeByKey(current.key);
        if ($isCodeNode(node)) node.setLanguage(next);
      });
    }
    hide();
  });

  const openForKey = useCallback(
    (key: string) => {
      const language = editor.read(() => {
        const node = $getNodeByKey(key);
        return $isCodeNode(node) ? (node.getLanguage() ?? null) : null;
      });
      const anchor = anchorForKey(key);
      if (anchor == null) return;
      idRef.current += 1;
      keyRef.current = key;
      setBox({ key, language, anchor });
      setDraft(language ? getLanguageFriendlyName(language) : "");
      setEdited(false);
      mouseDisabledRef.current = false;
      const normalized = language ? normalizeCodeLanguage(language) : null;
      setSelectedIndex(normalized ? LANGUAGE_OPTIONS.findIndex((o) => o.value === normalized) : -1);
    },
    [editor, anchorForKey],
  );

  // mousedown is preventDefaulted for the tab so clicking it doesn't shift
  // native focus/selection before the `click` handler below runs (the same
  // reason `PanelButton` in `FloatingLinkEditorPlugin` preventDefaults its
  // own mousedown) — this is also why a currently-open panel's input never
  // naturally blurs when a DIFFERENT code block's tab is clicked, and
  // `onClick` below has to close the open one explicitly instead of relying
  // on a blur to do it.
  const onMouseDown = useEffectEvent((e: MouseEvent) => {
    const target = e.target;
    if (!isDOMNode(target) || !(target instanceof Element)) return;
    if (target.closest(`.${LANGUAGE_TAB_CLASS}`) != null) {
      e.preventDefault();
    }
  });

  const onClick = useEffectEvent((e: MouseEvent) => {
    const target = e.target;
    if (!isDOMNode(target) || !(target instanceof Element)) return;
    const tab = target.closest(`.${LANGUAGE_TAB_CLASS}`);
    if (tab == null) return;
    e.preventDefault();
    const key = editor.read(() => {
      const node = $getNearestNodeFromDOMNode(tab);
      return node != null && $isCodeNode(node) ? node.getKey() : null;
    });
    if (key == null) return;
    const wasOpenForThisKey = keyRef.current === key;
    // Clicking a different code block's tab while one is open is exactly the
    // same gesture as clicking outside — discard, don't commit (see
    // `onBlur`'s comment for why only Enter/a row click may commit).
    if (keyRef.current != null) hide();
    if (!wasOpenForThisKey) openForKey(key);
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

  // Re-anchor on scroll/resize (the anchor is viewport-relative). Hides if
  // the stored key no longer maps to a code block (removed out-of-band).
  const reanchor = useEffectEvent(() => {
    const key = keyRef.current;
    if (key == null) return;
    const stillCode = editor.read(() => $isCodeNode($getNodeByKey(key)));
    if (!stillCode) {
      hide();
      return;
    }
    const anchor = anchorForKey(key);
    if (anchor == null) return;
    setBox((prev) =>
      prev == null || anchorsEqual(prev.anchor, anchor) ? prev : { ...prev, anchor },
    );
  });

  const visible = box != null;
  useReanchorOnScroll(visible, reanchor);

  // Re-enables mouse-driven row selection once the pointer genuinely moves
  // again after an Arrow-key press — `mousemove` (unlike `mouseover`/
  // `mouseenter`) only ever fires on real pointer motion, never re-fired by
  // a layout/scroll change alone, which is exactly the distinction
  // `mouseDisabledRef` needs.
  useEffect(() => {
    if (!visible) return;
    const onMouseMove = () => {
      mouseDisabledRef.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [visible]);

  // Focus + select the input the moment the panel opens so typing replaces
  // the pre-filled friendly name immediately.
  useEffect(() => {
    if (box != null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    // `box?.key` (not the whole `box`) so re-anchoring on scroll doesn't
    // re-focus/re-select an in-progress edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box?.key]);

  // Measure the rendered panel's height so positioning self-corrects to the
  // real size (which varies with the row count). Width isn't measured here —
  // it's a fixed `PANEL_WIDTH` (see above), so there's nothing to self-correct.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (el != null && el.offsetHeight > 0) {
      setPanelHeight((prev) => (prev === el.offsetHeight ? prev : el.offsetHeight));
    }
  }, [box?.key, rows.length]);

  // Scroll the highlighted row into view after an Arrow-key move — the list
  // scrolls itself independently of the panel, so nothing else keeps a
  // keyboard-selected row that's scrolled out of the visible area in sight.
  useEffect(() => {
    if (!keyboardNavRef.current) return;
    keyboardNavRef.current = false;
    listRef.current
      ?.querySelector('[role="option"][aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // The current language can sort anywhere in the 17-language alphabetical
  // list — for one near the bottom (e.g. "XML"), the panel would otherwise
  // open showing the TOP of the list, with the actual selection scrolled out
  // of view until the user scrolled down to find it. `useLayoutEffect` (not
  // `useEffect`) runs this before the browser paints the freshly-opened
  // panel, so the list is already centered on the selection in the very
  // first visible frame — no visible post-open scroll jump. `block: "center"`
  // (vs the Arrow-key effect's "nearest") gives the user surrounding options
  // to browse right away, which matters here since nothing has scrolled yet.
  useLayoutEffect(() => {
    if (box == null) return;
    listRef.current
      ?.querySelector('[role="option"][aria-selected="true"]')
      ?.scrollIntoView({ block: "center", behavior: "instant" });
    // `box?.key` (not the whole `box`) — this must fire once per fresh open,
    // not on every re-anchor (scroll/resize) while the same panel stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box?.key]);

  // Any focus-away from the panel (Tab, clicking prose elsewhere in the
  // editor, clicking outside the editor entirely) closes WITHOUT committing —
  // only an explicit confirmation (Enter, or clicking a row — see their own
  // handlers) may change the language. Row buttons preventDefault their own
  // mousedown (see below) so clicking one never fires this blur before its
  // own click handler runs, and thus never hits this discard path.
  const onBlur = (e: FocusEvent<HTMLInputElement>) => {
    if (e.relatedTarget instanceof Node && panelRef.current?.contains(e.relatedTarget)) return;
    hide();
  };

  // See `mouseDisabledRef`'s comment: ignore hover entirely while it's set —
  // it's a scroll-triggered hit-test artifact, not real mouse intent, until
  // the `mousemove` effect below clears it.
  const onRowMouseEnter = (index: number) => {
    if (mouseDisabledRef.current) return;
    setSelectedIndex(index);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isImeKeyEvent(e)) return;
    if (isArrowDownKey(e)) {
      e.preventDefault();
      keyboardNavRef.current = true;
      mouseDisabledRef.current = true;
      setSelectedIndex((i) => (rows.length === 0 ? -1 : (i + 1) % rows.length));
      return;
    }
    if (isArrowUpKey(e)) {
      e.preventDefault();
      keyboardNavRef.current = true;
      mouseDisabledRef.current = true;
      setSelectedIndex((i) => (rows.length === 0 ? -1 : (i - 1 + rows.length) % rows.length));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commitAndHide();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      hide();
    }
  };

  const pos =
    box == null ? null : placeBelowStart(box.anchor, { width: PANEL_WIDTH, height: panelHeight });
  const currentValue = box?.language ? normalizeCodeLanguage(box.language) : null;

  return createPortal(
    <AnimatePresence>
      {box != null && pos != null && (
        <m.div
          key={idRef.current}
          ref={panelRef}
          role="dialog"
          aria-label="Edit code block language"
          style={{ left: pos.x, top: pos.y }}
          className="border-cork-border/40 bg-cork-elevated fixed z-[60] flex max-h-[min(20rem,60vh)] w-60 flex-col overflow-hidden rounded-lg border p-1 text-xs shadow-xl"
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <input
            ref={inputRef}
            type="text"
            value={draft}
            aria-label="Code block language"
            placeholder="Plain Text"
            onChange={(e) => {
              const value = e.target.value;
              setDraft(value);
              setEdited(true);
              setSelectedIndex(value.trim() === "" ? -1 : 0);
            }}
            onKeyDown={handleKeyDown}
            onBlur={onBlur}
            className="text-cork-text placeholder:text-cork-muted/50 w-full rounded-md px-2 py-1.5 focus-visible:outline-none"
          />
          <div className="bg-cork-border/40 mx-1 mb-1 h-px shrink-0" />
          <ul
            ref={listRef}
            role="listbox"
            aria-label="Languages"
            className="min-h-0 overflow-y-auto"
          >
            {rows.map((row, index) => {
              const isHighlighted = index === selectedIndex;
              return (
                <li key={row.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => onRowMouseEnter(index)}
                    onClick={() => {
                      const target = box;
                      if (
                        target != null &&
                        row.value !== normalizeStoredLanguage(target.language ?? null)
                      ) {
                        editor.update(() => {
                          const node = $getNodeByKey(target.key);
                          if ($isCodeNode(node)) node.setLanguage(row.value);
                        });
                      }
                      hide();
                    }}
                    // No CSS `hover:` class here — deliberately. `:hover` is
                    // matched by the browser purely against the cursor's
                    // screen position, independent of any JS state, so it
                    // would keep painting a phantom hover on a row the
                    // Arrow-key scroll effect moved under a stationary
                    // cursor even after `mouseDisabledRef` correctly stops
                    // `selectedIndex` from following it. Driving the
                    // highlight from `isHighlighted` alone keeps "hovered"
                    // and "keyboard-selected" as one single, JS-controlled
                    // visual state.
                    className={clsx(
                      "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left",
                      isHighlighted ? "bg-cork-accent/15 text-cork-text" : "text-cork-muted",
                    )}
                  >
                    {row.value === currentValue ? (
                      <Check className="text-cork-accent size-3 shrink-0" />
                    ) : (
                      <span className="size-3 shrink-0" />
                    )}
                    {row.custom ? (
                      // No id badge here (unlike the branch below) — for a
                      // custom row `row.value` already equals `row.label`
                      // verbatim, so repeating it would just be noise.
                      <span className="min-w-0 flex-1 truncate">{row.label}</span>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate">
                          <HighlightedLabel label={row.label} query={draft.trim()} />
                        </span>
                        <span className="text-cork-muted/60 shrink-0 font-mono text-[10px]">
                          {row.value}
                        </span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
