import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type PointType,
} from "lexical";
import { describe, expect, test } from "vitest";

import { createTestHeadlessEditor } from "./__tests__/utils";
import { $importMarkdownInto } from "./transformers";

// `$importMarkdownInto` exists for one reason: `@lexical/markdown`'s importer
// ends with an unconditional `root.selectStart()` on the node it was handed,
// and `ElementNode.select()` / `TextNode.select()` MUTATE the live
// `RangeSelection` in place rather than allocating a new one. Importing into
// a detached node therefore used to drag the caller's caret into that
// detached subtree — and, because the mutation happened to the very object
// the caller was holding, "capture the selection, restore it afterwards" was
// a no-op. The next insert ran against a parentless block and threw.
//
// So the contract worth pinning is not "the caret ends up somewhere sane" but
// "the caret is bit-for-bit what it was, on the same object". Asserting
// identity as well as position is deliberate: a future implementation that
// restores a *clone* would still pass a position-only check while quietly
// breaking every caller that kept a reference across the call (which is
// exactly what `MarkdownPastePlugin` does).
function describePoint(point: PointType): string {
  return `${point.type}:${point.key}@${point.offset}`;
}

// The payloads split into two classes that used to behave differently, and
// the difference was invisible from the outside — which is how the bug
// survived a spec file that only ever exercised the safe class:
//
//   - block payloads (`# `, `> `, `- `, `---`, a table) run an element
//     transformer whose `replace()` clones the live selection and installs
//     the clone, so the caller's captured object was left alone by accident;
//   - everything else (a plain paragraph, a fenced code block via the
//     multiline transformer, a bare URL) never calls `replace()`, so the
//     caller's object WAS the live selection and got rewritten.
const PAYLOADS = [
  "hello world",
  "line one\nline two",
  "para one\n\npara two",
  "# Heading",
  "> quote",
  "- a\n- b",
  "- [ ] a\n- [x] b",
  "```ts\nconst a = 1;\n```",
  "---",
  // Drives `$createTableCell`, i.e. a SECOND markdown import nested inside
  // this one, into a cell that is itself still detached at that moment.
  "| a | b |\n| --- | --- |\n| 1 | 2 |",
  "https://example.com",
  "see https://example.com now",
];

describe("$importMarkdownInto (selection neutrality)", () => {
  for (const markdown of PAYLOADS) {
    test(`leaves the caret untouched while importing ${JSON.stringify(markdown)}`, () => {
      const editor = createTestHeadlessEditor();

      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          const paragraph = $createParagraphNode();
          paragraph.append($createTextNode("seed"));
          root.append(paragraph);
          paragraph.selectEnd();

          const before = $getSelection();
          if (!$isRangeSelection(before)) throw new Error("expected a RangeSelection");
          const beforeAnchor = describePoint(before.anchor);
          const beforeFocus = describePoint(before.focus);

          const scratch = $createParagraphNode();
          $importMarkdownInto(scratch, markdown, { preserveNewLines: true });
          expect(scratch.getChildrenSize()).toBeGreaterThan(0);

          const after = $getSelection();
          expect(after).toBe(before);
          if (!$isRangeSelection(after)) throw new Error("expected a RangeSelection");
          expect(describePoint(after.anchor)).toBe(beforeAnchor);
          expect(describePoint(after.focus)).toBe(beforeFocus);
        },
        { discrete: true },
      );
    });
  }

  // The mount path (`$seedMarkdownEditorState`) imports into the real root
  // with no selection yet, and must not conjure one — a stray caret there is
  // what used to focus the dialog mid-document and scroll it (see
  // `MarkdownEditor.spec.tsx`'s mount-time focus case). The library's
  // `selectStart()` is already skipped when the selection is null, and
  // nulling it for the duration of the parse must not change that.
  test("a document with no selection still has none after importing into the root", () => {
    const editor = createTestHeadlessEditor();

    editor.update(
      () => {
        $importMarkdownInto($getRoot(), "# Heading\n\nbody text", { preserveNewLines: true });
        expect($getSelection()).toBeNull();
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($getSelection()).toBeNull();
      // `preserveNewLines: true` keeps the blank line as its own empty
      // paragraph — the same shape the file-load path produces.
      expect(
        $getRoot()
          .getChildren()
          .map((node) => node.getType()),
      ).toEqual(["heading", "paragraph", "paragraph"]);
    });
  });
});
