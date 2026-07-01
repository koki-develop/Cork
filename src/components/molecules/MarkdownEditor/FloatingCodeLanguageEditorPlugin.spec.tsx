import { describe, expect, test } from "vitest";

import { renderTestEditor } from "./__tests__/utils";
import { FloatingCodeLanguageEditorPlugin } from "./FloatingCodeLanguageEditorPlugin";

describe("FloatingCodeLanguageEditorPlugin", () => {
  test("clicking the tab opens a panel pre-filled with the current friendly name", async () => {
    const { screen, user } = await renderTestEditor({
      initialValue: "```js\nconsole.log\n```",
      plugins: <FloatingCodeLanguageEditorPlugin />,
    });

    await user.click(screen.getByRole("button", { name: "Edit code block language" }));

    const input = screen.getByRole("textbox", { name: "Code block language" });
    await expect.element(input).toHaveValue("JavaScript");
  });

  // A language near the END of the alphabetical list (e.g. "xml") used to
  // open with the list scrolled to the top — the actual selection sat below
  // the fold until the user scrolled down to find it. The panel must center
  // on the current selection in its very first visible frame.
  test("opening the panel scrolls the current language into view immediately", async () => {
    const { screen, user } = await renderTestEditor({
      initialValue: "```xml\n<a/>\n```",
      plugins: <FloatingCodeLanguageEditorPlugin />,
    });

    await user.click(screen.getByRole("button", { name: "Edit code block language" }));
    const input = screen.getByRole("textbox", { name: "Code block language" });
    await expect.element(input).toHaveValue("XML");

    const list = screen.getByRole("listbox").element();
    const selected = list.querySelector('[role="option"][aria-selected="true"]');
    expect(selected?.textContent).toContain("XML");

    const listRect = list.getBoundingClientRect();
    const rowRect = selected!.getBoundingClientRect();
    expect(rowRect.top).toBeGreaterThanOrEqual(listRect.top - 1);
    expect(rowRect.bottom).toBeLessThanOrEqual(listRect.bottom + 1);
  });

  // Selecting a suggestion from the list commits its canonical identifier
  // (not the friendly label) and re-renders the chip + <code>'s
  // `data-language` to match — the "friendly label shown, `js`-like
  // identifier saved" half of the task spec.
  test("clicking a suggestion changes the language and updates the chip + <code>", async () => {
    const { screen, user } = await renderTestEditor({
      initialValue: "```js\nconsole.log\n```",
      plugins: <FloatingCodeLanguageEditorPlugin />,
    });

    await user.click(screen.getByRole("button", { name: "Edit code block language" }));
    const input = screen.getByRole("textbox", { name: "Code block language" });
    await expect.element(input).toHaveFocus();

    await user.keyboard("Python");
    await expect.element(input).toHaveValue("Python");
    await user.click(screen.getByRole("option", { name: /Python/ }));

    await expect
      .element(
        document.querySelector<HTMLElement>(".cork-code-block-wrapper .cork-code-block-language"),
      )
      .toHaveTextContent("Python");
    const code = document.querySelector("code");
    expect(code?.getAttribute("data-language")).toBe("py");
  });

  // Free text that doesn't match any known language stays verbatim (in the
  // user's exact casing) — fenced code blocks accept arbitrary info strings,
  // and this is the escape hatch for a language Cork has no friendly name for.
  test("typing an unrecognized language and pressing Enter commits it verbatim", async () => {
    const { screen, user } = await renderTestEditor({
      initialValue: "```js\nconsole.log\n```",
      plugins: <FloatingCodeLanguageEditorPlugin />,
    });

    await user.click(screen.getByRole("button", { name: "Edit code block language" }));
    const input = screen.getByRole("textbox", { name: "Code block language" });
    await expect.element(input).toHaveFocus();

    await user.keyboard("Kotlin{Enter}");

    await expect
      .element(
        document.querySelector<HTMLElement>(".cork-code-block-wrapper .cork-code-block-language"),
      )
      .toHaveTextContent("Kotlin");
    const code = document.querySelector("code");
    expect(code?.getAttribute("data-language")).toBe("Kotlin");
  });

  // `CODE_LANGUAGE_MAP` (the alias table) is a plain object, so a naive
  // `map[typedText]` lookup would resolve `Object.prototype` members
  // (`constructor`, `toString`, `hasOwnProperty`, ...) to a built-in function
  // instead of falling through to "keep the typed text verbatim" — silently
  // corrupting the saved fence language. This must resolve to the literal
  // typed string, exactly like any other unrecognized language.
  test("typing an Object.prototype property name commits it verbatim, not a built-in", async () => {
    const { screen, user } = await renderTestEditor({
      initialValue: "```js\nconsole.log\n```",
      plugins: <FloatingCodeLanguageEditorPlugin />,
    });

    await user.click(screen.getByRole("button", { name: "Edit code block language" }));
    const input = screen.getByRole("textbox", { name: "Code block language" });
    await expect.element(input).toHaveFocus();

    await user.keyboard("constructor{Enter}");

    await expect
      .element(
        document.querySelector<HTMLElement>(".cork-code-block-wrapper .cork-code-block-language"),
      )
      .toHaveTextContent("constructor");
    const code = document.querySelector("code");
    expect(code?.getAttribute("data-language")).toBe("constructor");
  });

  // A fence written with a non-canonical alias (`python` rather than the
  // canonical `py`) must NOT get silently rewritten just because the panel
  // was opened and confirmed with no actual edit — that would dirty the
  // document (and autosave) on a pure no-op interaction.
  test("confirming without editing an alias-typed fence leaves the stored language untouched", async () => {
    const { screen, user } = await renderTestEditor({
      initialValue: "```python\nprint(1)\n```",
      plugins: <FloatingCodeLanguageEditorPlugin />,
    });

    await user.click(screen.getByRole("button", { name: "Edit code block language" }));
    const input = screen.getByRole("textbox", { name: "Code block language" });
    await expect.element(input).toHaveFocus();

    await user.keyboard("{Enter}");

    // Give the (would-be) update a chance to land before asserting it didn't.
    await expect.element(input).not.toBeInTheDocument();
    const code = document.querySelector("code");
    expect(code?.getAttribute("data-language")).toBe("python");
  });

  // Clearing the input and confirming removes the language entirely — the
  // fence goes back to a bare ``` with no info string, distinct from
  // explicitly picking "Plain Text" (which still writes `plain`).
  test("clearing the input and pressing Enter removes the language", async () => {
    const { screen, user } = await renderTestEditor({
      initialValue: "```js\nconsole.log\n```",
      plugins: <FloatingCodeLanguageEditorPlugin />,
    });

    await user.click(screen.getByRole("button", { name: "Edit code block language" }));
    const input = screen.getByRole("textbox", { name: "Code block language" });
    await expect.element(input).toHaveFocus();

    // The panel pre-selects the whole friendly name on open (see the plugin's
    // focus effect), so a single Backspace clears it without needing an
    // explicit select-all — which conveniently sidesteps Ctrl+A/Cmd+A's
    // platform-dependent binding (Home-on-Mac vs select-all elsewhere).
    await user.keyboard("{Backspace}{Enter}");

    await expect
      .element(
        document.querySelector<HTMLElement>(".cork-code-block-wrapper .cork-code-block-language"),
      )
      .toHaveTextContent("Plain Text");
    const code = document.querySelector("code");
    expect(code?.hasAttribute("data-language")).toBe(false);
  });

  // Escape discards the in-progress edit — the language must be unchanged
  // after reopening.
  test("Escape cancels without changing the language", async () => {
    const { screen, user } = await renderTestEditor({
      initialValue: "```js\nconsole.log\n```",
      plugins: <FloatingCodeLanguageEditorPlugin />,
    });

    await user.click(screen.getByRole("button", { name: "Edit code block language" }));
    const input = screen.getByRole("textbox", { name: "Code block language" });
    await expect.element(input).toHaveFocus();

    await user.keyboard("Kotlin{Escape}");

    await expect.element(input).not.toBeInTheDocument();
    const chip = document.querySelector<HTMLElement>(
      ".cork-code-block-wrapper .cork-code-block-language",
    );
    expect(chip?.textContent).toBe("JavaScript");
  });

  // Clicking away from the panel discards whatever was typed — only an
  // explicit confirmation (Enter or a row click) may change the language.
  // A stray click elsewhere (e.g. to dismiss the panel, or on something else
  // entirely) must never silently commit a half-typed value.
  test("clicking outside the panel discards the typed value without committing", async () => {
    const { screen, user } = await renderTestEditor({
      initialValue: "```js\nconsole.log\n```",
      plugins: <FloatingCodeLanguageEditorPlugin />,
    });

    await user.click(screen.getByRole("button", { name: "Edit code block language" }));
    const input = screen.getByRole("textbox", { name: "Code block language" });
    await expect.element(input).toHaveFocus();

    await user.keyboard("rust");
    await user.click(document.body);

    await expect.element(input).not.toBeInTheDocument();
    const chip = document.querySelector<HTMLElement>(
      ".cork-code-block-wrapper .cork-code-block-language",
    );
    expect(chip?.textContent).toBe("JavaScript");
    const code = document.querySelector("code");
    expect(code?.getAttribute("data-language")).toBe("js");
  });

  // Clicking a different code block's tab while one panel is open is the
  // same "clicking outside" gesture — the first block's typed-but-unconfirmed
  // edit must be discarded, not committed, before the second panel opens.
  test("clicking a different code block's tab discards the first panel's typed value", async () => {
    const { screen, user } = await renderTestEditor({
      initialValue: "```js\nconsole.log\n```\n\n```py\nprint(1)\n```",
      plugins: <FloatingCodeLanguageEditorPlugin />,
    });

    const [firstTab, secondTab] = screen
      .getByRole("button", { name: "Edit code block language" })
      .elements();

    await user.click(firstTab);
    const input = screen.getByRole("textbox", { name: "Code block language" });
    await expect.element(input).toHaveFocus();
    await user.keyboard("rust");

    // Switching discards the first panel and opens a second one (pre-filled
    // with the SECOND block's own language) — not "no panel at all" — so
    // assert on the first block's chip, not on the input's presence.
    await user.click(secondTab);
    await expect.element(input).toHaveValue("Python");

    const chips = document.querySelectorAll(".cork-code-block-wrapper .cork-code-block-language");
    expect(chips[0].textContent).toBe("JavaScript");
  });

  // Arrow-key navigation must keep the highlighted row on screen — the full
  // unfiltered list (17 languages) overflows the panel's max-height, so
  // moving the selection down without scrolling would highlight a row the
  // user can't see.
  test("ArrowDown repeatedly scrolls the highlighted row into view", async () => {
    const { screen, user } = await renderTestEditor({
      initialValue: "```js\nconsole.log\n```",
      plugins: <FloatingCodeLanguageEditorPlugin />,
    });

    await user.click(screen.getByRole("button", { name: "Edit code block language" }));
    const input = screen.getByRole("textbox", { name: "Code block language" });
    await expect.element(input).toHaveFocus();

    // Alphabetically: C, C++, C-like, CSS, HTML, Java, JavaScript (current,
    // index 6), Markdown, Objective-C, Plain Text, PowerShell, Python, Rust,
    // SQL, Swift, TypeScript, XML (index 16) — 10 presses reaches the last row.
    for (let i = 0; i < 10; i++) {
      await user.keyboard("{ArrowDown}");
    }

    const list = screen.getByRole("listbox").element();
    const selected = list.querySelector('[role="option"][aria-selected="true"]');
    expect(selected?.textContent).toContain("XML");

    const listRect = list.getBoundingClientRect();
    const rowRect = selected!.getBoundingClientRect();
    expect(rowRect.top).toBeGreaterThanOrEqual(listRect.top - 1);
    expect(rowRect.bottom).toBeLessThanOrEqual(listRect.bottom + 1);
  });

  // Chromium re-runs hit-testing (and fires `mouseover`/`mouseenter`)
  // whenever the DOM under an UNMOVED cursor changes — which the ArrowDown
  // scroll above does constantly — so without this guard, a purely
  // keyboard-driven move would visibly get overridden by whatever row the
  // stationary mouse now happens to sit over, on the VERY FIRST such event
  // (there's no "last hover position" recorded yet to compare against right
  // after opening). Simulated directly via `dispatchEvent` (rather than
  // relying on a real scroll to organically trigger the browser's own
  // phantom event) so the assertion doesn't depend on engine-specific
  // hit-testing/scroll timing.
  test("a mouseover right after keyboard nav does not steal the highlight, until the mouse really moves", async () => {
    const { screen, user } = await renderTestEditor({
      initialValue: "```js\nconsole.log\n```",
      plugins: <FloatingCodeLanguageEditorPlugin />,
    });

    await user.click(screen.getByRole("button", { name: "Edit code block language" }));
    const input = screen.getByRole("textbox", { name: "Code block language" });
    await expect.element(input).toHaveFocus();

    const options = screen
      .getByRole("listbox")
      .element()
      .querySelectorAll<HTMLElement>('[role="option"]');

    // Opening pre-selects "JavaScript" (index 6, matching the current
    // language); keyboard moves it without ever touching the mouse — no real
    // hover has happened yet in this test, so there's nothing to compare a
    // position against; the fix must not depend on a prior baseline.
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await expect.element(options[8]).toHaveAttribute("aria-selected", "true");

    // Phantom `mouseover` (the DOM shifted under a stationary cursor) right
    // after the keyboard move — must be ignored on this very first
    // occurrence too.
    options[0].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await expect.element(options[8]).toHaveAttribute("aria-selected", "true");
    expect(options[0].getAttribute("aria-selected")).toBe("false");

    // Only once the mouse genuinely moves does hover-driven selection resume.
    window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    options[4].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await expect.element(options[4]).toHaveAttribute("aria-selected", "true");
  });
});
