# Molecules (`src/components/molecules/`)

Small compositions of atoms (+ external icons / utilities). Minimal local state.

## Allowed imports

Atoms, external libraries, and **only** `@/hooks/ui/*` (UI-infra hooks). No organisms / pages / templates, no domain hooks, no `@/api`, no Tauri (enforced by `.oxlintrc.json`).

## Files

| File                       | Role                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `IconButton.tsx`           | Square button wrapping an icon (composes `Button` with an icon child).                   |
| `DialogHeader.tsx`         | Title bar + close button used by every dialog.                                           |
| `DialogFooter.tsx`         | Action row used at the bottom of dialogs.                                                |
| `FormField.tsx`            | Label + control + inline error wrapper.                                                  |
| `DropdownMenu.tsx`         | Anchored menu list (used by task context menu).                                          |
| `ContextMenu.tsx`          | Right-click context menu shell.                                                          |
| `Select.tsx`               | Custom select with portaled popover and keyboard nav.                                    |
| `SearchBar.tsx`            | Title search input. Exposes a `SearchBarHandle` so `BoardPage` can focus it via `Cmd+F`. |
| `FilterButton.tsx`         | Header button with active-count badge.                                                   |
| `FilterRow.tsx`            | One row in the tag-filter popover (operator + operand).                                  |
| `TagEditor.tsx`            | Tag input with autocomplete; exposes `flushPending()` so callers can commit on save.     |
| `TagList.tsx`              | Read-only list of tag chips.                                                             |
| `TagOperandInput.tsx`      | Tag chooser used inside `FilterRow` (single vs multi modes).                             |
| `TagSuggestionPopover.tsx` | Autocomplete popover surfaced by `TagEditor` and `TagOperandInput`.                      |
| `PathDisplay.tsx`          | Truncated workspace path with full-path tooltip.                                         |
| `DragHandle.tsx`           | Generic grip handle used by sortable rows.                                               |
| `WelcomeHero.tsx`          | Logo + CTA block shown on `WelcomePage`.                                                 |
