import {
  CODE_LANGUAGE_FRIENDLY_NAME_MAP,
  CODE_LANGUAGE_MAP,
  getCodeLanguages,
} from "@lexical/code-prism";
// `@lexical/code-prism`'s `FacadePrism.ts` only side-effect-imports 12 Prism
// grammars (→ 17 friendly-name entries incl. aliases like `js`/`xml`/`html`) —
// no Ruby, Go, Kotlin, PHP, C#, Bash, JSON, YAML, JSX/TSX, SCSS/Less, or any
// config/data format. This file extends that bundled set. Prism grammars are
// order-dependent (`Prism.languages.extend('clike', ...)` throws if `clike`
// isn't registered yet), so every import below is grouped by what it needs.
// `import "prismjs"` + the four base grammars are repeated here (not just
// left to `@lexical/code-prism`) so this module has no load-order dependency
// on being imported after `@lexical/code-prism` — re-importing an
// already-evaluated ES module is a no-op.
import "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-java";
// Needs only `clike`.
import "prismjs/components/prism-go";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-dart";
import "prismjs/components/prism-groovy";
import "prismjs/components/prism-protobuf";
// Needs `java`.
import "prismjs/components/prism-scala";
// Needs `markup` + `javascript`, then `typescript` on top of that.
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
// Needs `markup-templating`, which itself needs `markup`.
import "prismjs/components/prism-markup-templating";
import "prismjs/components/prism-php";
// Needs `css`.
import "prismjs/components/prism-scss";
import "prismjs/components/prism-less";
// No dependencies.
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-ini";
import "prismjs/components/prism-makefile";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-lua";
import "prismjs/components/prism-perl";
import "prismjs/components/prism-r";
import "prismjs/components/prism-elixir";
import "prismjs/components/prism-haskell";
import "prismjs/components/prism-graphql";
import "prismjs/components/prism-nginx";

// Friendly labels for everything this file adds. Not `markup-templating` —
// it exists only to let `prism-php` run and is never a fence's own language.
const CORK_LANGUAGE_FRIENDLY_NAMES: Record<string, string> = {
  go: "Go",
  ruby: "Ruby",
  kotlin: "Kotlin",
  csharp: "C#",
  dart: "Dart",
  groovy: "Groovy",
  protobuf: "Protocol Buffers",
  scala: "Scala",
  jsx: "JSX",
  tsx: "TSX",
  php: "PHP",
  scss: "Sass (SCSS)",
  less: "Less",
  bash: "Bash",
  json: "JSON",
  yaml: "YAML",
  toml: "TOML",
  ini: "INI",
  makefile: "Makefile",
  docker: "Docker",
  lua: "Lua",
  perl: "Perl",
  r: "R",
  elixir: "Elixir",
  haskell: "Haskell",
  graphql: "GraphQL",
  nginx: "nginx",
};

// Typed-alias shortcuts. Prism itself already dual-registers several of
// these as their own `Prism.languages` keys the moment a component is
// imported (`ruby`→`rb`, `kotlin`→`kt`/`kts`, `csharp`→`cs`/`dotnet`,
// `bash`→`sh`/`shell`, `yaml`→`yml`, `docker`→`dockerfile`) — that's enough
// for `CORK_BUNDLED_LANGUAGES` (below) to highlight them correctly, since it
// reads `Prism.languages` directly. But `normalizeCorkCodeLanguage` /
// `getCorkLanguageFriendlyName` never touch `Prism.languages` — they only
// resolve through this table — so every one of those Prism-side aliases
// still needs its own entry here, or a fence written as ` ```cs ` would
// highlight fine yet show the raw "cs" chip instead of "C#".
const CORK_LANGUAGE_ALIASES: Record<string, string> = {
  golang: "go",
  rb: "ruby",
  kt: "kotlin",
  kts: "kotlin",
  cs: "csharp",
  dotnet: "csharp",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  dockerfile: "docker",
  ex: "elixir",
  exs: "elixir",
  hs: "haskell",
  proto: "protobuf",
  make: "makefile",
};

// Merged with upstream's 17-entry `CODE_LANGUAGE_FRIENDLY_NAME_MAP` — the
// full dropdown option list (`FloatingCodeLanguageEditorPlugin.tsx`) is built
// by enumerating this object, which is safe (enumeration, not an
// attacker-controlled-key lookup).
export const CORK_LANGUAGE_FRIENDLY_NAME_MAP: Record<string, string> = {
  ...CODE_LANGUAGE_FRIENDLY_NAME_MAP,
  ...CORK_LANGUAGE_FRIENDLY_NAMES,
};

// `Map`s, not lowercased-bracket lookups against the merged plain objects
// above — a plain object inherits `Object.prototype`, so a stored/typed
// language string that happens to match a built-in property name
// ("constructor", "toString", ...) would resolve to a function instead of
// falling through to the id itself. These two lookups take a stored (from a
// fenced code block's info string) or free-typed language, so both need to
// stay collision-proof. Every key in both source objects is authored
// lowercase, so `CORK_LANGUAGE_ALIAS_BY_ID` is exported as-is —
// `FloatingCodeLanguageEditorPlugin.tsx` looks up its already-lowercased
// typed text against it directly, no separate case-folded copy needed.
export const CORK_LANGUAGE_ALIAS_BY_ID = new Map<string, string>([
  ...Object.entries(CODE_LANGUAGE_MAP),
  ...Object.entries(CORK_LANGUAGE_ALIASES),
]);
const CORK_LANGUAGE_FRIENDLY_NAME_BY_ID = new Map(Object.entries(CORK_LANGUAGE_FRIENDLY_NAME_MAP));

// Drop-in replacement for `@lexical/code-prism`'s `normalizeCodeLanguage`
// that also resolves this file's own alias table.
export function normalizeCorkCodeLanguage(lang: string): string {
  return CORK_LANGUAGE_ALIAS_BY_ID.get(lang) ?? lang;
}

// Drop-in replacement for `@lexical/code-prism`'s `getLanguageFriendlyName`
// that also resolves this file's own friendly-name table. Map-backed (see
// above), so — unlike upstream's version — this can never return a
// function instead of a string.
export function getCorkLanguageFriendlyName(lang: string): string {
  const normalized = normalizeCorkCodeLanguage(lang);
  return CORK_LANGUAGE_FRIENDLY_NAME_BY_ID.get(normalized) ?? normalized;
}

// `getCodeLanguages()` re-walks `Object.keys(Prism.languages).filter(...).sort()`
// on every call, so `CodeBlockHighlightPlugin.ts` snapshots it once into a Set
// for O(1) membership lookups per keystroke. Computed HERE (not there) and
// exported, so the snapshot is only ever taken after every side-effect import
// above this line has run — by construction, not because some unrelated named
// import of this module happens to pull those side effects in first. A caller
// that imports only `CORK_BUNDLED_LANGUAGES` still gets the full set.
export const CORK_BUNDLED_LANGUAGES: ReadonlySet<string> = new Set(getCodeLanguages());
