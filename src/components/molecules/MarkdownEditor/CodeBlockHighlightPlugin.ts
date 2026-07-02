import {
  $isCodeHighlightNode,
  $isCodeNode,
  CodeHighlightNode,
  CodeNode,
  DEFAULT_CODE_LANGUAGE,
} from "@lexical/code";
import {
  PrismTokenizer,
  getCodeLanguages,
  normalizeCodeLanguage,
  type Tokenizer,
} from "@lexical/code-prism";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $isTabNode,
  $isTextNode,
  $nodesOfType,
  $onUpdate,
  type LexicalNode,
  type NodeKey,
  TextNode,
  mergeRegister,
} from "lexical";
import { useEffect } from "react";

// Why this plugin exists, in two parts:
//
// 1) We re-register the highlight transforms ourselves instead of calling
//    upstream's `registerCodeHighlighting`. Two reasons, both load-bearing:
//
//    a) Upstream's `$codeNodeTransform` early-returns when
//       `isCodeLanguageLoaded(language)` is false
//       (`@lexical/code-prism/src/CodeHighlighterPrism.ts:149-155`). That
//       means for a fenced ``` block whose info string isn't in the
//       bundled grammar set (e.g. `go`, `kotlin`), the upstream tokenizer
//       is NEVER called. Rule 2 from the task spec ("language specified
//       but unsupported → highlight with the editor's
//       DEFAULT_CODE_LANGUAGE as an auto fallback") cannot be expressed
//       at all through upstream — by the time our custom Tokenizer's
//       `$tokenize` would run, the transform has already bailed. The only
//       ways around this are (i) rewrite the stored info string to
//       something Prism knows (breaks the on-disk round-trip — Decision 4)
//       or (ii) monkey-patch `Prism.languages` to alias every possible
//       unknown language (impossible — we don't know the set upfront).
//       Owning the transform is the only path that preserves both rule 2
//       and the verbatim-round-trip guarantee.
//
//    b) Upstream's `registerCodeHighlighting` also calls
//       `registerCodeIndentation`, which installs a `KEY_ARROW_UP_COMMAND`
//       handler at COMMAND_PRIORITY_LOW that traps the caret at the first
//       text position of a code block — silently breaking ArrowUp
//       navigation from the top of a non-leading code block into the
//       paragraph above. (A higher-priority counter-handler could
//       neutralize this in isolation, but reason (a) above already forces
//       us off `registerCodeHighlighting`, so it's moot.)
//
//    `registerHighlightingOnly` (which would handle (b) without (a)) is
//    `@internal` and not re-exported from `@lexical/code-prism`'s public
//    entry, so we cannot reach for it directly. Owning the transforms here
//    is the cleanest path.
//
// 2) PLAIN_TOKENIZER reuses upstream's `$tokenize` by spread: calling
//    `PLAIN_TOKENIZER.$tokenize(node, undefined)` binds `this` to the
//    override, so the method sees `this.defaultLanguage === null` and takes
//    its `$plainifyCodeContent(...)` branch — returning plain
//    TextNode/LineBreak/Tab children without us re-implementing that helper.
//    PrismTokenizer's `$tokenize` is reused the same way for rules 1+2 (it
//    dispatches to `$getHighlightNodes`).
//
// We never call `node.setLanguage(...)` — the on-disk info string round-trips
// verbatim regardless of which rule fired.

const PLAIN_TOKENIZER: Tokenizer = { ...PrismTokenizer, defaultLanguage: null };

// `normalizeCodeLanguage` maps the user-typed aliases `text` / `plaintext` /
// `plain` all to the canonical `plain`, which is NOT in the bundled Prism
// grammar set. Treating it as rule 3 (no highlight) — instead of letting it
// fall through to rule 2 (which would highlight `text` blocks as JavaScript)
// — matches the user's actual expectation for ` ```text `.
const PLAIN_LANGUAGE_ID = "plain";

// `getCodeLanguages()` re-walks `Object.keys(Prism.languages).filter(...).sort()`
// on every call. The bundled grammar set is statically imported by
// `@lexical/code-prism`'s side-effect imports and is frozen at module load,
// so we snapshot it once into a Set for O(1) membership lookups per
// keystroke.
const BUNDLED_LANGUAGES = new Set(getCodeLanguages());

