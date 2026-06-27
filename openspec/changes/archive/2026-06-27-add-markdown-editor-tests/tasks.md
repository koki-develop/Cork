## 1. Dependency install

- [x] 1.1 Add **five** packages to `package.json` `devDependencies` via `bun add -D vitest @vitest/browser-playwright playwright vitest-browser-react @lexical/headless@0.45.0`. Cork's `bunfig.toml` already has `install.exact = true`, so versions land as exact pins automatically (no `^` prefix) — this is what we want, because `vitest` and `@vitest/browser-playwright` mirror-pin each other's exact patch in their published `peerDependencies` (verified: both `4.1.9` peer to each other's `4.1.9`). `@lexical/headless` is pinned to `0.45.0` to stay locked with the rest of the `@lexical/*` family Cork already depends on. Do NOT install `@vitest/browser`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, or `@testing-library/jest-dom` — they are intentionally not part of the Vitest 4 browser-mode stack (see design Decision 8).
- [x] 1.2 Confirm `playwright` was installed as a top-level `devDependency` (not just left implicit). It is a **required, non-optional** peer of `@vitest/browser-playwright` (`peerDependenciesMeta.playwright.optional: false`) and the provider runtime does `await import("playwright")` — leaving it without an explicit `devDependencies` entry would (a) surface a peer-dep warning on every `bun install`, and (b) risk the provider's runtime `import("playwright")` failing if a future Bun hoist or workspace move stops elevating the transitive. (`bun pm ls playwright` should list it at the top level, alongside `@vitest/browser-playwright`.)
- [x] 1.3 Run `bunx playwright install --with-deps --only-shell chromium` once locally so the Playwright headless-shell binary is on disk for the first test run. (Verified that Vitest 4 browser-playwright launches `chromium_headless_shell-<rev>` specifically — `--only-shell` is the correct flag, full Chrome bundle is not used.)
- [x] 1.4 Confirm `bun pm ls vitest @vitest/browser-playwright playwright vitest-browser-react @lexical/headless` shows the expected versions: `vitest@4.1.9`, `@vitest/browser-playwright@4.1.9` (same patch — drift = peer-dep warning), `playwright@1.61.0` (the latest installable patch — `1.61.1` was published 2026-06-23 and is blocked by Cork's `bunfig.toml` `install.minimumReleaseAge = 604800` 7-day window; bump to 1.61.1 as a follow-up once the threshold clears around 2026-06-30), `vitest-browser-react@2.2.0`, `@lexical/headless@0.45.0`.

## 2. Test-runner configuration

- [x] 2.1 Create `vitest.config.ts` at repo root. It MUST `mergeConfig` with `vite.config.ts` via the functional `defineConfig(async (env) => mergeConfig(await viteConfig(env), defineConfig({...})))` form — Cork's `vite.config.ts` exports an `async (env) => ({...})` factory, so a plain `mergeConfig(viteConfig, ...)` would mis-merge a promise. The `test:` block sets `include: ["src/**/*.spec.{ts,tsx}"]`, `setupFiles: ["./vitest.setup.ts"]`, and a `browser:` block with `enabled: true`, `provider: playwright()` (imported from `@vitest/browser-playwright`), `headless: true`, `instances: [{ browser: "chromium" }]`.
- [x] 2.2 Create `vitest.setup.ts` at repo root with a single line: `import "vitest-browser-react"` (required by its docs so TypeScript picks up the `BrowserPage` augmentation that adds `page.render` / `page.renderHook`). The 27 DOM-style matchers (`expect.element(…).toBeInTheDocument()`, `.toBeVisible()`, etc.) come from `@vitest/browser` itself and are auto-registered at tester boot — do NOT add `expect.extend(matchers)` from `@testing-library/jest-dom`, it would just shadow the built-ins. (Note: `vitest-browser-react`'s import only augments `page` / `renderHook` types; the matcher types come separately from `@vitest/browser`.)
- [x] 2.3 Create `tsconfig.test.json` (extends `tsconfig.json`, sets `"types": ["vitest/browser"]`, `include` covers `src/**/*.spec.{ts,tsx}` + `src/**/__tests__/**`, `exclude: []` to cancel the parent's exclude). Add the corresponding `exclude: ["src/**/*.spec.ts", "src/**/*.spec.tsx", "src/**/__tests__/**"]` to `tsconfig.json` so production code and tests typecheck against disjoint configs. **Why not put `"types": ["vitest/browser"]` directly in `tsconfig.json`?** Setting `types` switches TS from auto-including every `@types/*` package to a whitelist — making the production tsconfig load-bearing for future @types additions. The test-only tsconfig keeps that footgun out of the production project (per `/code-review` finding #8).
- [x] 2.4 Extend `tsconfig.node.json`'s `include` array from `["vite.config.ts"]` to `["vite.config.ts", "vitest.config.ts", "vitest.setup.ts"]` so the two new root-level test-config files are inside a project TypeScript knows about. (Without this, `bunx tsc --noEmit` ignores them — they still run at test time because Vitest imports them directly through its own pipeline, but editors and the pre-push typecheck lose coverage on them.)
- [x] 2.5 Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `package.json`. Also update `"build"` from `"tsc && vite build"` to `"tsc && tsc -p tsconfig.test.json && vite build"` so production + test typechecks both run before bundling (matches the split tsconfig from task 2.3).
- [x] 2.6 Run `bun run test` once with zero spec files present to confirm the config parses, Vitest boots, and the Playwright provider initializes cleanly (expect `No test files found, exiting with code 1` — `vitest run` does NOT default `passWithNoTests` to `true` in 4.1.9; only `vitest related` and `vitest --changed` do (`node_modules/vitest/dist/chunks/cac.D3xHeqeL.js:2298,2308` + `coverage.DM_a_rWm.js:459`). So an empty `vitest run` logs the message and exits with code 1 — this is the documented behavior, not a crash. Chromium itself does NOT launch yet because there are no specs to dispatch. Actual browser launch is exercised the first time a spec file exists (step 5.4); if Chromium fails to launch then, re-check step 1.3 (`bunx playwright install`).

## 3. Lint integration

- [x] 3.1 Extend `.oxlintrc.json` `overrides` with a glob entry that sets `no-restricted-imports: "off"` for test files. **Scope to `src/components/molecules/MarkdownEditor/**`only**:`files: ["src/components/molecules/MarkdownEditor/**/*.spec.ts", "...spec.tsx", "src/components/molecules/MarkdownEditor/__tests__/**/*.ts", "...tsx"]`. An unanchored `\*_/_.spec.{ts,tsx}`glob would silently disable architectural rules for any future test file anywhere in the tree (per`/code-review` finding #1).
- [x] 3.2 Confirm the existing `bun run lint` still passes (no regressions to non-test files).

## 4. Shared test utilities

- [x] 4.1 Create `src/components/molecules/MarkdownEditor/__tests__/utils.tsx`.
- [x] 4.2 **Update `MarkdownEditor.tsx` to `export const NODES = [...]` (production-side change)** and `import { NODES } from "../MarkdownEditor"` in the test helper. The original plan was to duplicate the array as `MARKDOWN_EDITOR_NODES` and rely on a comment to keep them in sync, but the extraction is a one-line production change that removes the drift risk entirely (per `/code-review` finding #2). Do NOT redeclare the array in the test file.
- [x] 4.3 Export `createTestHeadlessEditor(options?)`: thin wrapper around `@lexical/headless`'s `createHeadlessEditor` pre-registering `NODES` (imported from production) and `onError: e => { throw e }`.
- [x] 4.4 Export `$setMarkdown(editor, markdown)`: wraps `editor.update(() => $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS), {discrete: true})`.
- [x] 4.5 Export `$readMarkdown(editor)`: wraps `editor.getEditorState().read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS))`.
- [x] 4.6 **Update `MarkdownEditor.tsx` to `export function buildInitialConfig(initialValue: string)`** that returns the production `initialConfig` (`namespace`, `theme`, `nodes: NODES`, `editorState` initializer calling `$convertFromMarkdownString` + `$insertSpacersBetweenAdjacentQuotes` + `$highlightAllCodeBlocks`, `onError`). Production uses `buildInitialConfig(initialValue)`; the test helper calls `buildInitialConfig("")` so the mounted test editor has the SAME theme + node set + state-seed pipeline as production (per `/code-review` finding #3 — the original plan omitted theme and editorState, which would have silently diverged the moment a future test asserted on rendered DOM). Export `renderTestEditor(options?)` that uses this shared config, wraps it with `RichTextPlugin` + `HistoryPlugin` + `options.plugins`, and uses a small `EditorCapture` to grab the editor instance via `useLexicalComposerContext`. The capture is render-time (no `useEffect`), exploiting the fact that `LexicalComposer` builds the editor inside `useMemo` BEFORE rendering children (`@lexical/react/LexicalComposer.tsx:87-115`) — per `/code-review` finding #6.
  ```tsx
  function EditorCapture({ onCapture }: { onCapture: (e: LexicalEditor) => void }) {
    const [editor] = useLexicalComposerContext();
    onCapture(editor);
    return null;
  }
  // inside renderTestEditor:
  let captured: LexicalEditor | undefined;
  const screen = await render(
    <LexicalComposer initialConfig={buildInitialConfig("")}>
      <EditorCapture onCapture={(e) => { captured = e; }} />
      <RichTextPlugin .../>
      <HistoryPlugin />
      {options?.plugins}
    </LexicalComposer>
  );
  return { editor: captured!, screen, user };
  ```
- [x] 4.7 Export `dispatchKeyDown(editor, key, modifiers?)` keyed by a `KEY_COMMANDS` `Record` (compile-time `keyof typeof KEY_COMMANDS` type) rather than a switch. Builds a `KeyboardEvent` via the native constructor and dispatches the mapped `KEY_*_COMMAND` inside `editor.update({discrete: true})`. The discrete wrap is mandatory: standalone `editor.dispatchCommand` defers commits to a microtask (`packages/lexical/src/LexicalUpdates.ts:$beginUpdate` → `scheduleMicroTask(() => $commitPendingUpdates(editor))`), so the test's follow-up `getEditorState()` would otherwise see the pre-mutation state. Adding a new key is a single map entry (per `/code-review` finding #7 — the original plan had a 30-line switch with `Backspace`/`Enter`/`Tab`/`Arrow*` each handled by structurally identical 3-line case blocks).

## 5. Proof-of-concept test 1 — pure helper

- [x] 5.1 Create `src/components/molecules/MarkdownEditor/codeBlock.spec.ts`.
- [x] 5.2 Test case: a `ParagraphNode` directly under root SHALL NOT be inside a code block (`$isInsideCodeBlock` returns `false`).
- [x] 5.3 Test case: a `TextNode` inside a `CodeNode` SHALL be inside a code block (`$isInsideCodeBlock` returns `true`).
- [x] 5.4 Run `bun run test` and confirm 2/2 pass.

## 6. Proof-of-concept test 2 — transformer round-trip

- [x] 6.1 Create `src/components/molecules/MarkdownEditor/transformers.spec.ts`.
- [x] 6.2 Test case: `# Hello` → `$setMarkdown` → `$readMarkdown` SHALL produce `# Hello`.
- [x] 6.3 Test case: an unordered list (`- one\n- two`) round-trips identically.
- [x] 6.4 Run `bun run test` and confirm 2/2 pass.

## 7. Proof-of-concept test 3 — nested-blockquote transformer

- [x] 7.1 Create `src/components/molecules/MarkdownEditor/transformers.quote.spec.ts`.
- [x] 7.2 Test case: `> > Hello` round-trips identically.
- [x] 7.3 Test case: after import, the editor state's root SHALL contain exactly one outer `QuoteNode` whose only child is an inner `QuoteNode` whose only child is a `ParagraphNode` whose text content is `Hello` (assert the depth-2 nesting structure, not just the textContent — that's the invariant the Cork QUOTE transformer adds on top of upstream).
- [x] 7.4 Run `bun run test` and confirm 2/2 pass.

## 8. Proof-of-concept test 4 — plugin keyboard contract

- [x] 8.1 Create `src/components/molecules/MarkdownEditor/QuoteExitPlugin.spec.tsx`.
- [x] 8.2 Test case: `const {editor} = await renderTestEditor({plugins: <QuoteExitPlugin />})`. Seed an empty `QuoteNode` (one paragraph child, empty), place selection inside, dispatch `KEY_BACKSPACE_COMMAND` via `dispatchKeyDown`. Then assert via `editor.getEditorState().read(...)` that the root has exactly one `ParagraphNode` and zero `QuoteNode`s.
- [x] 8.3 Run `bun run test` and confirm 1/1 passes.
- [x] 8.4 If this test surfaces a Vitest-4 + browser-mode + Lexical-0.45 integration issue (e.g. the captured `editor` reference is stale, or `Selection` interacts oddly with `LexicalContentEditable` inside the Playwright-driven page), record the cause as a comment in `__tests__/utils.tsx` and either work around it inside the helper, or — only if a workaround isn't possible at this layer — mark the single test `it.skip(..., "<concrete reason>")` and open a follow-up. Do NOT silently delete the test. **Issue surfaced**: standalone `editor.dispatchCommand` from outside any update scope schedules its commit via `scheduleMicroTask`, so synchronous `getEditorState()` reads return pre-mutation state. **Workaround applied in helper**: `dispatchKeyDown` wraps the dispatch in `editor.update({discrete: true})` to reconstruct production's "keydown event arrives inside a discrete update" context — see the long comment block on `KEY_COMMANDS` in `__tests__/utils.tsx`.

## 9. CI integration

- [x] 9.1 Extend `.github/workflows/ci.yml` `lint` job: add a step that restores a GitHub Actions cache keyed on `${{ runner.os }}-playwright-${{ hashFiles('bun.lock') }}` pointing at `~/.cache/ms-playwright`.
- [x] 9.2 In the same `lint` job, add a step that runs `bunx playwright install --with-deps --only-shell chromium` (cache hit → near-instant; cache miss → ~30–60 s; `--only-shell` matches the Vitest docs' headless-CI guidance).
- [x] 9.3 In the same `lint` job, add a step that runs `bun run test` after `bun run lint`.
- [x] 9.4 Confirm CI passes locally by running `bun run lint && bun run fmt:check && bun run test`.

## 10. Documentation

- [x] 10.1 Update root `AGENTS.md` "Tests" section: replace the "Frontend: no test framework" sentence with the actual setup — Vitest 4 + browser mode + Playwright Chromium (`--only-shell`) + `vitest-browser-react` + the colocated `*.spec.ts(x)` convention + the `__tests__/utils.tsx` helper module pointer. Add `bun run test` / `bun run test:watch` to the commands table.
- [x] 10.2 Add a new section to `src/components/molecules/MarkdownEditor/AGENTS.md` titled "Testing" that: (a) names the three testable surface shapes covered today (pure helper, transformer round-trip, plugin keyboard contract) plus a note that the fourth shape (plugin live-typing transforms via `registerUpdateListener`) is reachable with the same helpers but has no POC yet — to be added by whichever follow-up touches a live-typing plugin; (b) lists which spec file demonstrates each of the three shapes; (c) points to `__tests__/utils.tsx` as the helper source; (d) explicitly tells contributors to import `render` from `vitest-browser-react`, `page` / `userEvent` from `vitest/browser`, and use `await expect.element(…).toBeInTheDocument()` — not from `@testing-library/*`. The real reasons to prefer the Vitest-native stack: `vitest-browser-react`'s `render` returns retry-able `Locator`s integrated with `expect.element` (Testing Library returns DOM elements that don't auto-retry); `vitest/browser`'s `userEvent` dispatches real Chrome DevTools Protocol events (Testing Library's user-event fakes events); and `vitest-browser-react` auto-registers `beforeEach(cleanup)` (Testing Library's cleanup runs in `afterEach`, which prevents inspecting rendered output after a failure). The two stacks are NOT interchangeable.
- [x] 10.3 Confirm `bun run fmt:check` still passes after the AGENTS.md edits.

## 11. Final verification

- [x] 11.1 Run the full local pipeline once end-to-end: `bun install && bunx tsc --noEmit && bunx tsc -p tsconfig.test.json --noEmit && bun run lint && bun run fmt:check && bun run test && bun run build`.
- [x] 11.2 Run `openspec validate add-markdown-editor-tests --strict` to confirm all four artifacts report valid.
- [x] 11.3 Hand-verify a `bun run tauri dev` smoke session: open a task with a nested blockquote and a heading, edit, save, reload — to confirm no production behavior regressed. (Production code IS modified now — `MarkdownEditor.tsx` exports `NODES` + `buildInitialConfig`, and the inline `initialConfig` is replaced by `buildInitialConfig(initialValue)` — so a smoke run is more relevant than originally planned.)
