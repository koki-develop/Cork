## Why

タスクの並び替え（ドラッグ&ドロップによる再配置）は UI 上は可能だが、その順序はどこにも保存されていない。現在はタスク一覧を alphabetical sort しているため、画面をリロードすると順序が失われる。ファイルの frontmatter に `order` フィールドを追加し、順序を永続化する。

## What Changes

- `Frontmatter` 構造体に `order: Option<f64>` を追加（frontmatter に `order` がない場合は `None`）
- `Task` 構造体 / TypeScript の `Task` 型に `order` フィールドを追加
- Rust の `replace_frontmatter_status` を汎用的な `update_frontmatter` に変更し、任意のフィールドを書き換え可能にする
- カラム内（intra-column）のドラッグ&ドロップ並び替えを有効化する。移動時は Fractional Indexing で `order` の中間値を割り当てる `update_task_order` コマンド、精度不足時のフォールバック `renumber_tasks` コマンドを追加
- `list_tasks` のソート順を alphabetical → `order` 昇順 + alphabetical fallback に変更
- **BREAKING**: なし。`order` がない既存ファイルは alphabetical sort で後方互換を保つ

## Capabilities

### New Capabilities

- `task-order-persistence`: タスクの frontmatter に `order` フィールドを保存し、タスクの表示順を永続化する。Rust コマンドで order の更新を行い、`list_tasks` で order 順にソートして返す。
- `intra-column-reorder`: 同一カラム内でのドラッグ&ドロップによるタスクの並び替えを有効化する。並び替え後、新しい順序を `task-order-persistence` 経由で frontmatter に保存する。

### Modified Capabilities

- なし

## Impact

- **Rust バックエンド** (`lib.rs`): `Frontmatter`、`Task` に `order: Option<f64>` 追加。新しいコマンド `update_task_order` + `renumber_tasks` を追加。`replace_frontmatter_status` を汎用化。`list_tasks` のソート順変更。
- **TypeScript フロントエンド**:
  - `types/index.ts`: `Task` に `order: number | null` 追加
  - `hooks/useBoardDragState.ts`: intra-column のドラッグ処理追加、handleDragEnd で order 保存の invoke を追加
  - `hooks/useWorkspace.ts`: 新しい invoke ラッパー追加
  - `components/board/Card.tsx`, `Column.tsx`: intra-column reorder のための設定変更
- **既存データ**: `order` がない markdown ファイルは alphabetical sort で表示される（後方互換）
