## Why

タスク詳細ダイアログから直接タスクを削除する手段がない。現状、タスクを削除するにはワークスペースディレクトリを Finder などで開いて Markdown ファイルを手動削除するしかなく、アプリ内でのワークフローが完結しない。

## What Changes

- タスク詳細ダイアログのヘッダーに 3 点メニューボタン（`MoreHorizontal` アイコン）を追加する
- メニューを開いて「Delete」を選択すると確認 Modal が表示される
- 確認後、対応する Markdown ファイルをワークスペースから削除し、ダイアログを閉じる
- 再利用可能な `DropdownMenu` molecule を新規作成する
- Rust バックエンドに `delete_task` コマンドを追加する

## Capabilities

### New Capabilities

- `task-delete`: タスク詳細ダイアログからタスクを削除する機能（メニューボタン → 確認 Modal → ファイル削除）

### Modified Capabilities

- `task-detail-dialog`: 削除メニューボタンと `onDeleteTask` prop の追加（既存の表示・編集要件に対する変更）

## Impact

- `src-tauri/src/lib.rs`: `delete_task` コマンドの追加
- `src/api/tasks.ts`: `deleteTask` API ラッパーの追加
- `src/api/index.ts`: `deleteTask` の再エクスポート
- `src/components/molecules/DropdownMenu.tsx`: 新規作成
- `src/components/molecules/index.ts`: `DropdownMenu` の再エクスポート追加
- `src/components/organisms/board/TaskDetailDialog.tsx`: メニューボタン・確認 Modal・`onDeleteTask` prop の追加
- `src/components/pages/BoardPage.tsx`: `deleteTask` prop・`handleDeleteTask` ハンドラーの追加
- `src/hooks/useWorkspace.ts` / `src/App.tsx`: `deleteTask` のワイヤリング
