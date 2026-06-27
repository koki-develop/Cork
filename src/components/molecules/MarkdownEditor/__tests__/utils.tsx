import { createHeadlessEditor } from "@lexical/headless";
import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
} from "lexical";
import { type ReactNode } from "react";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";

import { buildInitialConfig, NODES } from "../MarkdownEditor";
import { MARKDOWN_TRANSFORMERS } from "../transformers";

// Headless editor for pure-helper and transformer round-trip tests — no DOM
// mount, no React, runs entirely in JS. `onError` throws so silent Lexical
// errors surface as test failures.
export function createTestHeadlessEditor(): LexicalEditor {
  return createHeadlessEditor({
    nodes: NODES,
    onError: (error) => {
      throw error;
    },
  });
}

// `discrete: true` flushes the update synchronously, so the subsequent
// `$readMarkdown` sees the committed state without a microtask hop.
export function $setMarkdown(editor: LexicalEditor, markdown: string): void {
  editor.update(
    () => {
      $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS);
    },
    { discrete: true },
  );
}

export function $readMarkdown(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS));
}

type RenderTestEditorOptions = {
  plugins?: ReactNode;
};

type RenderTestEditorResult = {
  editor: LexicalEditor;
  screen: Awaited<ReturnType<typeof render>>;
  user: typeof userEvent;
};

// LexicalComposer builds the editor inside `useMemo` BEFORE rendering children
// (`@lexical/react/LexicalComposer.tsx:87-115`), so `useLexicalComposerContext`
// returns a usable editor on the first render — capturing during render is
// safe and avoids an unnecessary `useEffect` hop.
function EditorCapture({ onCapture }: { onCapture: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  onCapture(editor);
  return null;
}

// Mounts a `LexicalComposer` configured exactly like the production
// `MarkdownEditor` (shared `buildInitialConfig`), rendered into the Playwright
// Chromium page via `vitest-browser-react`'s async `render`. Always wires the
// `RichTextPlugin` + `HistoryPlugin` minimum; `options.plugins` adds whatever
// else the test asserts on so each spec opts in to only the surface it cares
// about. The empty `""` initial value lets the test seed state via
// `$setMarkdown` after mount when it needs specific content.
export async function renderTestEditor(
  options?: RenderTestEditorOptions,
): Promise<RenderTestEditorResult> {
  let captured: LexicalEditor | undefined;

  const screen = await render(
    <LexicalComposer initialConfig={buildInitialConfig("")}>
      <EditorCapture
        onCapture={(editor) => {
          captured = editor;
        }}
      />
      <RichTextPlugin
        contentEditable={<ContentEditable />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      {options?.plugins}
    </LexicalComposer>,
  );

  return { editor: captured!, screen, user: userEvent };
}

// `editor.dispatchCommand(KEY_*_COMMAND, mockEvent)` is the testable entry
// point for any plugin whose contract is "respond to a specific key press"
// (per spec `markdown-editor-testing` requirement). The native `KeyboardEvent`
// constructor is available in Vitest browser mode; we build it with the
// requested key + modifiers so plugins that read `event.shiftKey` etc. behave
// identically to a real keystroke.
//
// The dispatch is wrapped in `editor.update({discrete: true})` deliberately:
// `triggerCommandListeners` runs each priority tier inside `updateEditorSync`,
// which — when called from OUTSIDE any active update — kicks off a non-discrete
// `$beginUpdate`. That schedules its commit via `scheduleMicroTask` rather
// than flushing synchronously (`packages/lexical/src/LexicalUpdates.ts:$beginUpdate`
// → line `scheduleMicroTask(() => $commitPendingUpdates(editor))`). The test's
// follow-up `editor.getEditorState()` then returns the PRE-mutation
// `_editorState` even though the listener already wrote the new state into
// `_pendingEditorState`. In production this never bites because the keyboard
// event arrives via Lexical's `onKeyDown` handler, which is already inside a
// discrete update; in standalone tests we have to reconstruct that context.
const KEY_COMMANDS = {
  Backspace: KEY_BACKSPACE_COMMAND,
  Enter: KEY_ENTER_COMMAND,
  Tab: KEY_TAB_COMMAND,
  ArrowUp: KEY_ARROW_UP_COMMAND,
  ArrowDown: KEY_ARROW_DOWN_COMMAND,
  ArrowLeft: KEY_ARROW_LEFT_COMMAND,
  ArrowRight: KEY_ARROW_RIGHT_COMMAND,
} as const satisfies Record<string, LexicalCommand<KeyboardEvent | null>>;

export function dispatchKeyDown(
  editor: LexicalEditor,
  key: keyof typeof KEY_COMMANDS,
  modifiers?: Pick<KeyboardEventInit, "shiftKey" | "ctrlKey" | "altKey" | "metaKey">,
): boolean {
  const command = KEY_COMMANDS[key];
  const event = new KeyboardEvent("keydown", { key, ...modifiers });
  let handled = false;
  editor.update(
    () => {
      handled = editor.dispatchCommand(command, event);
    },
    { discrete: true },
  );
  return handled;
}