function resolveHighlightLanguage(stored: string | null | undefined): string | null {
  if (!stored) return null; // rule 3
  const normalized = normalizeCodeLanguage(stored);
  if (normalized === PLAIN_LANGUAGE_ID) return null; // rule 3 via `plain` aliases
  if (BUNDLED_LANGUAGES.has(normalized)) return normalized; // rule 1
  return DEFAULT_CODE_LANGUAGE; // rule 2 auto
}

// `isEqual` + `getDiffRange` are minimal ports of the upstream helpers in
// `@lexical/code-prism/src/CodeHighlighterPrism.ts` (see `isEqual` at
// :314–325 and `getDiffRange` at :266–311). They compute a minimal
// (from, to, replacement) splice so each keystroke only touches the
// characters the tokenizer actually re-classified — the rest of the block's
// children stay byte-identical, which keeps selection/caret stable and
// undo/redo cheap.

function isEqual(a: LexicalNode, b: LexicalNode): boolean {
  if ($isCodeHighlightNode(a) && $isCodeHighlightNode(b)) {
    return (
      a.getTextContent() === b.getTextContent() && a.getHighlightType() === b.getHighlightType()
    );
  }
  if ($isTabNode(a) && $isTabNode(b)) return true;
  if ($isLineBreakNode(a) && $isLineBreakNode(b)) return true;
  return false;
}

function getDiffRange(
  prev: LexicalNode[],
  next: LexicalNode[],
): { from: number; to: number; nodesForReplacement: LexicalNode[] } {
  let leadingMatch = 0;
  while (leadingMatch < prev.length) {
    if (!isEqual(prev[leadingMatch], next[leadingMatch])) break;
    leadingMatch++;
  }

  const prevLen = prev.length;
  const nextLen = next.length;
  const maxTrailingMatch = Math.min(prevLen, nextLen) - leadingMatch;

  let trailingMatch = 0;
  while (trailingMatch < maxTrailingMatch) {
    trailingMatch++;
    if (!isEqual(prev[prevLen - trailingMatch], next[nextLen - trailingMatch])) {
      trailingMatch--;
      break;
    }
  }

  return {
    from: leadingMatch,
    to: prevLen - trailingMatch,
    nodesForReplacement: next.slice(leadingMatch, nextLen - trailingMatch),
  };
}

// Pure splice-once: returns true iff it changed the node's children. Used
// by both `$codeNodeTransform` (with selection retention + re-entry guard)
// and `$highlightAllCodeBlocks` (initial sweep at editor-state init time,
// no selection to preserve, no re-entry possible).
function $tokenizeCodeNode(node: CodeNode): boolean {
  const effective = resolveHighlightLanguage(node.getLanguage());
  const nextChildren =
    effective === null
      ? PLAIN_TOKENIZER.$tokenize(node, undefined)
      : PrismTokenizer.$tokenize(node, effective);

  const diff = getDiffRange(node.getChildren(), nextChildren);
  if (diff.from !== diff.to || diff.nodesForReplacement.length) {
    node.splice(diff.from, diff.to - diff.from, diff.nodesForReplacement);
    return true;
  }
  return false;
}

// Initial sweep entry point — called from the `editorState` initializer in
// `MarkdownEditor.tsx` AFTER `$convertFromMarkdownString`. The initializer
// runs inside Lexical's HISTORY_MERGE-tagged init context, so the splices
// don't fire `OnChangePlugin` — preserving the documented invariant in
// `src/components/organisms/board/AGENTS.md:18` ("Because init never emits
// `onChange`, `body` stays equal to the raw stored Markdown until the user
// actually edits"). Without this pre-sweep, the transforms registered in
// `CodeBlockHighlightPlugin`'s `useEffect` would dirty every CodeNode on
// mount, fire `onChange`, and trigger a phantom autosave every time the
// user opened a task containing a fenced code block.
//
// The plugin's `useEffect` later sweeps the same nodes via
// `registerNodeTransform`, but `getDiffRange` returns an empty diff for
// the already-tokenized state, the splice is skipped, and no dirty flag is
// set — so OnChangePlugin remains silent until a real user edit.
export function $highlightAllCodeBlocks(): void {
  for (const node of $nodesOfType(CodeNode)) {
    $tokenizeCodeNode(node);
  }
}

