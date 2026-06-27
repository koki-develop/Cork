## Context

Cork's `MarkdownEditor` has grown into the most behavior-dense surface in the codebase: 16 custom Lexical plugins (`QuoteExitPlugin`, `ListExitPlugin`, `TableKeyboardPlugin`, `CodeBlockHighlightPlugin`, the format-shortcut family, the floating-UI family, ...), a 762-line `transformers.ts` with custom QUOTE / TABLE / HORIZONTAL_RULE / CHECK_LIST / list transformers, and a half-dozen shared `$`-prefixed helpers. All of it is unverified by automated tests today — the project's root `AGENTS.md` openly states `Frontend (src/): no test framework`. The recent nested-blockquote review surfaced ten confirmed bugs (duplicate epilogue in `QUOTE.replace`, leading-link false quote-exit, trailing-space round-trip drift, etc.) — every one of them would have been caught by a representative unit test, and the cost of manually re-smoking each plugin on every change is no longer affordable.

The repo is a single non-monorepo TypeScript project: React 19.2 + Vite 7.3 + Tailwind 4 + `lexical` 0.45 + Bun 1.3 as the package manager. There is no existing test infrastructure to extend. CI runs only `bun run lint` and `bun run tauri build --no-bundle`. The `oxlint` configuration has aggressive cross-layer import restrictions (molecules can only import atoms + `@/hooks/ui/*`) that test files will need to circumvent.

Cork ships in a Tauri WebView. The production rendering target is therefore a real, modern browser engine — never jsdom. That matters for the test environment choice (Decision 2): the editor's behavior is dense in surfaces that jsdom either doesn't implement or implements differently (`Selection`, `Range.getBoundingClientRect`, contenteditable property/attribute sync, `PointerEvent`), and Lexical's official jsdom harness papers over each of those gaps with a polyfill. We get to skip that polyfill layer entirely by running tests in a real browser.

This change is the foundation. It picks the stack, wires the plumbing, lands four proof-of-concept tests across the three surface shapes the editor uses today (the transformer shape gets two examples — a basic round-trip and a Cork-specific nested variant), and documents the recipe so subsequent changes can extend coverage one plugin at a time without re-litigating tooling questions.

## Goals / Non-Goals

**Goals:**

