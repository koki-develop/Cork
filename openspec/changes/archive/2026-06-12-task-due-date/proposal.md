## Why

タスクには「いつまでに」という期日の概念がなく、Kanban ボード上で締め切りを管理できない。期日をタスクに設定し、ボードのカードで一目で締め切りの近さ・超過を把握できるようにすることで、ローカル Markdown ベースのタスク管理ツールとしての実用性を高める。

## What Changes

- タスクの frontmatter キー `date`（`YYYY-MM-DD` 形式の文字列、日付のみ）に期日を保持できるようにする。未設定 / `null` / 不正値は「期日なし」として扱う。
- `create_task` / `update_task` Tauri コマンドに `date` を追加する。`update_task` は `tags` と同じ 3 状態（Keep / Set / Clear）セマンティクスを空文字センチネルで表現する。
- `get_task` / `list_tasks` が返す `Task` に `date: string | null` を追加する。
- 作成ダイアログ・詳細ダイアログのサイドバーに「Date」フィールドを追加する。入力欄にフォーカスすると**自作のカレンダーポップオーバー**が表示され、カレンダーからの選択と `YYYY-MM-DD` の直接入力の両方をサポートする。クリアも可能。
- Kanban カードに期日バッジを表示する。今日からの相対距離に応じてラベルと色を出し分ける（Today=緑 / Tomorrow=オレンジ / 今週内の近い未来=曜日名・紫 / 期日超過=danger 赤 / それ以外=実日付・muted）。
- MCP `list_tasks` の出力 DTO `McpTask` に `date` を追加する（LLM がタスク調整に使える文脈として有用なため）。
- MCP `create_task` ツールの入力 `CreateTaskInput` にオプショナルな `date` を追加し、LLM からも期日付きでタスクを作成できるようにする。
- `cork` テーマに期日表示用の色トークン（緑 / オレンジ系）を追加する。

## Capabilities

### New Capabilities

- `task-dates`: タスクの期日（frontmatter `date`）の保持・パース、`create_task` / `update_task` での書き込みセマンティクス、ダイアログでの日付入力 + カレンダー UI、Kanban カードでの相対日付表示（ラベル・色分け）を定義する。

### Modified Capabilities

- `mcp-server`: `list_tasks` ツールが返す各タスクに `date` フィールドを追加し（`McpTask` DTO の拡張）、`create_task` ツールがオプショナルな `date` 入力を受け付けるようにする。

## Impact

- **Rust (`src-tauri/`)**:
  - `task.rs`: `Task` / `TaskFrontmatter` に `date` 追加、`get_task` / `write_task_file` / `create_task` / `update_task` の date 対応（Clear 時は `frontmatter::remove_keys`）、不正値フォールバックの lenient deserialize。
  - `mcp.rs`: `McpTask` に `date` フィールド追加（`list_tasks` / `create_task` / `delete_task` の全 McpTask 生成箇所を更新）、`CreateTaskInput` に `date` 追加、`create_task` ハンドラから `write_task_file` への配線。
- **Frontend (`src/`)**:
  - `types/task.ts`: `Task.date` / `TaskUpdates.date` 追加。
  - `lib/task.ts`: `TaskFormSnapshot` / `computeDirtyUpdates` / `withTaskUpdates` の date 対応。
  - `lib/date.ts`（新規）: `YYYY-MM-DD` のパース / フォーマット、相対日付ラベル・カテゴリ判定の純粋関数。
  - `api/tasks.ts`: `createTask` / `updateTask` のシグネチャ拡張。
  - `components/atoms/Calendar`（新規）, `components/molecules/DateField`（新規）, `components/molecules/DateBadge`（新規、カード用）。
  - `CreateTaskDialog` / `TaskDetailDialog` / `useTaskDialogState` / `KanbanCard` の date 配線。
  - `style.css`: 期日色トークン追加。
- **Specs**: `openspec/specs/task-dates/spec.md`（新規）, `openspec/specs/mcp-server/spec.md`（`date` フィールド追記）。
- **後方互換性**: `date` 未設定の既存タスクは「期日なし」として従来通り動作する。MCP の `date` は追加フィールドのため既存クライアントへの破壊的変更はない。
