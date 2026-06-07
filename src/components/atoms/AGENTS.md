# Atoms (`src/components/atoms/`)

Single-element UI primitives. No domain meaning, no local state, no side-effects.

## Allowed imports

External UI libraries (`clsx`, `lucide-react`, ...) and other atoms only. No molecules / organisms / pages / templates, no hooks, no `@/api`, no Tauri (enforced by `.oxlintrc.json`).

## Files

- `Button.tsx` — Variants: `primary` / `secondary` / `ghost` / `dashed` × colors `default` / `danger` × sizes `sm` / `md` / `lg`. Defaults to `variant="ghost" size="md"`.
- `Input.tsx` — Single-line text input with consistent border / focus styling.
- `AutoresizeInput.tsx` — `<textarea>` that grows with content. Used by the task title field so wrapping doesn't horizontally scroll.
- `Heading.tsx` — Semantic + sized heading.
- `Text.tsx` — Body / muted / label text variants.
- `Badge.tsx` — Numeric / status pill.
- `TagChip.tsx` — Tag pill with `default` / `dismissible` / `draft` variants.
- `ErrorBanner.tsx` — Inline form error block.