- Pick a test runner / DOM environment / library stack that is proven to work with `lexical` 0.45 and React 19, and that the team can use to write the same kinds of tests Lexical itself writes (transformer round-trips, dispatched-command plugin tests).
- Make the **three** MarkdownEditor surface shapes covered by this slice testable in a way the project's lint rules and existing pre-commit / CI pipelines accept: (a) pure `$`-helpers, (b) transformer round-trips, (c) plugin keyboard contracts via Lexical commands. A fourth shape — (d) plugin live-typing transforms driven by `registerUpdateListener` — is reachable with the same helper module (`renderTestEditor` + `editor.update`) but its POC is deferred to whichever follow-up change first touches a live-typing plugin (see proposal "Out of scope").
- Land a thin slice (four tests total — one for shape (a), two for shape (b) to demonstrate the basic + Cork-specific nested-depth variant, one for shape (c)) so the next contributor copies a working template rather than designing from scratch.
- Wire `bun run test` into CI as a blocking step so a green PR provably ran the suite.
- Document where tests live, what the helper module provides, and which behaviors are explicitly out of scope (so contributors don't waste time fighting environment limits).

**Non-Goals:**

- Comprehensive coverage of every plugin / transformer. Only one plugin (`QuoteExitPlugin`) is tested in the initial slice; the rest is follow-up work.
- Tests for the floating UI plugins (`FloatingFormatToolbarPlugin`, `FloatingLinkEditorPlugin`). Browser mode now makes their layout-dependent assertions tractable, but they bring their own popover-position / anchor-calculation surface that's a separate design exercise — kept out of this change to hold the scope honest.
- Tests for components outside `MarkdownEditor` (atoms / other molecules / organisms / pages). The framework will trivially extend to them later.
- End-to-end / integration tests that drive the actual Tauri binary. Orthogonal layer.
- WebKit parity in CI. Cork's Tauri WebView is WebKit on macOS (WKWebView) and Linux (WebKitGTK); Chromium-only tests miss WebKit-specific bugs on those platforms — at four tests the marginal value of a second engine doesn't justify the runner time.
- Coverage thresholds, snapshot testing, visual regression. Premature until coverage is broad enough to make the metric meaningful.
- Migrating any production code to be "more testable". The proof-of-concept tests will be written against the editor as it is today; if refactors are needed to test something, that's its own change.

## Decisions

### Decision 1: Vitest 4.1.x (not Vitest 3, not Jest, not `bun test`)

**Choice**: Use **Vitest 4.1.x** (`4.1.9` is the latest at the time of writing) as the test runner.

**Alternatives considered:**

- **Vitest 3.x** — the previous major. **Rejected**: a fresh setup has no migration debt; "Lexical 0.45 happens to pin 3.x in its repo" is a historical artifact, not a reason to start a new project there. Vitest 4 is the current stable line and the long-term target — locking in 3.x just defers a no-value bump. Also, Vitest 4 exposes the browser-mode runtime under the `vitest/browser` subpath of the main `vitest` package, simplifying the import path (consumer code imports `from "vitest/browser"`; the `@vitest/browser` npm package still exists internally but is pulled in transitively by `@vitest/browser-playwright` — not something you install directly).
- **Jest** — the JS-test default. **Rejected**: needs separate Babel/TS config divorced from Vite's; Vitest reuses the Vite pipeline so the `@/*` alias, the `babel-plugin-react-compiler` Babel pass, and the Tailwind plugin all work in tests for free. Jest also has no first-class browser-mode story comparable to Vitest's Playwright integration (Decision 2).
- **`bun test`** — Bun's built-in runner. **Rejected**: it does not share Vite's resolver, so the `@/*` alias and the React-Compiler Babel transform would need re-wiring; its browser-side story is significantly behind Vitest's.

**Node version requirement**: Vitest 4 requires Node `^20 || ^22 || >=24`. Cork's `mise.toml` pins `bun = "1.3.14"`, which bundles a Node-compatible runtime — but Vitest itself runs under Node (not Bun's runtime), and CI's `mise-action` resolves Node via the same toolchain. No version change needed.

