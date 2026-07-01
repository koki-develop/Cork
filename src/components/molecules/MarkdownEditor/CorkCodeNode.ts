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
//   <button class="cork-code-block-tab">
//     <span class="cork-code-block-language">JavaScript</span>
//   </button>
//   <code class="cork-code-block ...">…CodeHighlightNode children…</code>
//
// The tab lives OUTSIDE the dark `<code>` background so the language label
// reads as a small tab attached above the block (per the task spec). A
// CSS-only solution couldn't pull this off cleanly: the inner `<code>` has
// `overflow-x: auto` to horizontally scroll long lines, and the CSS spec
// forces `overflow-y: visible` to compute as `auto` whenever the other axis
// is non-visible — so anything positioned outside the `<code>` (negative
// margin, absolute / sticky above the top edge) gets clipped along with the
// horizontal overflow. Wrapping at the node level sidesteps that entirely:
// the tab is a sibling of the scrollable `<code>`, never inside it.
//
// The tab IS the click target for changing the language — there is no
// separate pencil icon. Clicking it is handled entirely by
// `FloatingCodeLanguageEditorPlugin` (registered in `MarkdownEditor.tsx`),
// which delegates on the editor root by class name (`LANGUAGE_TAB_CLASS`)
// rather than attaching a listener here: this file only describes DOM
// *shape*, plugins own *behavior*, matching every other interactive
// affordance in this package. Built as a real `<button>` (raw DOM, no React —
// it's part of a Lexical node's `createDOM`, not a React tree) so it's
// reachable by click, Tab, and screen readers without any extra affordance
// glued on. `contenteditable=false` keeps Lexical from treating it as
// editable text.
//
// The tab is ALWAYS present (never toggled off) — a language-less fence
// shows the "Plain Text" fallback label rather than an empty/hidden chip.
// Two reasons: (1) it gives the tab a permanent home to click even when
// there's no language set yet, instead of nothing being clickable at all;
// (2) `display: block` on `.cork-code-block-tab` (a flex container, not a
// run of loose inline siblings) keeps it out of the wrapper's inline
// formatting context — loose inline content directly followed by a block
// sibling gets an invisible line-height "strut" below it that reads as a
// stray gap before the code well; a single block-level tab box has no such
// strut. `chip.textContent` doubles as the label for both states (see
// `$applyChip`) rather than a separate hidden/shown element, so
// `updateDOM`'s dirty-check stays a single string compare.
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
// Exported so `FloatingCodeLanguageEditorPlugin` can both anchor its floating
// panel to the tab AND delegate its click handling by this class name,
// without this file needing to know anything about that plugin.
export const LANGUAGE_TAB_CLASS = "cork-code-block-tab";
const LANGUAGE_CHIP_CLASS = "cork-code-block-language";

// The chip's fallback label when no language is set. Reuses the library's
// own friendly name for the `plain` language id (the same identifier
// `CodeBlockHighlightPlugin`'s rule 3 treats a blank/`plain` fence as, and
// the same one `FloatingCodeLanguageEditorPlugin`'s "Plain Text" list entry
// resolves to) so the wording can never drift out of sync between the two.
const NO_LANGUAGE_LABEL = getLanguageFriendlyName("plain");

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

// `getLanguageFriendlyName` (upstream `@lexical/code`, not ours to fix) does
// an unguarded `CODE_LANGUAGE_MAP[lang]` lookup against a plain object — so a
// language string that happens to match an `Object.prototype` property name
// ("constructor", "toString", "hasOwnProperty", ...) resolves to a built-in
// function instead of falling through to the language string itself.
// Assigning that function to `textContent` coerces it to its source text
// (e.g. "function Object() { [native code] }"), silently corrupting the
// chip label for any stored `__language` that happens to collide — whether
// it arrived via `FloatingCodeLanguageEditorPlugin`, a hand-edited file, or
// a paste. Guard at the single place every caller in this file funnels
// through: only trust the friendly name when it's actually a string.
function $friendlyLanguageLabel(language: string): string {
  const friendly = getLanguageFriendlyName(language);
  return typeof friendly === "string" ? friendly : language;
}

function $applyChip(chip: HTMLSpanElement, language: string | null | undefined): void {
  chip.textContent = language ? $friendlyLanguageLabel(language) : NO_LANGUAGE_LABEL;
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
  // Not `:scope > ...` — the chip is nested one level inside `.cork-code-block-tab`,
  // not a direct child of the wrapper. A plain descendant selector is fine
  // since there's exactly one chip in the whole subtree; this only runs once
  // before the result is cached anyway.
  const chip = wrapper.querySelector<HTMLSpanElement>(`.${LANGUAGE_CHIP_CLASS}`);
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

    // A real <button>, not a <div> — the tab itself is the click target for
    // `FloatingCodeLanguageEditorPlugin` (no separate pencil icon).
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = LANGUAGE_TAB_CLASS;
    tab.setAttribute("aria-label", "Edit code block language");
    tab.setAttribute("contenteditable", "false");

    const chip = document.createElement("span");
    chip.className = LANGUAGE_CHIP_CLASS;
    // `aria-hidden` since the tab button above already carries the
    // accessible name — screen readers shouldn't announce the label twice.
    chip.setAttribute("aria-hidden", "true");
    $applyChip(chip, this.getLanguage());

    tab.appendChild(chip);

    const code = super.createDOM(config);

    wrapper.appendChild(tab);
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
    // `prevNode.getLanguage()` would be wrong here — the getter calls
    // `getLatest()`, which resolves to the CURRENT (post-update) node for
    // that key rather than `prevNode`'s own frozen value, so it would always
    // read back `language` itself and this diff would never fire. Read the
    // private field directly instead, exactly like the base `CodeNode`'s own
    // `updateDOM` does for the same reason (`@lexical/code-core`'s
    // `updateDOM` compares `this.__language` against `prevNode.__language`,
    // never `prevNode.getLanguage()`).
    if (language !== prevNode.__language) {
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
  // instead of becoming siblings of the tab. The edit button is deliberately
  // excluded — it's an editor-only affordance, not meaningful once pasted.
  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const { element: pre } = super.exportDOM(editor);
    if (!(pre instanceof HTMLElement)) {
      return { element: pre };
    }

    const wrapper = document.createElement("div");
    wrapper.className = WRAPPER_CLASS;

    // Plain <div>, not the live DOM's <button> — a pasted, functionless
    // button would just be confusing chrome in whatever app it lands in.
    const tab = document.createElement("div");
    tab.className = LANGUAGE_TAB_CLASS;
    const chip = document.createElement("span");
    chip.className = LANGUAGE_CHIP_CLASS;
    $applyChip(chip, this.getLanguage());
    tab.appendChild(chip);
    wrapper.appendChild(tab);

    wrapper.appendChild(pre);

    return {
      element: wrapper,
      append: (child) => pre.append(child),
    };
  }
}
