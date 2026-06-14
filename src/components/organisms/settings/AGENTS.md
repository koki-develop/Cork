# Settings organisms (`src/components/organisms/settings/`)

Settings dialog and its parts. Must not import from `board/` (enforced by `.oxlintrc.json`).

## Files

- `SettingsDialog.tsx` — Settings modal shell. Composes `WorkspaceDirectoryField`, `StatusList`, and `McpServerSection`.
- `WorkspaceDirectoryField.tsx` — Path display + "pick another folder" button. Delegates to the `onPickDirectory` handler passed by `BoardPage`.
- `StatusList.tsx` — Editable, sortable status list. Owns its own `DragDropProvider` because the DnD scope is self-contained (no cross-talk with the board lane DnD).
- `StatusRow.tsx` — One row: drag handle, label `<input>`, remove button.
- `McpServerSection.tsx` — Process-global MCP server controls. Pure UI organism that takes the `useMcpSettings` controller bag through props. Owns only a `tokenDraft` buffer locally so a sub-12-character token can sit in the input without being flushed (the backend's `validate_token` would reject it); the draft re-syncs from props whenever the input is unfocused. The token is always displayed in plain text — masking was dropped because the same value is shown verbatim in the adjacent `mcp.json` snippet, so a mask in the input adds noise without real protection. Renders `McpSetupSnippets` directly below the `mcp.json` block.
- `McpSetupSnippets.tsx` — Tool-by-tool MCP setup helpers shown under the `mcp.json` snippet, one tab per external client (Claude Code / Codex CLI / opencode). The snippet bodies come from the backend (`get_setup_snippets`) so the server name / port / token stay identical to the `mcp.json` block; the backend, not the UI, owns which tools are listed and each one's destination `hint`. Claude Code (`claude mcp add`, `--header "Key: Value"`) and opencode (`opencode mcp add`, `--header KEY=VALUE`) get real CLI commands; Codex is a `config.toml` snippet because `codex mcp add` can't set the required `X-Cork-Workspace` header (it only supports a bearer token). Implements the WAI-ARIA tabs pattern (roving `tabIndex`, arrow / Home / End nav with automatic activation) and renders nothing for an empty snippet list, so it drops in unconditionally next to the "Open a workspace first" mcp.json placeholder.

## Conventions

- Status edits are driven by `useStatusEdit` (from `@/hooks`) and threaded down through `SettingsDialog` props.
- The dialog close flow (`flush` then close, or surface error inline) lives in `BoardPage.handleSettingsClose`. Keep the persistence semantics there so the organism stays pure-UI.
