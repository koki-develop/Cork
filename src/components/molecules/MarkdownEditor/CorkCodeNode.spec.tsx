import { $createCodeNode } from "@lexical/code";
import { Copy } from "lucide-react";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";

import { createTestHeadlessEditor, renderTestEditor } from "./__tests__/utils";
import { $createCopyIcon, CorkCodeNode } from "./CorkCodeNode";

describe("CorkCodeNode (language chip)", () => {
  // ```js fence → wrapper <div> contains a <button> tab (the tab IS the
  // click target — no separate pencil icon) holding a language <span>
  // showing the friendly `JavaScript` name, and the inner <code> holding
  // the text.
  test("` ```js ` renders a wrapper with a `JavaScript` tab and inner <code>", async () => {
    const { screen } = await renderTestEditor({
      initialValue: "```js\nconsole.log\n```",
    });

    const textbox = screen.getByRole("textbox");
    const wrapper = textbox.element().querySelector(".cork-code-block-wrapper");
    expect(wrapper).not.toBeNull();

    const tab = wrapper?.querySelector("button.cork-code-block-tab");
    expect(tab).not.toBeNull();
    expect(tab?.getAttribute("aria-label")).toBe("Edit code block language");

    const chip = tab?.querySelector(".cork-code-block-language");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe("JavaScript");

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

  // `cs` is a shorthand Prism itself dual-registers as a second
  // `Prism.languages` key pointing at the same `csharp` grammar object (so
  // highlighting already worked before this test existed) — but
  // `getCorkLanguageFriendlyName` resolves through `prismLanguages.ts`'s own
  // `CORK_LANGUAGE_ALIAS_BY_ID`, which never touches `Prism.languages`.
  // Without a `cs` → `csharp` entry there, the chip would show the raw "cs"
  // instead of "C#" even though the block highlights correctly underneath.
  test("` ```cs ` shows the `C#` chip via Cork's own alias table", async () => {
    const { screen } = await renderTestEditor({
      initialValue: "```cs\nConsole.WriteLine\n```",
    });

    const textbox = screen.getByRole("textbox");
    const chip = textbox.element().querySelector(".cork-code-block-language");
    expect(chip?.textContent).toBe("C#");
  });

  // `zig` is in neither `prismLanguages.ts`'s alias/friendly-name tables nor
  // upstream's, so `getCorkLanguageFriendlyName` returns the raw fence
  // string. The chip displays the user-typed identifier verbatim per the
  // task spec.
  test("` ```zig ` shows the raw fence string `zig` (unbundled language)", async () => {
    const { screen } = await renderTestEditor({
      initialValue: "```zig\nstd.debug.print\n```",
    });

    const textbox = screen.getByRole("textbox");
    const chip = textbox.element().querySelector(".cork-code-block-language");
    expect(chip?.textContent).toBe("zig");
  });

  // Upstream `@lexical/code`'s `getLanguageFriendlyName` does an unguarded
  // `CODE_LANGUAGE_MAP[lang]` lookup against a plain object, so a fence
  // language that happens to match an `Object.prototype` property name
  // resolves to a built-in function instead of falling through to the raw
  // string — and assigning that function to `textContent` would coerce it to
  // its source text. This isn't reachable by typing through
  // `FloatingCodeLanguageEditorPlugin` alone (that combobox has its own
  // guard), but any fence loaded straight from a file must still render its
  // language verbatim, not a coerced-function-source garbage string.
  test("a fence language colliding with an Object.prototype property name renders verbatim", async () => {
    const { screen } = await renderTestEditor({
      initialValue: "```constructor\nfoo\n```",
    });

    const textbox = screen.getByRole("textbox");
    const chip = textbox.element().querySelector(".cork-code-block-language");
    expect(chip?.textContent).toBe("constructor");
  });

  // No info string after the opening fence → CodeNode's `__language` is
  // `undefined` → the chip falls back to "Plain Text" rather than being
  // hidden — the tab is always visible so it always has something clickable
  // to sit in, and so a fence with no language can still be given one.
  test("` ``` ` with no info string shows the `Plain Text` fallback label", async () => {
    const { screen } = await renderTestEditor({
      initialValue: "```\nplain text\n```",
    });

    const textbox = screen.getByRole("textbox");
    const wrapper = textbox.element().querySelector(".cork-code-block-wrapper");
    expect(wrapper).not.toBeNull();

    const tab = wrapper?.querySelector("button.cork-code-block-tab");
    expect(tab).not.toBeNull();

    const chip = wrapper?.querySelector(".cork-code-block-language");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe("Plain Text");
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

        // The tab exports as a plain <div>, not the live editor's <button> —
        // a pasted, functionless button would just be confusing chrome in
        // whatever app it lands in.
        expect(element.querySelector("button")).toBeNull();
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
        // Tab + <pre> only — the appended child did not land as a third
        // direct child of the wrapper.
        expect(element.children).toHaveLength(2);
      },
      { discrete: true },
    );
  });

  test("exportDOM shows the `Plain Text` fallback when no language is set", () => {
    const editor = createTestHeadlessEditor();

    editor.update(
      () => {
        const codeNode = $createCodeNode();
        const { element } = codeNode.exportDOM(editor);
        if (!(element instanceof HTMLElement)) {
          throw new Error("expected exportDOM to return an HTMLElement");
        }
        const chip = element.querySelector(".cork-code-block-language");
        expect(chip?.textContent).toBe("Plain Text");
        expect(element.querySelector("pre")).not.toBeNull();
      },
      { discrete: true },
    );
  });
});

