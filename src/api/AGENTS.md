# Tauri command wrappers (`src/api/`)

Thin wrappers around `invoke()` / `listen()`. The **only** place in `src/` allowed to import `@tauri-apps/api/core` or `@tauri-apps/api/event`.

## Files

- `tasks.ts` — Task CRUD: `listTasks`, `listAllTags`, `getTask`, `createTask`, `moveTask`, `renumberTasks`, `updateTask`, `deleteTask`, and `reconcileExternalStatusChanges` (re-scan task frontmatter after external edits). `TagFilter` is normalized to `StoredFilter` before sending.
- `statuses.ts` — Status list: `getStatuses`, `saveStatuses` (the optional `renameMap` argument drives the backend's task-frontmatter migration on label rename).
- `workspace.ts` — Workspace dir + persisted filters: `pickDirectory`, `getWorkspaceDirectory`, `setWorkspaceDirectory`, `listWorkspaceHistory` (recent workspaces filtered to still-existing directories, backs the WelcomePage picker), `getWorkspaceFilters`, `setWorkspaceFilters`.
- `mcp.ts` — Embedded MCP server (process-global, not per-window): `getMcpSettings`, `updateMcpSettings`, `generateMcpToken`, `getMcpSampleConfig`, `getMcpServerStatus`, and `onMcpSettingsChange` (subscription wrapper around the `tauri-plugin-store` `store://change` event filtered to the `mcp` key — replaces frontend polling for cross-window sync). Settings persist under the top-level `mcp` key of `settings.json`.
- `menu.ts` — Native menu events: `onOpenSettings` (subscription to `menu:open-settings`).
- `index.ts` — Public barrel.

## Rules

- May only import `@tauri-apps/*` and `@/types`. No React, no `@/components`, no `@/hooks`, no `@/lib` (enforced by `.oxlintrc.json`).
- Keep wrappers thin: type the response and shape the payload, but don't add domain logic — that belongs in `@/lib` or `@/hooks`.
- Tauri command names (snake_case) and the backend's argument shapes live in `src-tauri/`; this directory is the single JS-side source of truth for their names and types.
