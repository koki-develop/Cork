import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";

import "@/style.css";

import { MarkdownEditor } from "./MarkdownEditor";

// Regression test for a real bug: the dialog stretches the field's outer
// grid cell to a fixed min-height (`min-h-[20rem]`), but the contentEditable
// itself only grows to fit its own short content — clicking the empty space
// between the last line and the field's visible bottom edge used to hit the
// scroll wrapper div and silently do nothing (no focus, no caret). This
// mounts the actual production `MarkdownEditor` (not the `renderTestEditor`
// harness, which doesn't reproduce the wrapper DOM — see `MarkdownEditor.spec.tsx`)
// with a short body inside the same fixed-height wrapper the real dialogs use.
describe("MarkdownEditor (click below content)", () => {
  test("clicking the empty space below the last line focuses the editor with the caret at the document end", async () => {
    await render(
      <MarkdownEditor
        initialValue="hello"
        onChange={() => {}}
        onOpenLink={() => {}}
        className="h-[20rem]"
      />,
    );

    const editable = document.querySelector('[contenteditable="true"]');
    if (editable == null) throw new Error("contentEditable not found");
    const wrapper = editable.parentElement;
    if (wrapper == null) throw new Error("scroll wrapper not found");

    // Sanity-check the bug's actual precondition: the wrapper is taller than
    // the content it holds, so there really is dead space below the text.
    expect(wrapper.getBoundingClientRect().height).toBeGreaterThan(
      editable.getBoundingClientRect().height,
    );

    expect(document.activeElement).not.toBe(editable);

    wrapper.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.activeElement).toBe(editable);
    const selection = document.getSelection();
    expect(selection?.isCollapsed).toBe(true);
    expect(selection?.anchorNode?.textContent).toBe("hello");
    expect(selection?.anchorOffset).toBe("hello".length);
  });

  test("a click that lands on the contentEditable itself (not the wrapper) is left alone", async () => {
    await render(
      <MarkdownEditor
        initialValue="hello"
        onChange={() => {}}
        onOpenLink={() => {}}
        className="h-[20rem]"
      />,
    );

    const editable = document.querySelector('[contenteditable="true"]');
    if (editable == null) throw new Error("contentEditable not found");

    editable.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // Nothing forces focus here — a real click on the contentEditable is
    // handled entirely by native browser behavior, so the plugin must not
    // double-handle it (its handler only reacts when `event.target` is the
    // wrapper itself).
    expect(document.activeElement).not.toBe(editable);
  });

  test("a body long enough to overflow the field leaves click-to-focus disabled, so a scrollbar interaction can't be mistaken for one", async () => {
    await render(
      <MarkdownEditor
        initialValue={Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n\n")}
        onChange={() => {}}
        onOpenLink={() => {}}
        className="h-[10rem]"
      />,
    );

    const editable = document.querySelector('[contenteditable="true"]');
    if (editable == null) throw new Error("contentEditable not found");
    const wrapper = editable.parentElement;
    if (wrapper == null) throw new Error("scroll wrapper not found");

    // Sanity-check the precondition this test cares about: the body actually
    // overflows, so a real scrollbar is showing (an overlay scrollbar isn't a
    // distinct DOM node and reserves no layout space of its own to click-test
    // against, so a click on it is indistinguishable, by target OR position,
    // from a click on the wrapper's dead space — see the plugin's comment).
    expect(wrapper.scrollHeight).toBeGreaterThan(wrapper.clientHeight);

    wrapper.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.activeElement).not.toBe(editable);
  });

  test("the scroll wrapper previews as a text cursor, matching its click-to-type behavior", async () => {
    await render(
      <MarkdownEditor
        initialValue="hello"
        onChange={() => {}}
        onOpenLink={() => {}}
        className="h-[20rem]"
      />,
    );

    const editable = document.querySelector('[contenteditable="true"]');
    if (editable == null) throw new Error("contentEditable not found");
    const wrapper = editable.parentElement;
    if (wrapper == null) throw new Error("scroll wrapper not found");

    expect(getComputedStyle(wrapper).cursor).toBe("text");
  });
});
