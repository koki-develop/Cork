## Why

Cork currently has no global notification system. Errors are shown inline via `ErrorBanner` (used only in forms), and there is no way to surface transient success/info/error feedback to the user after actions like task creation, reordering, or settings changes. Adding `sonner` provides a lightweight, accessible toast system that improves user feedback without introducing heavy dependencies.

## What Changes

- Install `sonner` as a runtime dependency
- Add `Toaster` (sonner's outlet component) to the app root in `App.tsx`
- Initially, show toasts only when a task is created (success and error)
- Use `sonner.toast()` (or `toast.success()`, `toast.error()`, etc.) at the page level (consistent with the existing side-effect boundary pattern)
- Configure sonner styling to match Cork's dark theme tokens (`cork-*` colors)

## Capabilities

### New Capabilities
- `toast-notifications`: Global toast notification system using sonner, covering success, error, and info messages across the app

### Modified Capabilities

- (none)

## Impact

- **Dependencies**: Add `sonner` to `package.json`
- **Components**: `App.tsx` — add `<Toaster />`; `CreateTaskDialog` — add toast on success/error via handler props from `BoardPage`
- **No API/Tauri changes**: Toast is a pure frontend concern
