import { CodeNode, getLanguageFriendlyName, type SerializedCodeNode } from "@lexical/code";
import {
  type DOMConversionMap,
  type DOMExportOutput,
  type EditorConfig,
  type ElementDOMSlot,
  type LexicalEditor,
  type NodeKey,
} from "lexical";

// Subclass of `@lexical/code`'s `CodeNode` whose rendered DOM is a
// `<div class="cork-code-block-wrapper">` holding two siblings:
//
//   <span class="cork-code-block-language">JavaScript</span>
//   <code class="cork-code-block ...">…CodeHighlightNode children…</code>
//
// The chip lives OUTSIDE the dark `<code>` background so the language name
// reads as a small label attached above the block (per the task spec). A
// CSS-only solution couldn't pull this off cleanly: the inner `<code>` has
// `overflow-x: auto` to horizontally scroll long lines, and the CSS spec
// forces `overflow-y: visible` to compute as `auto` whenever the other axis
// is non-visible — so anything positioned outside the `<code>` (negative
// margin, absolute / sticky above the top edge) gets clipped along with the
// horizontal overflow. Wrapping at the node level sidesteps that entirely:
// the chip is a sibling of the scrollable `<code>`, never inside it.
//
// `getDOMSlot` redirects Lexical's reconciler to write children into the
// inner `<code>`, so CodeHighlightNode DOM continues to live where the base
// `CodeNode` expects it. Every `data-language` / `data-theme` / style
// attribute the base sets on `createDOM`/`updateDOM` lands on that inner
// `<code>` because we delegate via `super.createDOM` and
// `super.updateDOM(prevNode, code, config)`. The language chip's textContent
// is written here directly (not via a side-channel mutation listener) so
// the chip is consistent with the node's `__language` from the moment the
// DOM mounts and stays in sync on every reconcile.
//
// Registered as a node replacement in `MarkdownEditor.tsx` so every
// `$createCodeNode` call site (markdown transformers, paste handlers,
// commands) materializes a `CorkCodeNode` instead. Type stays `'code'` is
// NOT used — we pick a distinct `'cork-code'` type so JSON serialization
// (used by clipboard) round-trips correctly through the replacement.
// `$isCodeNode` continues to work via `instanceof CodeNode`, and
// `editor.registerNodeTransform(CodeNode, …)` (e.g. `CodeBlockHighlightPlugin`)
// also fires for the replacement — Lexical's
// `resolveRegisteredNodeAfterReplacements` resolves base-type registrations
// to the registered replacement.

const WRAPPER_CLASS = "cork-code-block-wrapper";
const LANGUAGE_CHIP_CLASS = "cork-code-block-language";

// Expando cache set once in `createDOM`. `updateDOM`/`getDOMSlot` read these
// directly instead of re-running `querySelector` on every reconcile — Lexical
// calls `getDOMSlot` twice per dirty-element pass (once from child
// reconciliation, once from line-break termination) and `updateDOM` once more
// on top of that, and typing a single character anywhere inside a code block
// dirties the parent CodeNode too (child mutations mark ancestors dirty), so
// this path runs on essentially every keystroke. The cache is keyed on the
// DOM element itself (not the Lexical node, which is immutable/cloned each
// update) — it stays valid for the wrapper's whole lifetime since only this
// file ever writes into the subtree between it and its two children.
type CorkCodeWrapperElement = HTMLElement & {
  __corkChip?: HTMLSpanElement;
  __corkCode?: HTMLElement;
};

function $applyChip(chip: HTMLSpanElement, language: string | null | undefined): void {
  if (language) {
    chip.textContent = getLanguageFriendlyName(language);
    chip.removeAttribute("hidden");
  } else {
    chip.textContent = "";
    // `hidden` (vs `display: none` inline style) keeps the styling decision in
    // CSS — the chip stays a real DOM node but is removed from the rendering
    // tree when no language is set. The CSS selector
    // `.cork-code-block-language[hidden]` is the conventional opt-out.
    chip.setAttribute("hidden", "");
  }
}

function $findInnerCodeElement(wrapper: HTMLElement): HTMLElement {
  const cached = (wrapper as CorkCodeWrapperElement).__corkCode;
  if (cached !== undefined) return cached;
  const code = wrapper.querySelector<HTMLElement>(":scope > code");
  if (code === null) {
    throw new Error("CorkCodeNode wrapper is missing its inner <code> element");
  }
  (wrapper as CorkCodeWrapperElement).__corkCode = code;
  return code;
}

function $findLanguageChip(wrapper: HTMLElement): HTMLSpanElement {
  const cached = (wrapper as CorkCodeWrapperElement).__corkChip;
  if (cached !== undefined) return cached;
  const chip = wrapper.querySelector<HTMLSpanElement>(`:scope > .${LANGUAGE_CHIP_CLASS}`);
  if (chip === null) {
    throw new Error("CorkCodeNode wrapper is missing its language chip");
  }
  (wrapper as CorkCodeWrapperElement).__corkChip = chip;
  return chip;
}

export class CorkCodeNode extends CodeNode {
  static getType(): string {
    return "cork-code";
  }

