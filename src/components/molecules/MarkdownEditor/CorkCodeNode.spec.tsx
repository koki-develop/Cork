import { $createCodeNode } from "@lexical/code";
import { describe, expect, test } from "vitest";

import { createTestHeadlessEditor, renderTestEditor } from "./__tests__/utils";
import { CorkCodeNode } from "./CorkCodeNode";

describe("CorkCodeNode (language chip)", () => {
  // ```js fence → wrapper <div> contains a language <span> showing the
  // friendly `JavaScript` name, plus the inner <code> holding the text.
  test("` ```js ` renders a wrapper with a `JavaScript` chip and inner <code>", async () => {
    const { screen } = await renderTestEditor({
      initialValue: "```js\nconsole.log\n```",
    });

    const textbox = screen.getByRole("textbox");
    const wrapper = textbox.element().querySelector(".cork-code-block-wrapper");
    expect(wrapper).not.toBeNull();

    const chip = wrapper?.querySelector(".cork-code-block-language");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe("JavaScript");
    expect(chip?.hasAttribute("hidden")).toBe(false);

    const code = wrapper?.querySelector("code");
    expect(code).not.toBeNull();
    expect(code?.getAttribute("data-language")).toBe("js");
    expect(code?.textContent).toContain("console.log");
  });

  // `javascript` normalizes to `js` via Lexical's CODE_LANGUAGE_MAP, then `js`
  // resolves to `JavaScript` via CODE_LANGUAGE_FRIENDLY_NAME_MAP. The chip
  // shows the same friendly name as ` ```js ` even though the on-disk fence
  // string differs.
  test("` ```javascript ` shows the same `JavaScript` chip via normalization", async () => {
    const { screen } = await renderTestEditor({
      initialValue: "```javascript\nconsole.log\n```",
    });

    const textbox = screen.getByRole("textbox");
    const chip = textbox.element().querySelector(".cork-code-block-language");
    expect(chip?.textContent).toBe("JavaScript");
  });

  // `go` is in neither CODE_LANGUAGE_MAP nor CODE_LANGUAGE_FRIENDLY_NAME_MAP,
  // so `getLanguageFriendlyName` returns the raw fence string. The chip
  // displays the user-typed identifier verbatim per the task spec.
  test("` ```go ` shows the raw fence string `go` (unbundled language)", async () => {
    const { screen } = await renderTestEditor({
      initialValue: "```go\nfmt.Println\n```",
    });

    const textbox = screen.getByRole("textbox");
    const chip = textbox.element().querySelector(".cork-code-block-language");
    expect(chip?.textContent).toBe("go");
  });

  // No info string after the opening fence → CodeNode's `__language` is
  // `undefined` → chip is rendered but `hidden`. We keep the chip in the DOM
  // (rather than removing it on each reconcile) so the wrapper's structure
  // is stable across reconciles, but `[hidden]` removes it from the
  // rendering tree per HTML semantics.
  test("` ``` ` with no info string keeps the chip element but `hidden`", async () => {
    const { screen } = await renderTestEditor({
      initialValue: "```\nplain text\n```",
    });

    const textbox = screen.getByRole("textbox");
    const wrapper = textbox.element().querySelector(".cork-code-block-wrapper");
    expect(wrapper).not.toBeNull();

    const chip = wrapper?.querySelector(".cork-code-block-language");
    expect(chip).not.toBeNull();
    expect(chip?.hasAttribute("hidden")).toBe(true);
    expect(chip?.textContent).toBe("");
  });
});

// `exportDOM` builds the `text/html` clipboard payload used when a code
// block is copied out of Cork into another app (Slack, Notion, a browser
// textarea, ...) — a separate path from `createDOM` (live editor rendering)
// and from same-app paste (which round-trips through the JSON clipboard
// format instead and never touches `exportDOM`). Before wrapping this to
// match `createDOM`'s shape, the exported `<pre>` carried neither the
// language chip's text nor the wrapper's margin, so both silently vanished
// on cross-app paste.
describe("CorkCodeNode (HTML export)", () => {
  test("exportDOM wraps the exported <pre> with the chip's friendly language name", () => {
    const editor = createTestHeadlessEditor();

    editor.update(
      () => {
        const codeNode = $createCodeNode("js");
        expect(codeNode).toBeInstanceOf(CorkCodeNode);

        const { element } = codeNode.exportDOM(editor);
        if (!(element instanceof HTMLElement)) {
          throw new Error("expected exportDOM to return an HTMLElement");
        }
        expect(element.className).toBe("cork-code-block-wrapper");

        const chip = element.querySelector(".cork-code-block-language");
        expect(chip?.textContent).toBe("JavaScript");

        const pre = element.querySelector("pre");
        expect(pre).not.toBeNull();
      },
      { discrete: true },
    );
  });

  test("exportDOM's `append` routes child DOM into the inner <pre>, not the wrapper", () => {
    const editor = createTestHeadlessEditor();

    editor.update(
      () => {
        const codeNode = $createCodeNode("js");
        if (!(codeNode instanceof CorkCodeNode)) {
          throw new Error("expected CorkCodeNode from the node-replacement config");
        }

        const { element, append } = codeNode.exportDOM(editor);
        if (!(element instanceof HTMLElement)) {
          throw new Error("expected exportDOM to return an HTMLElement");
        }
        const pre = element.querySelector("pre");
        if (pre == null) throw new Error("expected an inner <pre>");

        const marker = document.createElement("span");
        marker.textContent = "console.log";
        append?.(marker);

        expect(pre.contains(marker)).toBe(true);
        // Chip + <pre> only — the appended child did not land as a third
        // direct child of the wrapper.
        expect(element.children).toHaveLength(2);
      },
      { discrete: true },
    );
  });

  test("exportDOM omits the chip entirely when no language is set", () => {
    const editor = createTestHeadlessEditor();

    editor.update(
      () => {
        const codeNode = $createCodeNode();
        const { element } = codeNode.exportDOM(editor);
        if (!(element instanceof HTMLElement)) {
          throw new Error("expected exportDOM to return an HTMLElement");
        }
        expect(element.querySelector(".cork-code-block-language")).toBeNull();
        expect(element.querySelector("pre")).not.toBeNull();
      },
      { discrete: true },
    );
  });
});
