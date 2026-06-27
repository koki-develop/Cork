import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { describe, expect, test } from "vitest";

import { renderTestEditor } from "./__tests__/utils";
import { MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS } from "./transformers";

describe("Markdown shortcuts (live typing)", () => {
  test("`# ` at the start of a paragraph renders the line as <h1>", async () => {
    const { screen, user } = await renderTestEditor({
      plugins: <MarkdownShortcutPlugin transformers={MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS} />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);
    await user.keyboard("# Hello");

    await expect.element(textbox.getByRole("heading", { level: 1 })).toBeVisible();
    const editorRoot = textbox.element();
    expect(editorRoot.children).toHaveLength(1);
    const heading = editorRoot.firstElementChild;
    expect(heading?.tagName).toBe("H1");
    expect(heading?.textContent).toBe("Hello");
  });
});
