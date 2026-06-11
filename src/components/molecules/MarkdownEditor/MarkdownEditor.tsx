import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { clsx } from "clsx";
import type { EditorState, EditorThemeClasses } from "lexical";
import { useCallback } from "react";

import { CodeBlockEscapePlugin } from "./CodeBlockEscapePlugin";
import { LinkOpenPlugin } from "./LinkOpenPlugin";
import { ListTabIndentationPlugin } from "./ListTabIndentationPlugin";

// Maps Lexical node types to Cork's Tailwind tokens so Markdown renders WYSIWYG
// with the app's typography. Headings/inline-code override the editor box's
// base `text-sm`.
const theme: EditorThemeClasses = {
  code: "my-2 block overflow-x-auto whitespace-pre rounded-md bg-cork-bg/60 p-3 font-mono text-xs leading-relaxed",
  heading: {
    h1: "mt-3 mb-2 text-2xl font-bold tracking-tight first:mt-0",
    h2: "mt-3 mb-2 text-xl font-bold tracking-tight first:mt-0",
    h3: "mt-3 mb-1.5 text-lg font-semibold first:mt-0",
    h4: "mt-2 mb-1 text-base font-semibold first:mt-0",
    h5: "mt-2 mb-1 text-sm font-medium first:mt-0",
    h6: "mt-2 mb-1 text-xs font-medium text-cork-muted first:mt-0",
  },
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
  text: {
    bold: "font-semibold",
    code: "rounded bg-cork-bg/60 px-1 py-0.5 font-mono text-[0.85em]",
    italic: "italic",
    strikethrough: "line-through",
  },
};

// Registered once; the default Markdown TRANSFORMERS require exactly these.
const NODES = [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode];

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

export function MarkdownEditor({
  initialValue,
  onChange,
  onOpenLink,
  onBlur,
  placeholder,
  ariaLabel,
  className,
}: MarkdownEditorProps) {
  const handleChange = useCallback(
    (editorState: EditorState) => {
      onChange(editorState.read(() => $convertToMarkdownString(TRANSFORMERS)));
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
    editorState: () => $convertFromMarkdownString(initialValue, TRANSFORMERS),
    onError: (error: Error) => {
      throw error;
    },
  };

  return (
    <div className={clsx("relative flex flex-col", className)}>
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              ariaLabel={ariaLabel}
              onBlur={onBlur}
              className="border-cork-border/40 bg-cork-elevated/60 text-cork-text min-h-0 flex-1 overflow-y-auto rounded-lg border px-3 py-1.5 text-sm break-words whitespace-pre-wrap"
            />
          }
          placeholder={
            placeholder == null ? null : (
              <div className="text-cork-muted/50 pointer-events-none absolute top-1.5 left-3 select-none">
                {placeholder}
              </div>
            )
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        {/* Registers the empty-list-item Enter handler so lists can be exited,
            plus the list insert/remove commands. */}
        <ListPlugin />
        {/* Tab/Shift+Tab indent within lists; code-block escape via
            Shift+Enter and the boundary arrow keys; click-to-open for links. */}
        <ListTabIndentationPlugin />
        <CodeBlockEscapePlugin />
        <LinkOpenPlugin onOpenLink={onOpenLink} />
        {/* ignoreSelectionChange: only real content edits emit — a bare
            focus/cursor move must NOT serialize, or a no-edit open/close of a
            non-canonical body would auto-save a normalized rewrite. */}
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
      </LexicalComposer>
    </div>
  );
}
