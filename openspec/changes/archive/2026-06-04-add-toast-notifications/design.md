## Context

Cork has no global feedback mechanism. Inline error banners exist (`ErrorBanner`) but only for forms. After async actions (task create, drag-and-drop reorder, status mutations), the user sees no confirmation or error state. `sonner` is a lightweight (2.8 kB gzipped) toast library with built-in dark mode support, accessible ARIA live regions, and a React `<Toaster />` outlet component.

## Goals / Non-Goals

**Goals:**

- Add sonner `<Toaster />` outlet to the app root (in `App.tsx`) so toasts are available globally
- Style the Toaster to match Cork's existing dark theme (`cork-bg`, `cork-surface`, `cork-border`, `cork-text`, `cork-accent`)
- Add `toast()` / `toast.success()` / `toast.error()` calls at the **page level** (`BoardPage`) and in organism components that receive handler props
- Initial scope: only on **task creation completion** (success and error)
- Auto-dismiss toasts after 3-5 seconds (per UX guidelines); errors persist until dismissed
- Use `sonner` directly (no custom wrapper) — the library is already ergonomic and wrapping adds unnecessary indirection

**Non-Goals:**

- No custom toast component creation — sonner's built-in variants (success/error/info/loading) suffice
- No changes to `src/api/`, `src/hooks/`, or `src/lib/` — toast is a UI-only concern
- No queue/rate-limiting — sonner handles stacking natively

## Decisions

| Decision         | Choice                                                                   | Alternatives Considered                       | Rationale                                                                             |
| ---------------- | ------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Library          | `sonner`                                                                 | `react-hot-toast`, `react-toastify`           | User-specified; dark-mode native; smallest bundle; React 19 compatible                |
| Placement        | `<Toaster />` in `App.tsx`                                               | In `BoardPage.tsx`                            | WelcomePage also needs toast capability; single global outlet                         |
| Styling          | Use sonner's `theme` + `className`/`style` props with Cork CSS variables | Custom CSS-in-JS                              | Sonner supports `theme="dark"` out of the box; `toastOptions` API overlays our tokens |
| Toast caller     | Direct `toast()` calls at page/organism layer                            | Custom hook `useToast` wrapper                | Wrapping adds no value — sonner's API is already minimal                              |
| Dismiss duration | 4s default, errors persist until dismissed                               | Uniform 3s or 5s                              | UX guidelines (3-5s); errors are critical and should not auto-dismiss                 |
| Position         | `bottom-right`                                                           | `top-right` (sonner default), `bottom-center` | Desktop convention for non-blocking notifications; avoids overlapping header          |

## Risks / Trade-offs

- **[Low] Toast calls spread across components**: Not centralized, but sonner is stable API — easy to audit via `grep` at any time
- **[Low] Organisms calling `toast()` directly violates import rules**: Mitigation by wrapping toast in handler props passed from pages, consistent with existing pattern
- **[None] Bundle size increase**: 2.8 kB gzipped — negligible
