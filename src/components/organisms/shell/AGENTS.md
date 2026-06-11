# Shell organisms (`src/components/organisms/shell/`)

App-chrome infrastructure. Open to all other organism domains.

## Files

- `AppHeader.tsx` — Top bar with workspace path, task count, settings button. Marked `data-tauri-drag-region="deep"` so the whole header drags the window; the macOS variant left-pads for the traffic-light cluster (`navigator.userAgent` check at module scope). Sits at `relative z-[55]` so it stays above `Modal`'s `z-50` backdrop — the drag region (and traffic-light cluster on macOS) remain reachable while a modal is open. Still below the `z-[60]` popovers (`Select`, `TagSuggestionPopover`) so dropdowns opened inside a modal cover the header normally.
- `Modal.tsx` — `role="dialog" aria-modal="true"` div wrapper with `AnimatePresence`-driven enter/exit. Renders as a regular DOM element (not native `<dialog>`) so toasts and other high-`z-index` UI render above it — native `<dialog>.showModal()` puts the modal in the browser top layer where the global Sonner Toaster cannot reach. Provides:
  - Initial-focus override via `[data-autofocus]`. Falls back to focusing the container itself so no button gets a stray focus ring.
  - Backdrop click closes; backdrop `mousedown` `preventDefault` keeps focus on the active field so its blur-driven save runs before the close.
  - Focus trap via `useFocusTrap` so Tab cycles within the modal.
  - Escape via `useEscapeKey`; deferred when a `[data-floating-popup="true"]` element is present so child Select / Popover handle it first.
  - Automatic stacking via `useIsTopOfModalStack` (`hooks/ui/useModalStack`): every mounted modal registers in a module-level LIFO stack, and only the topmost one keeps its focus trap, Escape handler, and pointer interaction live. Lower modals go inert until the upper one closes. This works for nested modals AND for independently-rooted siblings (e.g. opening Settings via `Cmd+,` while a task detail dialog is open) — no `inert` prop drilling required.
  - Panel width via the dedicated `maxWidthClassName` prop (default `max-w-md`). The base panel deliberately carries **no** `max-w-*` so this is the sole width source — passing one through `containerClassName` instead would lose the cascade fight (Tailwind emits `max-w-md` after the larger `max-w-*` utilities, so an equal-specificity base width would win). `containerClassName` is for non-width extras only.
- `TagFilterPopover.tsx` — Floating tag-filter panel. Positions via `useAnchorRect`, dismisses via `useClickOutside` (with `ignorePortalPopups` so its own Select / suggestion popovers don't close it). Tab is trapped inside the panel via `useFocusTrap`. No auto-focus on open: the trap's "outside container → first focusable" branch pulls focus in on the first Tab, which is enough and avoids a stray focus ring on the first Select for mouse users (same reasoning as `Modal.tsx`'s `[data-autofocus]` opt-in). Focus is restored to the anchor button on close.
