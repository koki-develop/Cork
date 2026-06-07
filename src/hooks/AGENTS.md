# React hooks (`src/hooks/`)

Two tiers:

- **Top-level `useX.ts`** — Domain hooks. Workspace state, side-effects via `@/api`. Only `App.tsx` and `pages/` may import these.
- **`ui/useX.ts`** — UI-infra hooks. Generic DOM / interaction helpers. Free to import from `molecules/` and `organisms/`. No `@/api`.

Hooks must not import from `@/components` (enforced by `.oxlintrc.json`). Tauri side-effects go through `@/api`, not direct `invoke()` / `listen()`. Filesystem watching (`@tauri-apps/plugin-fs`) is allowed here because the watcher is stateful and pairs with the React lifecycle.

## Domain hooks

- `useCurrentDir.ts` — Loads the persisted workspace dir on mount; owned by `App.tsx`.
- `useWorkspace.ts` — Composite hook called by `BoardPage`. Aggregates `useWorkspaceStatuses`, `useWorkspaceTasks`, `useFilterStore`, and `useWorkspaceWatcher` into the board's data API.
- `useWorkspaceStatuses.ts` — Status list state. Seeds the `Todo / Doing / Done` default when the backend has no `.cork.json` yet.
- `useWorkspaceTasks.ts` — Task list state. Owns the optimistic create / move / update / delete flow and the `requestIdRef` race-guard against overlapping `listTasks` responses.
- `useFilterStore.ts` — Tag-filter state with debounced persistence (`SAVE_DEBOUNCE_MS`).
- `useWorkspaceWatcher.ts` — Wraps `@tauri-apps/plugin-fs` `watch()`. Routes `.cork.json` changes vs `.md` changes to different callbacks.
- `useBoardDragState.ts` — dnd-kit handlers for kanban DnD. Computes the drop slot via `computeDropOrder` and handles column-vs-card targets separately (empty-area drops use `columnDropIndex`, not dnd-kit's `move()`, because the lane height pushes the lane center far below the cards).
- `useStatusEdit.ts` — Status edit dialog state. Owns the editing entries, duplicate-label validation, rename-map building, and the `flush` / `reset` discipline used by `SettingsDialog` close.

## UI-infra hooks (`hooks/ui/`)

- `useAnchorRect.ts` — Returns an anchor element's `DOMRect` while `open`, for popover positioning. Positioning-agnostic — callers map the rect to their own shape.
- `useClickOutside.ts` — Outside-click dismissal with `ignorePortalPopups` (for portaled Select dropdowns) and `primaryButtonOnly` (for context-menu re-open flicker).
- `useEscapeKey.ts` — Global Escape handler.
- `useFocusTrap.ts` — Tab / Shift+Tab focus trap. Used by `Modal.tsx` and `TagFilterPopover.tsx`. Defers to `[data-floating-popup]` portals so child Select / autocomplete dropdowns can handle Tab themselves.
- `useDialogError.ts` — Trivial `{ error, setError, clearError }` state.
- `useFieldError.ts` — Field-tagged dialog error with a `peek()` ref so async handlers read the latest value without stale closures.
- `useTagEditorController.ts` — Bridges to `TagEditor`'s imperative `flushPending()` so a parent can commit a pending tag input before saving.
