# Pages (`src/components/pages/`)

Wiring layer. Composes templates + organisms with domain hooks. Local state allowed; the only layer below `App.tsx` that may call `@/api` directly and import top-level `@/hooks/*`.

## Files

- `WelcomePage.tsx` — Empty-state. Calls `pickDirectory` / `setWorkspaceDirectory` and hands the chosen path back to `App` via `onDirectorySelected`.
- `BoardPage.tsx` — The kanban view. The orchestration hub:
  - **Single caller** of `useWorkspace`, `useBoardDragState`, `useStatusEdit`.
  - **Owner of** `settingsOpen`, the `menu:open-settings` subscription (native `Cmd+,`), and the board-scoped `DragDropProvider`.
  - Holds the dialog remount tokens (`createDialogToken`, `detailDialogToken`) used to reset child form state on open while preserving the exit animation on close.
  - Owns the `Cmd+F` (search focus) global shortcut, gated by `anyDialogOpen` so dialogs swallow it.
  - Coordinates the settings dialog close discipline (`flushStatuses` + previous-error snapshot — see `handleSettingsClose`).

`App.tsx` (one level up) owns only `dir` (via `useCurrentDir`) and routes between `WelcomePage` and `BoardPage`. `BoardPage` is keyed on `dir` so workspace switches remount cleanly.

## Allowed imports

Anything below (atoms / molecules / organisms / templates) plus `@/hooks/*` (domain hooks) and `@/api`. No imports from sibling pages.
