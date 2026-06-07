# Domain types (`src/types/`)

Shared TypeScript types. Files mirror the backend's domain split (kept in sync manually with `src-tauri/`).

## Files

- `task.ts` — `Task` (fields persisted in frontmatter + identity) and `TaskUpdates` (sparse update payload sent to the backend).
- `status.ts` — `StatusEntry` (persisted shape) and `EditingEntry` (UI-only `id` for stable React keys during edit).
- `filter.ts` — `TagFilterOperator` (the discriminator union), `TagFilter` (UI form with `id` for React keys), `StoredFilter` (the persisted form sent to the backend).
- `index.ts` — Public barrel.
