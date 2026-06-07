# Shell organisms (`src/components/organisms/shell/`)

App-chrome infrastructure. Open to all other organism domains.

## Files

- `AppHeader.tsx` — Top bar with workspace path, task count, settings button. Marked `data-tauri-drag-region="deep"` so the whole header drags the window; the macOS variant left-pads for the traffic-light cluster (`navigator.userAgent` check at module scope).
- `Modal.tsx` — `role="dialog" aria-modal="true"` div wrapper with `AnimatePresence`-driven enter/exit. Renders as a regular DOM element (not native `<dialog>`) so toasts and other high-`z-index` UI render above it — native `<dialog>.showModal()` puts the modal in the browser top layer where the global Sonner Toaster cannot reach. Provides:
  - Initial-focus override via `[data-autofocus]`. Falls back to focusing the container itself so no button gets a stray focus ring.
  - Backdrop click closes; backdrop `mousedown` `preventDefault` keeps focus on the active field so its blur-driven save runs before the close.
  - Focus trap via `useFocusTrap` so Tab cycles within the modal.
  - Escape via `useEscapeKey`; deferred when a `[data-floating-popup="true"]` element is present so child Select / Popover handle it first.
  - `inert` prop for stacked modals — disables this modal's focus trap, Escape handler, and pointer interaction so the nested modal owns input.
- `TagFilterPopover.tsx` — Floating tag-filter panel. Positions via `useAnchorRect`, dismisses via `useClickOutside` (with `ignorePortalPopups` so its own Select / suggestion popovers don't close it). Tab is trapped inside the panel via `useFocusTrap`. No auto-focus on open: the trap's "outside container → first focusable" branch pulls focus in on the first Tab, which is enough and avoids a stray focus ring on the first Select for mouse users (same reasoning as `Modal.tsx`'s `[data-autofocus]` opt-in). Focus is restored to the anchor button on close.