**Consequence**: Vitest 4 is a `devDependency`, invoked via `bun run test` (which dispatches to the local `vitest` bin so its `#!/usr/bin/env node` shebang puts it on Node, not Bun's runtime). Do NOT use `bunx vitest` — `bunx` runs JS under Bun's runtime, ignoring the shebang, and Vitest 4 has no documented Bun-runtime support. The test code itself runs in the Playwright-driven Chromium page (Decision 2).

### Decision 2: Vitest browser mode with Playwright + Chromium (not jsdom, not happy-dom)

**Choice**: Use **Vitest browser mode** with `@vitest/browser-playwright` driving a **Chromium** instance.

**Alternatives considered:**

- **jsdom** — what Lexical's own unit tests use upstream. **Rejected here**: Lexical's `vitest.setup.mts` at the `v0.45.0` tag installs four hand-written polyfills (`focusPreservingSelection` to undo jsdom destroying the Selection on `focus()`, a `contentEditable` getter/setter that delegates to the attribute, a `Range.prototype.getBoundingClientRect` zero-rect stub because jsdom doesn't compute layout, and a minimal `PointerEvent` class) — all to make jsdom approximate a real browser well enough for editor tests. That polyfill set is durable maintenance debt every Lexical bump can disturb. A real browser provides all four for free. Cork itself ships in a Tauri WebView (Chromium-class on most platforms), so the "fidelity to production" argument that sometimes favors jsdom for write-once-test-anywhere libraries doesn't apply — production _is_ a browser engine.
- **happy-dom** — lighter jsdom alternative. **Rejected**: same fidelity gaps as jsdom; no polyfill set in the wild that's been proven against Lexical 0.45 the way the upstream's jsdom polyfills have been; saving startup ms is not worth the unknown unknowns.
- **WebdriverIO provider instead of Playwright** — Vitest supports both. **Rejected**: Playwright is the more widely-deployed provider, Lexical's own E2E uses Playwright (cross-team familiarity), and `@vitest/browser-playwright` is what the Vitest docs lead with for new setups.
- **Multi-engine (Chromium + WebKit + Firefox)** — Lexical's E2E runs all three. **Deferred**: at four tests the marginal bug-find of a second engine doesn't pay for the runner time. Easy to add later by appending to the `browser.instances` array.

**Consequence**: One Playwright Chromium install in CI (`bunx playwright install --with-deps --only-shell chromium`, optionally cached by Playwright version — `--only-shell` is the flag Playwright's own `/docs/browsers` page recommends for headless CI; it installs the `chromium-headless-shell` variant, roughly half the size of the full Chromium binary). Note: Playwright's docs actually say caching browser binaries is optional since the download time is comparable to cache-restore time — we still cache but accept the over-broad key. No polyfill maintenance. `playwright` is a **required** non-optional peer dependency of `@vitest/browser-playwright` (verified in the published `peerDependenciesMeta.playwright.optional: false`; the provider does `await import("playwright")` at runtime — `packages/browser-playwright/src/playwright.ts:172`), so it must be installed explicitly in `devDependencies`. Floating-UI plugins become testable in the future without lifting an environment — `Range.getBoundingClientRect` returns real numbers, `Selection` does real things, `PointerEvent` is just there.

**Version pinning**: Vitest publishes `vitest` and `@vitest/browser-playwright` with mirror-pinned peer dependencies (`"4.1.9"` exact in both directions, per the published `peerDependencies` fields). Cork's `bunfig.toml` already sets `install.exact = true`, so `bun add -D` writes exact versions by default — both packages end up pinned to `4.1.9` simultaneously and stay locked together on upgrades. A `^4.1` style range would risk a brief window during patch releases where the two diverge.

### Decision 3: `vitest.config.ts` separate from `vite.config.ts`, shared via `mergeConfig`

**Choice**: A separate `vitest.config.ts` file that imports `vite.config.ts` and merges via Vitest's `mergeConfig`. Cork's `vite.config.ts` exports an `async (env) => ({...})` factory, so the merge has to `await` it inside an outer functional `defineConfig` — Vitest's docs show the functional form explicitly for this case.

```ts
// vitest.config.ts (sketch)
import { defineConfig, mergeConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import viteConfig from "./vite.config";

export default defineConfig(async (env) =>
  mergeConfig(
    await viteConfig(env),
    defineConfig({
      test: {
        setupFiles: ["./vitest.setup.ts"],
        include: ["src/**/*.spec.{ts,tsx}"],
        browser: {
          enabled: true,
          provider: playwright(),
          headless: true,
          instances: [{ browser: "chromium" }],
        },
      },
    }),
  ),
);
```

**Alternatives considered:**

- **Inline `test:` block inside `vite.config.ts`** — simpler. **Rejected**: pollutes the dev/build config with test-only options (and the Playwright provider import).
- **Standalone `vitest.config.ts` not sharing with Vite** — duplicates the `@/*` alias and the React plugin. **Rejected**: drift between dev / test resolver is exactly the kind of footgun this project has avoided by single-sourcing the alias in `tsconfig.json` + `vite.config.ts`.

**Consequence**: One alias source of truth. React plugin (Decision 5), Tailwind plugin, and `@/*` alias are inherited automatically. CSS is not skipped — the editor reads its own theme classes, and in a real browser there's no reason to fight that.

### Decision 4: Colocated `*.spec.ts(x)` next to source files

**Choice**: Test files live next to their target with the `.spec.ts` / `.spec.tsx` suffix.

```
src/components/molecules/MarkdownEditor/
├── transformers.ts
├── transformers.spec.ts            ← new
├── transformers.quote.spec.ts      ← new
├── codeBlock.ts
├── codeBlock.spec.ts               ← new
├── QuoteExitPlugin.ts
├── QuoteExitPlugin.spec.tsx        ← new
└── __tests__/
    └── utils.tsx                   ← new (shared test helpers)
```

**Alternatives considered:**

- **Centralized `tests/` at repo root** — easier `.gitignore`-style sweeps. **Rejected**: forces a parallel directory mirror that drifts when files move, and makes it harder to see "is this code tested?" at a glance.
- **`__tests__/` next to source for everything** (Lexical's pattern). **Considered, partially adopted**: we use `__tests__/utils.tsx` for the shared helpers (matching Lexical's `packages/lexical/src/__tests__/utils/index.tsx`) but keep individual tests adjacent so the answer to "is this tested?" is one line of file-tree scrolling away.
- **Suffix `.test.ts`** — Vitest's default. **Rejected by the user's preference for `.spec.`** — both are first-class to Vitest's default `include` glob (`**/*.{test,spec}.?(c|m)[jt]s?(x)`), no config change needed.

**Consequence**: A new contributor opening `QuoteExitPlugin.ts` sees `QuoteExitPlugin.spec.tsx` in the same folder, two lines down in the file tree. Discovery cost is zero.

### Decision 5: React Compiler stays enabled in tests

**Choice**: Tests run through the same `babel-plugin-react-compiler` pipeline as production (no override in `vitest.config.ts`).

**Alternatives considered:**

- **Disable React Compiler in tests** (override `react()` plugin's babel config). **Rejected**: disabling means tests exercise a different code shape than production. React Compiler is known to alter render counts and memoization in ways that can mask or invent bugs. Parity with production is worth the small per-test compile cost.

**Consequence**: First test run on a cold machine is slightly slower (Babel transform pass). If this becomes a problem we can flip later; the design records the rationale so it's not re-litigated.

### Decision 6: `bun run test` script + CI step inside the existing `lint` job + Playwright install

**Choice**: Add a `"test": "vitest run"` script and a `"test:watch": "vitest"` script. Extend the `lint` CI job to (a) install Chromium for Playwright and (b) run `bun run test` after `bun run lint`.

The Playwright install step uses `bunx playwright install --with-deps --only-shell chromium` (Playwright's `/docs/browsers` page recommends `--only-shell` for headless CI — it installs the `chromium-headless-shell` variant instead of the full Chromium binary, roughly half the disk footprint). It is cached on the runner (`~/.cache/ms-playwright` on Linux), so the per-PR cost is ~10 s after first warm.

**Alternatives considered:**

- **Separate CI job** — parallel with `lint`, faster wall-clock. **Rejected at four tests**: a separate job pays the runner cold-start (~30 s) on every PR. Re-evaluate when the suite grows beyond ~60 s.
- **Run tests in the `build` job** — keeps `lint` light. **Rejected**: `build` runs on `macos-latest` for the Tauri toolchain; tests have no macOS-specific needs and shouldn't burn macOS minutes.

**Consequence**: Two new steps in one existing job. CI cost goes up by ~10–15 s warm, ~40–60 s cold.

### Decision 7: `.oxlintrc.json` override for test files

**Choice**: Add a `**/*.spec.{ts,tsx}` + `**/__tests__/**` glob override in `.oxlintrc.json` that disables the `no-restricted-imports` rule for that path.

**Alternatives considered:**

- **No override** — leave restrictions on. **Rejected**: a test for `QuoteExitPlugin` may need to import a fixture from `src/lib/` or a node from `@lexical/rich-text` that the molecules-layer restriction blocks. The architecture restrictions exist to keep production code from violating the atomic-design contract — they're not relevant to tests.
- **Move tests outside `src/`** — sidesteps the lint rule. **Rejected** (already covered in Decision 4): colocation is worth more than avoiding one lint config line.

**Consequence**: One small block in `.oxlintrc.json`. No changes to the molecules-layer enforcement for production files.

### Decision 8: Shared test helper module — what it exports

**Choice**: `src/components/molecules/MarkdownEditor/__tests__/utils.tsx` exports a minimal, targeted API. Not a kitchen sink — only what the four POC tests need plus the obvious extensions a fifth/sixth test will reach for:

| Export                                     | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Built on                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `MARKDOWN_EDITOR_NODES`                    | Array of every node class the production `MarkdownEditor` registers (`HeadingNode`, `QuoteNode`, `ListNode`, `ListItemNode`, `CodeNode`, `CodeHighlightNode`, `LinkNode`, `AutoLinkNode`, `HorizontalRuleNode`, `TableNode`, `TableCellNode`, `TableRowNode`). Single source of truth shared by headless + mount paths.                                                                                                                                                                                                                                                                                                                   | n/a — re-derived from `MarkdownEditor.tsx`'s `initialConfig.nodes` with a comment about drift |
| `createTestHeadlessEditor(options?)`       | `createHeadlessEditor` from `@lexical/headless` pre-loaded with `MARKDOWN_EDITOR_NODES` and `onError: e => { throw e }`. Runs purely in JS — does not mount into the browser DOM, so it is the fastest path for tests that don't need a real editor. (Note: `@lexical/headless` is not in Cork's current `dependencies` — it must be added as a new `devDependency` pinned to the same `0.45.0` as the rest of the `@lexical/*` family. `@lexical/headless` transitively pulls `happy-dom` as an internal implementation detail; we never import from happy-dom directly.)                                                                | `@lexical/headless`                                                                           |
| `$setMarkdown(editor, markdown)`           | Wraps `editor.update(() => $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS), {discrete: true})`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `@lexical/markdown`                                                                           |
| `$readMarkdown(editor)`                    | Wraps `editor.getEditorState().read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS))`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | same                                                                                          |
| `renderTestEditor(options?)`               | Renders a `LexicalComposer` configured like production into the browser-mode page using **`vitest-browser-react`'s `render`** (not `@testing-library/react`'s — `render` here is the Vitest-native one designed for browser mode, returns a locator-aware `screen`). Returns `{editor, screen, user}` where `editor` is captured by a tiny `EditorCapture` component (`const [e] = useLexicalComposerContext()`) and `user` is `userEvent` re-exported from `vitest/browser`. `options.plugins` lets the test add plugins beyond the always-on `RichTextPlugin` + `HistoryPlugin` minimum so each test registers only what it asserts on. | `vitest-browser-react`, `vitest/browser`                                                      |
| `dispatchKeyDown(editor, key, modifiers?)` | Tiny wrapper that builds a Lexical-friendly mock `KeyboardEvent` and dispatches the right `KEY_*_COMMAND`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Lexical's `keyboardEvent` / `tabKeyboardEvent` patterns                                       |

**Not exported** in the initial slice (add when needed): clipboard mocks, DataTransfer mocks, prettify-HTML helpers, presets that register every production plugin. Lexical exports these but we don't need them yet.

**Why not pass the production `<MarkdownEditor>` itself to `render`?** `MarkdownEditor` does not expose its inner `editor` instance via ref, so capturing it from outside would require a production-code change (`forwardRef` an imperative handle just for tests). Building a small in-test `LexicalComposer` whose `initialConfig` mirrors the production one keeps that change out of the production tree — at the cost of a drift risk we mitigate by sharing `MARKDOWN_EDITOR_NODES` and only injecting the plugins each test asks for.

**Why `vitest-browser-react`'s `render` and not `@testing-library/react`'s?** Vitest's browser-mode component-testing guide is explicit: when a Vitest-native renderer exists for the framework you use (it does for React), you use that, not the Testing Library one. The Testing Library bridge (`render` + `page.elementLocator(baseElement)`) is documented for frameworks that don't have an official Vitest browser renderer. Picking the Vitest-native path also gives us automatic before-test cleanup and locator-style queries on the `render` result — and saves us the `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom` install.

**Consequence**: Tests in the initial slice are short. A transformer test is six lines + assertions; a plugin test is twelve lines + assertions. Patterns are obvious enough that a contributor extending the suite picks them up by reading one example.

### Decision 9: Four initial test files — three shapes, four examples

The proposal lists them; the rationale is that **each test exists primarily to prove its pattern works in our setup**, not to provide coverage. Three shapes are covered now; the live-typing-transform shape is reachable with the same helpers but deferred to a follow-up (proposal "Out of scope"):

| Test                         | Proves                                                                                                                                       | Coverage value                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `codeBlock.spec.ts`          | Pure `$`-helper testing with `createTestHeadlessEditor` works under our browser-mode setup (no mount needed).                                | Catches accidental breakage of `$isInsideCodeBlock`                                     |
| `transformers.spec.ts`       | The `MARKDOWN_TRANSFORMERS` array can run a heading round-trip end-to-end in headless.                                                       | One round-trip case                                                                     |
| `transformers.quote.spec.ts` | The Cork-specific nested-blockquote QUOTE transformer round-trips at depth 2.                                                                | Locks in the depth-2 invariant the nested-blockquote feature added                      |
| `QuoteExitPlugin.spec.tsx`   | A plugin registered on a real `LexicalComposer` rendered into the Playwright Chromium page responds to a dispatched `KEY_BACKSPACE_COMMAND`. | Catches regression of the "Backspace on empty trailing quote exits to paragraph" branch |

## Risks / Trade-offs

- **[Playwright install cost and cache invalidation]** → Mitigation: GitHub Actions cache keyed on Playwright version; first cold run pays ~30–60 s, warm runs ~10 s. Documented in tasks.md.
- **[Tauri WebView is WebKit on macOS (WKWebView) and Linux (WebKitGTK); Chromium-only tests miss WebKit-specific bugs on those platforms]** → Mitigation: accepted (Non-Goals). Lexical's own E2E suite covers WebKit; framework-level WebKit gaps are already well-mapped. Adding `{browser: "webkit"}` to `instances[]` is a one-line follow-up if a WebKit-only regression ever surfaces.
- **[Browser mode startup latency per file]** → Mitigation: Vitest reuses the browser context across files in a run; cold start is one-shot per `vitest run`. At four tests the cost is invisible vs. CI install time.
- **[React Compiler compile-time cost in tests]** → Mitigation: accepted (Decision 5). Re-evaluate when the suite is > 50 tests.
- **[Vitest 4 + browser mode + Lexical 0.45 has no public proof point]** → Mitigation: every individual layer is stable independently (`vitest@4.1.9` stable, `@vitest/browser-playwright@4.1.9` stable, `vitest-browser-react@2.2.0` supports React `^18 || ^19` per its published peer deps, Lexical 0.45 stable). The combination is novel here but each layer's failure mode is well-documented. The worktree-install dry-run confirmed the five packages (`vitest`, `@vitest/browser-playwright`, `playwright`, `vitest-browser-react`, `@lexical/headless`) co-install without peer warnings and that `bun run vitest run` reaches the Playwright launch step on Cork's `vite.config.ts` shape (`async () => ({...})`). If Lexical's editor mount specifically hits a browser-mode-only issue we'll learn it on task 8.x and have the option to fall back to jsdom + polyfills for that single test surface (recorded as a fallback, not a default).
- **[Bun + Vitest interaction]** → Mitigation: Vitest is invoked via `bun run test` (the local `vitest` bin's `#!/usr/bin/env node` shebang dispatches to Node). Vitest 4 has no documented Bun-runtime support, so `bunx vitest` (which runs the binary's JS under Bun, ignoring the shebang) is explicitly avoided. Bun's role here is to be the package manager + script runner only.
- **[Test files breaking the molecules-layer lint contract]** → Mitigation: the `.oxlintrc.json` override is narrow (`**/*.spec.{ts,tsx}` + `**/__tests__/**` only) and only disables `no-restricted-imports`. The rest of the rules still apply.
- **[Initial coverage is too thin to catch real regressions]** → Mitigation: explicitly acknowledged. The four POC tests are templates, not coverage. Each subsequent change that touches a plugin or transformer is expected to add the tests it needs as part of its own scope — that work is now cheap because the framework exists.
- **[Disagreement on test placement after the fact]** → Mitigation: Decision 4 + Decision 8 record the directory layout and helper API explicitly so future contributors don't ad-hoc a different one. The MarkdownEditor `AGENTS.md` update lands the same rules in the source tree.

## Open Questions

None blocking. Items deferred to follow-up changes (deliberately, not because they're unresolved):

1. WebKit / Firefox engines in CI — decide once the suite is broader and a cross-engine bug actually surfaces.
2. Floating-UI plugin testing — first concrete attempt will exercise the popover-position contract; defer until a contributor needs to refactor those plugins.
3. Coverage threshold — decide when the suite is large enough that a threshold has signal.
4. `@vitest/ui` browser-mode UI — install as dev convenience? Out of the initial install; add later if anyone asks.
