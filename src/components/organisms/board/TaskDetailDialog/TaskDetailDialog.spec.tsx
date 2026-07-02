import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import "@/style.css";

import { fencedCodeBlock } from "@/components/molecules/MarkdownEditor/__tests__/utils";
import type { StatusEntry, Task } from "@/types";

import { TaskDetailDialog } from "./TaskDetailDialog";

// A trailing table is load-bearing here, not incidental: the TABLE
// transformer used to call `.selectEnd()` unconditionally on import
// (`transformers.ts`), leaving a real (if irrelevant) Lexical selection
// after mount. `CodeBlockHighlightPlugin`'s node-transform re-sweep then
// blindly reused that selection's offset against whichever code block it
// was re-tokenizing, teleporting the caret into it. A body with no table
// never exercised this path.
const BODY = [
  "# Heading",
  "",
  "intro paragraph",
  "",
  fencedCodeBlock("ts"),
  "",
  fencedCodeBlock("json"),
  "",
  "| Language | Library |",
  "| --- | --- |",
  "| curl | — |",
].join("\n");

const task: Task = {
  id: "/fake/task.md",
  title: "A task with code blocks",
  status: "Todo",
  body: BODY,
  order: 0,
  tags: [],
  date: null,
};

const statuses: StatusEntry[] = [{ label: "Todo" }, { label: "Doing" }, { label: "Done" }];

// Regression test for a real bug: opening a task dialog whose body has a
// table AND fenced code blocks silently focused the body editor and placed
// the native caret inside one of the code blocks — Lexical's own
// `scrollIntoViewIfNeeded` then scrolled the dialog toward that caret, so it
// could open mid-document instead of at the top. Root cause (see
// `transformers.ts`'s TABLE transformer and `CodeBlockHighlightPlugin.ts`'s
// `$updateAndRetainSelection`): the table transformer used to call
// `.selectEnd()` unconditionally on import, leaving a real selection
// somewhere in the document after a quiet "open an existing file" mount;
// `CodeBlockHighlightPlugin`'s mount-time node-transform re-sweep then
// blindly reused that unrelated selection's offset against whichever code
// block it was re-tokenizing. The ancestor-flex check below guards a
// separate, real (if not the root-cause-here) Chrome/WebKit contenteditable
// focus quirk Lexical's own dev warning calls out; it's cheap to also assert
// and renders the real `Modal` + `TaskDetailDialog` pair rather than an
// isolated `MarkdownEditor`.
describe("TaskDetailDialog (mount-time focus safety)", () => {
  test("opening a dialog with fenced code blocks never focuses the body editor, and no ancestor of it is flex", async () => {
    await page.viewport(1400, 900);

    await render(
      <TaskDetailDialog
        isOpen={true}
        onClose={() => {}}
        task={task}
        statuses={statuses}
        availableTags={[]}
        onSaveTask={vi.fn().mockResolvedValue(undefined)}
        onDeleteTask={vi.fn().mockResolvedValue(undefined)}
        onOpenLink={() => {}}
      />,
    );

    const editable = document.querySelector('[contenteditable="true"]');
    if (editable == null) throw new Error("contentEditable not found");

    for (let el: Element | null = editable; el != null; el = el.parentElement) {
      const display = getComputedStyle(el).display;
      expect(display).not.toBe("flex");
      expect(display).not.toBe("inline-flex");
    }

    // Poll rather than a fixed sleep: Modal's ~200ms enter transition and any
    // mount-time effects (CodeBlockHighlightPlugin's node-transform sweep,
    // etc.) settle asynchronously. Polling passes as soon as they do instead
    // of a blind wait that's either wasted time or, under load, too short.
    await expect.poll(() => document.activeElement).not.toBe(editable);
    await expect.poll(() => window.getSelection()?.rangeCount ?? 0).toBe(0);

    const panel = document.querySelector<HTMLElement>('[role="dialog"] .overflow-y-auto');
    await expect.poll(() => panel?.scrollTop ?? 0).toBe(0);
  });
});
