# Shell organisms (`src/components/organisms/shell/`)

App-chrome infrastructure. Open to all other organism domains.

## Files

- `AppHeader.tsx` — Top bar with workspace path, task count, settings button. Marked `data-tauri-drag-region="deep"` so the whole header drags the window; the macOS variant left-pads for the traffic-light cluster (`navigator.userAgent` check at module scope).
- `Modal.tsx` — Native `<dialog>` wrapper with `AnimatePresence`-driven enter/exit. Provides:
  - Initial-focus override via `[data-autofocus]` (React's `autoFocus` prop runs while the dialog is still `display:none` so the focus is dropped). Falls back to focusing the dialog itself so no button gets a stray focus ring.
  - Backdrop click closes; backdrop `mousedown` `preventDefault` keeps focus on the active field so its blur-driven save runs before the close.
  - `inert` prop for stacked dialogs (native `showModal()` doesn't auto-inert parents — Tab can leak focus underneath without this).
  - Cancels Escape when a `[data-floating-popup="true"]` element is present so child Select / Popover handle it first.
- `TagFilterPopover.tsx` — Floating tag-filter panel. Positions via `useAnchorRect`, dismisses via `useClickOutside` (with `ignorePortalPopups` so its own Select / suggestion popovers don't close it).
