import { $isCodeNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown";
import { AutoLinkPlugin, createLinkMatcherWithRegExp } from "@lexical/react/LexicalAutoLinkPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { clsx } from "clsx";
import type { EditorState, EditorThemeClasses } from "lexical";
import { forwardRef, useCallback } from "react";

import { CodeBlockEscapePlugin } from "./CodeBlockEscapePlugin";
import { FloatingFormatToolbarPlugin } from "./FloatingFormatToolbarPlugin";
import { FloatingLinkEditorPlugin } from "./FloatingLinkEditorPlugin";
import { FormatFormattableTextPlugin } from "./FormatFormattableTextPlugin";
import { FormatShortcutPlugin } from "./FormatShortcutPlugin";
import { HorizontalRuleKeyboardPlugin } from "./HorizontalRuleKeyboardPlugin";
import { LinkOpenPlugin } from "./LinkOpenPlugin";
import { ListExitPlugin } from "./ListExitPlugin";
import { ListTabIndentationPlugin } from "./ListTabIndentationPlugin";
import { NoListInTablePlugin } from "./NoListInTablePlugin";
import { TableKeyboardPlugin } from "./TableKeyboardPlugin";
import {
  MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS,
  MARKDOWN_TEXT_FORMAT_SHORTCUT_TRANSFORMERS,
  MARKDOWN_TRANSFORMERS,
} from "./transformers";

// Maps Lexical node types to Cork's Tailwind tokens so Markdown renders WYSIWYG
// with the app's typography. Headings/inline-code override the editor box's
// base `text-sm`.
const theme: EditorThemeClasses = {
  // Sunken dark well (not the lighter `cork-elevated` used by inputs) so a code
  // block reads as code, not an editable field.
  code: "my-2 block overflow-x-auto whitespace-pre rounded-md border border-cork-border/50 bg-cork-bg p-3 font-mono text-xs leading-relaxed",
  heading: {
    h1: "mt-3 mb-2 text-2xl font-bold tracking-tight first:mt-0",
    h2: "mt-3 mb-2 text-xl font-bold tracking-tight first:mt-0",
    h3: "mt-3 mb-1.5 text-lg font-semibold first:mt-0",
    h4: "mt-2 mb-1 text-base font-semibold first:mt-0",
    h5: "mt-2 mb-1 text-sm font-medium first:mt-0",
    h6: "mt-2 mb-1 text-xs font-medium text-cork-muted first:mt-0",
  },
  // Horizontal rule (`---`). The <hr>'s visible line + click-target padding and
  // the click-selected outline live in style.css (`cork-hr` needs an `::after`
  // to draw the rule, like the table-cell overlay); `hrSelected` is the class
  // HorizontalRuleNode toggles when the rule is click-selected.
  hr: "cork-hr",
  hrSelected: "cork-hr-selected",
  // `cursor-pointer` signals that a click follows the link (LinkOpenPlugin).
  link: "cursor-pointer text-cork-accent underline underline-offset-2 hover:text-cork-accent-hover",
  list: {
    listitem: "mb-1",
    nested: { listitem: "list-none" },
    ol: "my-2 list-decimal pl-6",
    ul: "my-2 list-disc pl-6",
  },
  paragraph: "mb-2 last:mb-0",
  quote: "my-2 border-l-2 border-cork-border pl-3 text-cork-muted",
  // Minimal grid styling — visual polish (resize handles, selection, etc.) comes
  // later. `tableCell`/`tableCellHeader` stack: a header cell gets both classes.
  // `block` + `w-max` + `max-w-full` + `overflow-x-auto` is the responsive-table
  // trick (à la GitHub): the table sizes to its content but is capped at the
  // editor width and scrolls horizontally on its own, so a wide table never
  // pushes the dialog wider (the editor root carries `min-w-0` so its grid /
  // flex track is allowed to shrink below the table's intrinsic width).
  // The table scrolls inside a wrapper div (TablePlugin `hasHorizontalScroll`),
  // not by making the `<table>` itself a scroll box — `border-collapse` tables
  // ignore padding, so the wrapper is the only place we can reserve a strip for
  // the horizontal scrollbar (`pb-2`) so it doesn't overlap the last row.
  // `max-w-full` + the editor root's `min-w-0` keep a wide table from widening
  // the dialog; it scrolls within the wrapper instead.
  tableScrollableWrapper: "my-3 max-w-full overflow-x-auto pb-2",
  table: "w-max border-collapse",
  // `relative` so the selected-cell highlight overlay (`::after`) can fill it.
  tableCell: "relative min-w-24 border border-cork-border px-2 py-1 align-top",
  tableCellHeader: "bg-cork-bg font-semibold",
  // Cross-cell (grid) selection: `tableCellSelected` overlays each selected cell
  // with an accent wash; `tableSelection` suppresses the now-redundant native
  // text-selection highlight on the table. Both live in style.css (the overlay
  // needs `::after`, the suppression needs `*::selection`).
  tableCellSelected: "cork-table-cell-selected",
  tableSelection: "cork-table-grid-selection",
  text: {
    bold: "font-bold",
    code: "rounded border border-cork-border/50 bg-cork-bg px-1 py-0.5 font-mono text-[0.85em]",
    // `==text==` is a <mark>: Lexical applies theme.text classes to an inner
    // <span>, never the <mark> itself, so the UA's harsh yellow can't be tamed
    // from here. The soft amber wash lives in style.css (`mark`) instead.
    italic: "italic",
    strikethrough: "line-through",
  },
};

// Registered once. The default Markdown transformers require all but
// AutoLinkNode (which AutoLinkPlugin needs to wrap bare URLs); the Table* nodes
// back the custom TABLE transformer in transformers.ts.
const NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  CodeNode,
  LinkNode,
  AutoLinkNode,
  HorizontalRuleNode,
  TableNode,
  TableRowNode,
  TableCellNode,
];

