## 1. Rust Backend

- [x] 1.1 Add `delete_task` command to `src-tauri/src/lib.rs` with canonicalize + workspace boundary check
- [x] 1.2 Register `delete_task` in `tauri::generate_handler!`

## 2. API Layer

- [x] 2.1 Add `deleteTask(path: string)` wrapper in `src/api/tasks.ts`
- [x] 2.2 Re-export `deleteTask` from `src/api/index.ts`

## 3. DropdownMenu Molecule

- [x] 3.1 Create `src/components/molecules/DropdownMenu.tsx` with trigger + items props, click-outside and Escape handling
- [x] 3.2 Re-export `DropdownMenu` and `DropdownMenuProps` from `src/components/molecules/index.ts`

## 4. TaskDetailDialog

- [x] 4.1 Add `onDeleteTask: () => Promise<void>` prop to `TaskDetailDialogProps`
- [x] 4.2 Add `deleteConfirmOpen` state and handler in `TaskDetailDialog`
- [x] 4.3 Add `DropdownMenu` (MoreHorizontal trigger, Trash2 Delete item) to the dialog header
- [x] 4.4 Add confirmation `Modal` (warning text, Cancel / Delete buttons, error display, loading state)

## 5. BoardPage Wiring

- [x] 5.1 Add `deleteTask` prop to `BoardPageProps` and `BoardPage`
- [x] 5.2 Implement `handleDeleteTask` (calls `deleteTask`, shows toast, closes dialog)
- [x] 5.3 Pass `onDeleteTask` to `TaskDetailDialog`

## 6. App / useWorkspace Wiring

- [x] 6.1 Wire `deleteTask` API through `useWorkspace` (or `App.tsx`) down to `BoardPage`
