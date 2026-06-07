# Templates (`src/components/templates/`)

Layout skeletons with slots. No data, no local state, no side-effects (enforced by `.oxlintrc.json` — templates may not import pages, hooks, `@/api`, or Tauri).

## Files

- `BoardLayout.tsx` — Header / toolbar / scrollable column row used by `BoardPage`.
- `WelcomeLayout.tsx` — Centered full-screen container used by `WelcomePage`.
