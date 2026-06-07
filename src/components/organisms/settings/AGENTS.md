# Settings organisms (`src/components/organisms/settings/`)

Settings dialog and its parts. Must not import from `board/` (enforced by `.oxlintrc.json`).

## Files

- `SettingsDialog.tsx` — Settings modal shell. Composes `WorkspaceDirectoryField` and `StatusList`.
- `WorkspaceDirectoryField.tsx` — Path display + "pick another folder" button. Delegates to the `onPickDirectory` handler passed by `BoardPage`.
- `StatusList.tsx` — Editable, sortable status list. Owns its own `DragDropProvider` because the DnD scope is self-contained (no cross-talk with the board lane DnD).
- `StatusRow.tsx` — One row: drag handle, label `<input>`, remove button.

## Conventions

- Status edits are driven by `useStatusEdit` (from `@/hooks`) and threaded down through `SettingsDialog` props.
- The dialog close flow (`flush` then close, or surface error inline) lives in `BoardPage.handleSettingsClose`. Keep the persistence semantics there so the organism stays pure-UI.