// `$createCopyIcon` hand-transcribes `lucide-react`'s `Copy` icon into raw DOM
// (createDOM runs outside React, so the real component isn't directly usable
// there) — this pins that transcription against the ACTUAL rendered output of
// the real `lucide-react` `Copy` component, so a future `lucide-react` upgrade
// that redraws the icon (changes the rect/path data) fails this test instead
// of silently drifting the button's shape out of sync with every other
// lucide-react icon in the app.
describe("CorkCodeNode (copy icon fidelity)", () => {
  test("$createCopyIcon's markup matches lucide-react's real Copy icon", async () => {
    await render(<Copy />);
    // `render` mounts into `document.body` (cleaned up between tests by
    // `vitest-browser-react`'s own afterEach) — no other test in this file
    // renders a bare `lucide-react` icon directly, so this is unambiguous.
    const reference = document.querySelector("svg.lucide-copy");
    if (!(reference instanceof SVGSVGElement)) {
      throw new Error("expected lucide-react's Copy icon to render an <svg>");
    }

    const built = $createCopyIcon();

    expect(built.getAttribute("viewBox")).toBe(reference.getAttribute("viewBox"));

    const referenceChildren = Array.from(reference.children);
    const builtChildren = Array.from(built.children);
    expect(builtChildren).toHaveLength(referenceChildren.length);

    // Only the geometry-defining attributes are compared — `class`,
    // `aria-hidden`, and sizing (`width`/`height`, controlled by this app's
    // own CSS rather than SVG attributes) are deliberate, cosmetic
    // differences from the raw component output, not drift risks. `d` (path)
    // and `width`/`height`/`x`/`y`/`rx`/`ry` (rect) are exactly what a
    // lucide-react redraw would change.
    const GEOMETRY_ATTRS = ["d", "x", "y", "width", "height", "rx", "ry"];
    for (const [i, referenceChild] of referenceChildren.entries()) {
      const builtChild = builtChildren[i];
      expect(builtChild.tagName).toBe(referenceChild.tagName);
      for (const attr of GEOMETRY_ATTRS) {
        if (!referenceChild.hasAttribute(attr)) continue;
        expect(builtChild.getAttribute(attr)).toBe(referenceChild.getAttribute(attr));
      }
    }
  });
});
