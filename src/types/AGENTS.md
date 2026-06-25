# Domain types (`src/types/`)

Shared TypeScript types. Files mirror the backend's domain split (kept in sync manually with `src-tauri/`).

## Files

- `task.ts` — `Task` (fields persisted in frontmatter + identity) and `TaskUpdates` (sparse update payload sent to the backend).
- `status.ts` — `StatusEntry` (persisted shape) and `EditingEntry` (UI-only `id` for stable React keys during edit).
- `filter.ts` — `TagFilterOperator` (the discriminator union), `TagFilter` (UI form with `id` for React keys), `StoredFilter` (the persisted form sent to the backend).
- `mcp.ts` — `McpSettings` (the persisted `enabled` / `token` shape), `McpStatus` (the discriminated `stopped` / `running` / `failed` server-state union), and `McpSetupSnippet` (a backend-generated per-tool setup snippet: `tool` / `hint` / `code`).
- `updater.ts` — `UpdaterState` (the discriminated `idle` / `checking` / `available` / `downloading` / `installing` / `error` union driven by `useUpdater`). Living in `@/types` (not `@/hooks`) is what lets the organism `UpdaterToast` consume it without breaking the `@/components → @/hooks` import ban in `.oxlintrc.json`.
- `index.ts` — Public barrel.
