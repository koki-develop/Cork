import { $isQuoteNode } from "@lexical/rich-text";
import { $createParagraphNode, $getRoot, $isParagraphNode } from "lexical";
import { describe, expect, test } from "vitest";

import { renderTestEditor } from "./__tests__/utils";
import { QuoteNestingShortcutPlugin } from "./QuoteNestingShortcutPlugin";

describe("QuoteNestingShortcutPlugin (live typing)", () => {
  // Production "open `> aaa\n> > bbb`, hit Enter on `bbb` to exit one level,
  // then type `> ccc`" should merge `ccc` into the existing nested QuoteNode
  // — the on-disk shape (`> aaa\n> > bbb\n> > ccc`) round-trips as a single
  // inner QuoteNode with two paragraphs, so the live editor must converge to
  // the same tree. Without the previous-is-quote merge, the typed `> ccc`
  // would spawn a sibling QuoteNode adjacent to the existing one and the
  // user would see two separate quote blocks until the file is reopened.
  //
  // Before:
  //   > aaa
  //   > > bbb
  //   > |
  //
  // After typing `> ccc`:
  //   > aaa
  //   > > bbb
  //   > > ccc|
  test("typing `> ccc` on an outer-quote line below a nested quote merges into the nested quote", async () => {
    const { editor, screen, user } = await renderTestEditor({
      initialValue: "> aaa\n> > bbb",
      plugins: <QuoteNestingShortcutPlugin />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    // Append an empty trailing paragraph inside the outer QuoteNode and
    // place the cursor there — this is the state the user is in after
    // pressing Enter on `bbb` (exiting one level of nesting). Built manually
    // so the test isolates the plugin under test instead of relying on the
    // Enter-exit pipeline.
    editor.update(
      () => {
        const root = $getRoot();
        const outerQuote = root.getFirstChild();
        if (!$isQuoteNode(outerQuote)) throw new Error("expected QuoteNode at root[0]");
        const trailing = $createParagraphNode();
        outerQuote.append(trailing);
        trailing.selectStart();
      },
      { discrete: true },
    );

    await user.keyboard("> ccc");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const outerQuote = root.getFirstChild();
      if (!$isQuoteNode(outerQuote)) throw new Error("expected QuoteNode at root[0]");
      expect(outerQuote.getChildrenSize()).toBe(2);

      const leading = outerQuote.getChildAtIndex(0);
      if (!$isParagraphNode(leading)) throw new Error("expected ParagraphNode at outer[0]");
      expect(leading.getTextContent()).toBe("aaa");

      const innerQuote = outerQuote.getChildAtIndex(1);
      if (!$isQuoteNode(innerQuote)) throw new Error("expected nested QuoteNode at outer[1]");
      expect(innerQuote.getChildrenSize()).toBe(2);

      const bbb = innerQuote.getChildAtIndex(0);
      if (!$isParagraphNode(bbb)) throw new Error("expected ParagraphNode at inner[0]");
      expect(bbb.getTextContent()).toBe("bbb");

      const ccc = innerQuote.getChildAtIndex(1);
      if (!$isParagraphNode(ccc)) throw new Error("expected ParagraphNode at inner[1]");
      expect(ccc.getTextContent()).toBe("ccc");
    });
  });
});