// Port of upstream's `$updateAndRetainSelection`
// (`CodeHighlighterPrism.ts:203–262`). Without this, every keystroke inside a
// code block would re-splice the children and Lexical would re-anchor the
// caret at the start of the block — typing would jump. We capture the caret's
// absolute character offset within the block before the splice and re-seat it
// at the same offset after.
function $updateAndRetainSelection(nodeKey: NodeKey, updateFn: () => boolean): void {
  const node = $getNodeByKey(nodeKey);
  if (!$isCodeNode(node) || !node.isAttached()) return;

  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    updateFn();
    return;
  }

  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();
  // The anchor's own node for an "element" type IS the container (this code
  // block, if the anchor is genuinely inside it); for a "text" type it's the
  // text leaf, so its *parent* is the container. Bail to the no-op path
  // below when the current selection isn't actually anchored in THIS code
  // block — otherwise a selection that exists anywhere else in the document
  // (e.g. left behind by an unrelated node transform) gets its offset
  // blindly reinterpreted against this block's own children and the caret
  // gets teleported here.
  const anchorContainer = anchor.type === "element" ? anchorNode : anchorNode.getParent();
  if (!node.is(anchorContainer)) {
    updateFn();
    return;
  }

  const anchorOffset = anchor.offset;
  const isNewLineAnchor =
    anchor.type === "element" && $isLineBreakNode(node.getChildAtIndex(anchor.offset - 1));

  let textOffset = 0;
  if (!isNewLineAnchor) {
    textOffset = anchorOffset;
    // Walk previous siblings without materializing the full array (a long
    // code block can have hundreds of highlight children; the upstream
    // `getPreviousSiblings().reduce(...)` pattern would allocate the
    // array per keystroke).
    for (
      let sib: LexicalNode | null = anchorNode.getPreviousSibling();
      sib != null;
      sib = sib.getPreviousSibling()
    ) {
      textOffset += sib.getTextContentSize();
    }
  }

  const hasChanges = updateFn();
  if (!hasChanges) return;

  if (isNewLineAnchor) {
    anchorNode.select(anchorOffset, anchorOffset);
    return;
  }

  let remaining = textOffset;
  node.getChildren().some((child) => {
    if ($isTextNode(child)) {
      const size = child.getTextContentSize();
      if (size >= remaining) {
        child.select(remaining, remaining);
        return true;
      }
      remaining -= size;
    } else if ($isLineBreakNode(child)) {
      remaining -= child.getTextContentSize();
    }
    return false;
  });
}

// Re-entry guard state. CodeNode + TextNode + CodeHighlightNode transforms
// can all fire during a single update tick when our splice produces new
// children; the upstream pattern is a per-tick set of keys currently being
// processed, cleared via `$onUpdate` once the tick settles.
type TransformState = {
  didTransform: boolean;
  nodesCurrentlyHighlighting: Set<NodeKey>;
};

function $codeNodeTransform(transformState: TransformState, node: CodeNode): void {
  const nodeKey = node.getKey();
  if (transformState.nodesCurrentlyHighlighting.has(nodeKey)) return;

  transformState.nodesCurrentlyHighlighting.add(nodeKey);
  if (!transformState.didTransform) {
    transformState.didTransform = true;
    $onUpdate(() => {
      transformState.didTransform = false;
      transformState.nodesCurrentlyHighlighting.clear();
    });
  }

  $updateAndRetainSelection(nodeKey, () => {
    const current = $getNodeByKey(nodeKey);
    if (!$isCodeNode(current) || !current.isAttached()) return false;
    return $tokenizeCodeNode(current);
  });
}

function $textNodeTransform(transformState: TransformState, node: TextNode): void {
  const parent = node.getParent();
  if ($isCodeNode(parent)) {
    $codeNodeTransform(transformState, parent);
  } else if ($isCodeHighlightNode(node)) {
    // CodeHighlightNode escaped its CodeNode parent — e.g. the user
    // converted the block to a paragraph. Replace it with a plain TextNode
    // so it stops carrying a stale highlight type into prose.
    node.replace($createTextNode(node.getTextContent()));
  }
}

export function CodeBlockHighlightPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const transformState: TransformState = {
      didTransform: false,
      nodesCurrentlyHighlighting: new Set(),
    };
    return mergeRegister(
      editor.registerNodeTransform(CodeNode, (n) => $codeNodeTransform(transformState, n)),
      editor.registerNodeTransform(TextNode, (n) => $textNodeTransform(transformState, n)),
      editor.registerNodeTransform(CodeHighlightNode, (n) => $textNodeTransform(transformState, n)),
    );
  }, [editor]);

  return null;
}
