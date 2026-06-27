import { describe, expect, test } from "vitest";

import { renderTestEditor } from "./__tests__/utils";

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