// Auto-links bare `https://` / `http://` URLs so they're clickable without
// `[text](url)` syntax (GFM-style). The trailing char class drops sentence
// punctuation, so `https://x.com.` links just the URL. On serialization the
// Markdown LINK transformer skips AutoLinkNode, writing it back as the raw URL —
// the file is never rewritten to `[url](url)`. The library only links at
// whitespace / `.,;` / line-start boundaries, so URLs glued to other text
// (e.g. inside parens) are intentionally left alone.
const AUTO_LINK_MATCHERS = [createLinkMatcherWithRegExp(/https?:\/\/[^\s<]+[^\s<.,;:!?'")\]}]/i)];

// Keep URLs inside fenced code blocks as plain text (a pasted command stays a
// command). Inline code isn't reachable here — the plugin only exposes the
// text node's parent — but a bare URL in inline code is rare and still
// round-trips as `` `url` ``.
const AUTO_LINK_EXCLUDE_PARENTS = [$isCodeNode];

export type MarkdownEditorProps = {
  /** Markdown seeded once on mount; later changes are ignored (dialogs remount on open). */
  initialValue: string;
  /** Fires on real edits with the content serialized back to a Markdown string. */
  onChange: (markdown: string) => void;
  /** Opens a clicked link's URL (wired to the system browser via @/api). */
  onOpenLink: (url: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
};

export const MarkdownEditor = forwardRef<HTMLDivElement, MarkdownEditorProps>(
  function MarkdownEditor(
    { initialValue, onChange, onOpenLink, onBlur, placeholder, ariaLabel, className },
    ref,
  ) {
    const handleChange = useCallback(
      (editorState: EditorState) => {
        onChange(editorState.read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS)));
      },
      [onChange],
    );

    const initialConfig = {
      namespace: "task-body",
      theme,
      nodes: NODES,
      // Function form runs inside an editor.update() tagged history-merge, so it
      // never fires OnChangePlugin — body stays equal to the raw initial value
      // until the user actually edits (see design Decision 3).
      editorState: () => $convertFromMarkdownString(initialValue, MARKDOWN_TRANSFORMERS),
      onError: (error: Error) => {
        throw error;
      },
    };

    return (
      <div className={clsx("relative flex min-w-0 flex-col", className)}>
        <LexicalComposer initialConfig={initialConfig}>
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                ref={ref}
                ariaLabel={ariaLabel}
                onBlur={onBlur}
                // Borderless writing surface: flat at rest, no hover or focus
                // fill — the caret alone signals focus (no outline ring).
                className="text-cork-text min-h-0 flex-1 overflow-y-auto px-3 py-2 text-sm break-words whitespace-pre-wrap focus-visible:outline-none"
              />
            }
            placeholder={
              placeholder == null ? null : (
                <div className="text-cork-muted/40 pointer-events-none absolute top-2 left-3 text-sm select-none">
                  {placeholder}
                </div>
              )
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          {/* Block / link shortcuts (headings, lists, tables, horizontal rules,
            links, etc.) — the upstream MarkdownShortcutPlugin handles these
            correctly. Text-format transformers (**bold**, *italic*, ==hl==,
            ~~strike~~, `code`, ***bi***) are stripped from this list because
            its `$runTextFormatTransformers` toggles the format on the wrapped
            content, so wrapping already-bold text with `**...**` un-bolds it.
            FormatShortcutPlugin (below) re-implements that step with set-ON
            semantics. */}
          <MarkdownShortcutPlugin transformers={MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS} />
          {/* Inline-format shortcuts (`**`, `*`, `~~`, `` ` ``, `==`, `***`,
            `___`) with a fixed `set-ON, never toggle` apply step. Co-exists
            with MarkdownShortcutPlugin above — the two handle disjoint
            transformer types, so they can't double-fire. */}
          <FormatShortcutPlugin transformers={MARKDOWN_TEXT_FORMAT_SHORTCUT_TRANSFORMERS} />
          {/* Registers the empty-list-item Enter handler so lists can be exited,
            plus the list insert/remove commands. */}
          <ListPlugin />
          {/* Backward delete (Backspace / Cmd+Backspace / Option+Backspace) at
            the start of a list item exits the list — empty items dispatch
            INSERT_PARAGRAPH_COMMAND so ListPlugin's Enter listener handles
            them (keeps every backward-delete key symmetric with Enter),
            non-empty nested items outdent, non-empty top-level items become
            paragraphs splitting the list around the cut. */}
          <ListExitPlugin />
          {/* Lists inside table cells are unworkable (Tab/Backspace overlap with
            table cell navigation) and visually noisy. The primary block is in
            transformers.ts (cell-aware UNORDERED_LIST/ORDERED_LIST/CHECK_LIST
            wrappers) — this plugin is the safety net for non-transformer paths
            (raw INSERT_*_LIST_COMMAND, paste of pre-built nodes): it unwraps
            any ListNode that still appears inside a TableCellNode. */}
          <NoListInTablePlugin />
          {/* Registers INSERT_HORIZONTAL_RULE_COMMAND and the rule's click-to-select
            behaviour. Rules are authored by typing `---` (or `***` / `___`) and
            round-trip via the HORIZONTAL_RULE transformer in transformers.ts. */}
          <HorizontalRulePlugin />
          {/* Up/Down arrows select an adjacent rule instead of skipping it, so
            vertical caret movement can land on (and delete) it like left/right. */}
          <HorizontalRuleKeyboardPlugin />
          {/* Registers TableNode behaviour: cell selection, Tab navigation, and
            the INSERT_TABLE_COMMAND handler. Tables are authored by typing the
            Markdown pipe syntax (a row `| a | b |` then a divider `| --- | --- |`)
            and round-trip via the TABLE transformer in transformers.ts. */}
          <TablePlugin hasHorizontalScroll />
          {/* Keyboard-driven table editing: Tab on the rightmost cell adds a
            column, Enter adds a row (Shift+Enter = in-cell line break; Enter on
            a trailing empty row exits below), ArrowUp/Down escape a table at the
            document edge into a new paragraph, and Backspace in an empty cell
            deletes an empty column / row (never a header) or moves left. */}
          <TableKeyboardPlugin />
          {/* Tab/Shift+Tab indent within lists; code-block escape via
            Shift+Enter and the boundary arrow keys; click-to-open for links. */}
          <ListTabIndentationPlugin />
          <CodeBlockEscapePlugin />
          {/* Owns ranged FORMAT_TEXT_COMMAND: keeps inline formatting off
            code-block text (which the Markdown serializer would silently drop)
            and makes a mixed selection always enable rather than toggle off the
            first node. See the plugin header for the full rationale. */}
          <FormatFormattableTextPlugin />
          {/* Wraps bare URLs in AutoLinkNodes (typed or loaded from file) so
            LinkOpenPlugin's click handler can open them in the system browser. */}
          <AutoLinkPlugin
            matchers={AUTO_LINK_MATCHERS}
            excludeParents={AUTO_LINK_EXCLUDE_PARENTS}
          />
          <LinkOpenPlugin onOpenLink={onOpenLink} />
          {/* Selection-triggered floating toolbar: toggles bold / italic /
            strikethrough / inline-code for the highlighted text. */}
          <FloatingFormatToolbarPlugin />
          {/* Hover a manually-authored link → a floating editor fades in below it
            to open / edit / remove its URL. */}
          <FloatingLinkEditorPlugin onOpenLink={onOpenLink} />
          {/* ignoreSelectionChange: only real content edits emit — a bare
            focus/cursor move must NOT serialize, or a no-edit open/close of a
            non-canonical body would auto-save a normalized rewrite. */}
          <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
        </LexicalComposer>
      </div>
    );
  },
);
