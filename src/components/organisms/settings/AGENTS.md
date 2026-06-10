# Settings organisms (`src/components/organisms/settings/`)

Settings dialog and its parts. Must not import from `board/` (enforced by `.oxlintrc.json`).

## Files

- `SettingsDialog.tsx` — Settings modal shell. Composes `WorkspaceDirectoryField`, `StatusList`, and `McpServerSection`.
- `WorkspaceDirectoryField.tsx` — Path display + "pick another folder" button. Delegates to the `onPickDirectory` handler passed by `BoardPage`.
- `StatusList.tsx` — Editable, sortable status list. Owns its own `DragDropProvider` because the DnD scope is self-contained (no cross-talk with the board lane DnD).
- `StatusRow.tsx` — One row: drag handle, label `<input>`, remove button.
- `McpServerSection.tsx` — Process-global MCP server controls. Pure UI organism that takes the `useMcpSettings` controller bag through props. Owns only a `tokenDraft` buffer locally so a sub-12-character token can sit in the input without being flushed (the backend's `validate_token` would reject it); the draft re-syncs from props whenever the input is unfocused. The token is always displayed in plain text — masking was dropped because the same value is shown verbatim in the adjacent `mcp.json` snippet, so a mask in the input adds noise without real protection.

## Conventions

- Status edits are driven by `useStatusEdit` (from `@/hooks`) and threaded down through `SettingsDialog` props.
- The dialog close flow (`flush` then close, or surface error inline) lives in `BoardPage.handleSettingsClose`. Keep the persistence semantics there so the organism stays pure-UI.
