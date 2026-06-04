## 1. Setup

- [x] 1.1 Install `sonner` dependency via `bun add sonner`

## 2. Toaster outlet

- [x] 2.1 Add `<Toaster />` to `App.tsx` with dark theme and Cork-compatible styling
- [x] 2.2 Configure toast options: `position="bottom-right"`, `duration=4000` (default), errors `duration=Infinity`
- [ ] 2.3 Verify Toaster renders on both WelcomePage and BoardPage (manual — `bun run tauri dev`)

## 3. Page-level toast integration

- [x] 3.1 Wrap `createTask` in `BoardPage` with `handleCreateTask` that calls toast on success/error
- [x] 3.2 Call `toast.success("Task created")` on successful task creation
- [/] 3.3 Call `toast.error(message)` on task creation failure — **removed**: inline ErrorBanner in dialog is sufficient; dual feedback is noisy

## 4. Verify and lint

- [x] 4.1 Run `bunx tsc --noEmit` to verify types
- [x] 4.2 Run `bunx biome check src` to verify lint rules
- [ ] 4.3 Run `bun run tauri dev` for visual smoke test