  static clone(node: CorkCodeNode): CorkCodeNode {
    return new CorkCodeNode(node.__language, node.__key);
  }

  // Lexical's `getStaticNodeConfig` auto-generates `importJSON` only when the
  // class's constructor takes zero required arguments (so it can safely call
  // `new klass()`). Our constructor takes `(language?, key?)` which compiles to
  // a 2-arity function in JS — `klass.length === 2` — so the auto-generation
  // bails with an invariant. Define our own that mirrors the base class's
  // updateFromJSON pipeline: construct a default node, then layer the
  // serialized state on top. Same shape as the base CodeNode's importJSON
  // (which we can't reuse because Lexical inspects `hasOwnProperty`, not
  // the prototype chain).
  static importJSON(serializedNode: SerializedCodeNode): CorkCodeNode {
    return new CorkCodeNode().updateFromJSON(serializedNode);
  }

  // Paired with the custom `exportDOM` below purely to satisfy Lexical's
  // dev-mode editor-construction invariant: a node class with its own
  // `exportDOM` but no own static `importDOM` logs a console warning
  // ("should implement importDOM ... to ensure HTML serialization works as
  // expected"), because `hasOwnExportDOM`/`hasOwnStaticMethod` are pure
  // own-property checks — they don't care whether the override changes
  // behavior, only whether it exists. The inherited `CodeNode.importDOM`
  // conversion (`$convertPreElement` etc.) already produces a `CorkCodeNode`
  // via `$createCodeNode`'s node-replacement resolution, so delegating to
  // `super` is correct, not a placeholder.
  static importDOM(): DOMConversionMap | null {
    return super.importDOM();
  }

  constructor(language?: string | null | undefined, key?: NodeKey) {
    super(language, key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const wrapper: CorkCodeWrapperElement = document.createElement("div");
    wrapper.className = WRAPPER_CLASS;

    const chip = document.createElement("span");
    chip.className = LANGUAGE_CHIP_CLASS;
    // The chip must not absorb caret / clicks — a user clicking it should hit
    // through to the code area, and a Lexical selection must never anchor on a
    // non-Lexical node. `contentEditable=false` + `aria-hidden=true` keep both
    // the editor and assistive tech from treating the chip as content.
    chip.setAttribute("contenteditable", "false");
    chip.setAttribute("aria-hidden", "true");
    $applyChip(chip, this.getLanguage());

    const code = super.createDOM(config);

    wrapper.appendChild(chip);
    wrapper.appendChild(code);

    // Seed the lookup cache immediately — the very first `getDOMSlot`/
    // `updateDOM` call (which Lexical fires as part of the same reconcile
    // that just called `createDOM`) already hits it instead of paying a
    // `querySelector` traversal for elements we're holding direct refs to
    // right here.
    wrapper.__corkChip = chip;
    wrapper.__corkCode = code;

    return wrapper;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const code = $findInnerCodeElement(dom);

    const language = this.getLanguage();
    if (language !== prevNode.getLanguage()) {
      $applyChip($findLanguageChip(dom), language);
    }

    // Delegate to the base implementation so it can update the inner `<code>`'s
    // `data-language` / `data-highlight-language` / `data-theme` / style.
    // `super.updateDOM` reads `prevNode.__language` etc. and writes to the
    // element we pass in — handing it the inner `<code>` keeps the attribute
    // shape identical to a vanilla CodeNode.
    return super.updateDOM(prevNode, code, config);
  }

  getDOMSlot(dom: HTMLElement): ElementDOMSlot<HTMLElement> {
    return super.getDOMSlot(dom).withElement($findInnerCodeElement(dom));
  }

  // Mirrors `createDOM`'s wrapper shape for HTML export (copy/cut → the
  // `text/html` clipboard payload used for cross-app paste, per
  // `@lexical/clipboard`'s `$getHtmlContent` → `$generateHtmlFromNodes` →
  // this method). The base `CodeNode.exportDOM` builds a bare `<pre>` with
  // `theme.code`'s classes and nothing else — before this override, that
  // meant BOTH the chip's language label AND `.cork-code-block-wrapper`'s
  // margin (moved off `theme.code` and onto the wrapper in style.css) were
  // silently dropped from anything pasted outside the app. `append` is
  // `DOMExportOutput`'s children-redirection hook — the export-time
  // equivalent of `getDOMSlot`'s live-DOM redirection, "particularly useful
  // if this node's children are not direct ancestors" (its own doc comment)
  // — so CodeHighlightNode children still land inside the inner `<pre>`
  // instead of becoming siblings of the chip.
  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const { element: pre } = super.exportDOM(editor);
    if (!(pre instanceof HTMLElement)) {
      return { element: pre };
    }

    const wrapper = document.createElement("div");
    wrapper.className = WRAPPER_CLASS;

    const language = this.getLanguage();
    if (language) {
      const chip = document.createElement("span");
      chip.className = LANGUAGE_CHIP_CLASS;
      chip.textContent = getLanguageFriendlyName(language);
      wrapper.appendChild(chip);
    }

    wrapper.appendChild(pre);

    return {
      element: wrapper,
      append: (child) => pre.append(child),
    };
  }
}
