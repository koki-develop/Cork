import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { fencedCodeBlock, renderTestEditor } from "./__tests__/utils";
import { CodeBlockCopyPlugin } from "./CodeBlockCopyPlugin";

describe("CodeBlockCopyPlugin", () => {
  let writeText: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  });

  afterEach(() => {
    writeText.mockRestore();
  });

  // The button sits INSIDE the code well itself (its `.cork-code-block-code-area`
  // container, alongside `<code>`) — not in a header row above it like the
  // language tab, per the task spec ("inside the dark background, not
  // outside it"). It must NOT be nested inside the tab (buttons can't nest)
  // and the wrapper's other direct child must still be the tab itself.
  test("renders a copy button inside the code well, alongside <code>", async () => {
    const { screen } = await renderTestEditor({
      initialValue: "```js\nconsole.log(1)\n```",
      plugins: <CodeBlockCopyPlugin />,
    });

    const textbox = screen.getByRole("textbox");
    const wrapper = textbox.element().querySelector(".cork-code-block-wrapper");
    expect(wrapper).not.toBeNull();

    const codeArea = wrapper?.querySelector(".cork-code-block-code-area");
    expect(codeArea).not.toBeNull();

    const button = codeArea?.querySelector("button.cork-code-block-copy");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Copy code block");
    expect(codeArea?.querySelector("code")).not.toBeNull();

    // The tab is a separate direct child of the wrapper, not nested with the
    // copy button inside the code area.
    expect(wrapper?.querySelector(":scope > button.cork-code-block-tab")).not.toBeNull();
    expect(codeArea?.querySelector("button.cork-code-block-tab")).toBeNull();
  });

  // The regression this plugin exists to avoid: reading `Element.textContent`
  // instead of `codeNode.getTextContent()` would silently squash every line
  // together, since `<br>` (LineBreakNode's rendered element) contributes no
  // "\n" to `textContent`. A multi-line block must copy with real newlines.
  test("clicking the button copies the block's exact multi-line source", async () => {
    const source = fencedCodeBlock("js", 3);
    const expectedCode = source.split("\n").slice(1, -1).join("\n");

    const { screen, user } = await renderTestEditor({
      initialValue: source,
      plugins: <CodeBlockCopyPlugin />,
    });

    await user.click(screen.getByRole("button", { name: "Copy code block" }));

    expect(writeText).toHaveBeenCalledExactlyOnceWith(expectedCode);
  });

  // A doc with more than one code block: clicking one block's button must
  // never copy a different block's text — confirms the click delegation
  // resolves the CLICKED button's own nearest CodeNode, not e.g. the first
  // code block in the document.
  test("clicking a specific block's button copies only that block's text", async () => {
    const { screen, user } = await renderTestEditor({
      initialValue: "```js\nfirst\n```\n\n```py\nsecond\n```",
      plugins: <CodeBlockCopyPlugin />,
    });

    const buttons = screen.getByRole("button", { name: "Copy code block" });
    await user.click(buttons.nth(1));

    expect(writeText).toHaveBeenCalledExactlyOnceWith("second");
  });
});
