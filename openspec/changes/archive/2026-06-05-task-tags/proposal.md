## Why

Cork のタスクは現在 `title` / `status` / `body` / `order` の4つのフィールドしか持たない。利用者が「種別 (bug / feature)」「優先度 (P0)」「領域 (frontend / backend)」のような横断的な属性で複数タスクを束ねたいときに表現手段が無く、`title` に手書きでプレフィックスを足したり `body` 本文に頼るしかない。Markdown ファイルとしての可搬性を保ちながら、ステータスやカラム分割では表現しづらい多軸の分類を扱える必要がある。

## What Changes

- タスクの YAML frontmatter に `tags: [string, ...]` を追加する。文字列の配列で、`null` / 空配列 / キー欠落はいずれも「タグ無し」と同じ扱いにする。
- `Task` 型 (Rust 側 `task::Task`、TypeScript 側 `src/types/task.ts`) に `tags: string[]` を追加する。
- `list_tasks` / `get_task` の戻り値に `tags` を含める。
- `create_task` / `update_task` Tauri コマンドに `tags: Option<Vec<String>>` パラメータを追加する。`update_task` では `None` のとき既存タグを保持し、`Some(_)` で完全置換する (= "patch" ではなく "set")。
- フロントエンド API ラッパー (`src/api/tasks.ts` 相当) と `useWorkspace` フック経由の楽観的更新ロジックに `tags` を伝搬する。
- `KanbanCard` の本文プレビュー下にタグチップ列を追加し、最大3つまで表示・超過分は `+N` のオーバーフロー表示にする。
- `TaskDetailDialog` に "Tags" フィールドを追加する。チップ + 入力欄のコンビ UI で、Enter / カンマ / blur でチップ化、入力欄空のときの Backspace で末尾チップを削除する。タグ編集の保存タイミングは他フィールド (status は即時、それ以外は blur) と同じ「ダイアログ閉じ時のフラッシュ + 即時 (チップ追加削除時)」とする。
- `CreateTaskDialog` (新規作成ダイアログ) にも `TagEditor` を組み込み、作成時点でタグを設定できるようにする。`onCreateTask` のシグネチャに `tags: string[]` を 4 番目の引数として追加する。
- 既存仕様 `task-detail-dialog` と `backend-update-task` に「タグの保存・表示」要件を追記する。

## Capabilities

### New Capabilities

- `task-tags`: タスクが文字列配列のタグを持てるようになる機能。frontmatter 形式 (`tags: [...]`)、`Task` モデルへの反映、`list_tasks` / `get_task` での読み取り、`create_task` / `update_task` での書き込み、ボード上での表示と詳細ダイアログでの編集 UI を含む。

### Modified Capabilities

- `task-detail-dialog`: 詳細ダイアログのフィールドに Tags を追加する。フィールド追加・編集の保存タイミング・キーボード操作要件を追記する。
- `backend-update-task`: `update_task` コマンドの仕様に `tags` パラメータを追加する。`None` / `Some` の挙動と frontmatter 反映の要件を追記する。

## Impact

- **Rust バックエンド (`src-tauri/src/task.rs`)**: `Task` 構造体、`TaskFrontmatter` 構造体、`list_tasks` / `get_task` / `create_task` / `update_task` の 4 コマンドに `tags` を追加。frontmatter のシリアライズで `tags: []` の空配列はキーごと出力しない方針 (ノイズ削減)。
- **frontmatter ヘルパー (`src-tauri/src/frontmatter.rs`)**: 既存の `json_to_yaml` が `serde_json::Value::Array` を Yaml::Array に変換する経路を既にサポートしているため変更不要。`update` の API シグネチャも変更不要 (`(&str, serde_json::Value)` をそのまま流用)。
- **フロントエンド型 (`src/types/task.ts`)**: `Task` インターフェースに `tags: string[]` を追加。null / undefined ではなく常に配列で扱う。
- **フロントエンド API (`src/api/tasks.ts`)**: `createTask` / `updateTask` のオプション型に `tags?: string[]` を追加し invoke で素通し。
- **フロントエンド hook (`src/hooks/useWorkspace.ts` 相当)**: 楽観的更新 (`setTasks`) に `tags` の反映を追加。
- **コンポーネント**:
  - `KanbanCard.tsx` — タグ表示 (`TagList` molecule を新規追加)
  - `TaskDetailDialog.tsx` — Tags フィールド (`TagEditor` molecule を新規追加)
  - `CreateTaskDialog.tsx` — Tags フィールド (`TagEditor` を再利用)
  - `src/components/molecules/TagList.tsx` (新規) — 読み取り専用チップ表示 (最大数 + overflow `+N`)
  - `src/components/molecules/TagEditor.tsx` (新規) — チップ + 追記入力のコンビ UI (作成・詳細の両ダイアログで再利用)
- **テスト (Rust)**: `task.rs` の既存 `#[cfg(test)] mod tests` に `tags` のパース・シリアライズ・往復のテストを追加。
- **依存関係**: 追加無し。Cargo / package.json に変更なし。
- **データ移行**: 不要。既存ファイルに `tags` が無いケースは Rust 側 `#[serde(default)]` で空配列扱い、フロントエンド側もデフォルト `[]` 扱い。下位互換は保たれる。
