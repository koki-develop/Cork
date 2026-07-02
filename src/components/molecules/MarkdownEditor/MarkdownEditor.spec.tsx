import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import "@/style.css";

import { fencedCodeBlock, renderTestEditor } from "./__tests__/utils";
import { MarkdownEditor } from "./MarkdownEditor";

describe("MarkdownEditor (initial value)", () => {
  test("mounting with `# Hello` renders the line as <h1>", async () => {
    const { screen } = await renderTestEditor({ initialValue: "# Hello" });

    const textbox = screen.getByRole("textbox");
    await expect.element(textbox.getByRole("heading", { level: 1 })).toBeVisible();
    const editorRoot = textbox.element();
    expect(editorRoot.children).toHaveLength(1);
    const heading = editorRoot.firstElementChild;
    expect(heading?.tagName).toBe("H1");
    expect(heading?.textContent).toBe("Hello");
  });
});

// Regression test for a real bug: an element transformer (TABLE, and
// HORIZONTAL_RULE — both in `transformers.ts`) used to call a `.select*()`
// unconditionally on import, leaving a real Lexical selection somewhere in
// the document after a supposedly quiet mount. `CodeBlockHighlightPlugin`'s
// mount-time node-transform re-sweep then blindly reused that unrelated
// selection's offset against whichever code block it was re-tokenizing,
// silently focusing the editor and placing the caret inside a code block —
// which Lexical's own `scrollIntoViewIfNeeded` could then scroll to, opening
// the dialog mid-document instead of at the top. This renders the actual
// production `MarkdownEditor` (not the `renderTestEditor` harness, which
// doesn't reproduce the wrapper DOM) inside a height-clamped scroll
// container — the same shape a `Modal` panel provides — with a body
// containing both trigger shapes (a horizontal rule and fenced code blocks)
// to reproduce the original report and its horizontal-rule variant.
describe("MarkdownEditor (mount-time focus / scroll safety)", () => {
  test("mounting a long body with a horizontal rule and fenced code blocks does not focus the editable or scroll its container", async () => {
    await page.viewport(800, 400);

    const body = [
      "# Heading",
      "",
      "intro paragraph",
      "",
      fencedCodeBlock("ts", 30),
      "",
      "---",
      "",
      fencedCodeBlock("python", 30),
    ].join("\n");

    await render(
      <div style={{ height: "300px", overflowY: "auto" }} data-testid="scroll-container">
        <MarkdownEditor initialValue={body} onChange={() => {}} onOpenLink={() => {}} />
      </div>,
    );

    const editable = document.querySelector('[contenteditable="true"]');
    if (editable == null) throw new Error("contentEditable not found");

    // The direct parent must not be a flex container — the precondition
    // Lexical's own dev warning checks for.
    const parentDisplay =
      editable.parentElement && getComputedStyle(editable.parentElement).display;
    expect(parentDisplay).not.toBe("flex");
    expect(parentDisplay).not.toBe("inline-flex");

    // Nothing should have silently claimed native focus, and the scroll
    // container must stay at the top.
    expect(document.activeElement).not.toBe(editable);
    const scrollContainer = document.querySelector('[data-testid="scroll-container"]');
    expect(scrollContainer?.scrollTop ?? 0).toBe(0);
  });
});
