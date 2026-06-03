## 1. Rust バックエンド: Frontmatter 関連

- [x] 1.1 `serde_yaml` を `src-tauri/Cargo.toml` に追加する
- [x] 1.2 `Frontmatter` 構造体に `order: Option<f64>` フィールドを追加し、`#[serde(default)]` でデフォルト値を設定する
- [x] 1.3 `replace_frontmatter_status` を、任意のフィールドを更新可能な汎用関数 `update_frontmatter(content: &str, updates: &[(String, serde_json::Value)]) -> String` に置き換える。`gray_matter::Matter::<YAML>::new().parse::<serde_json::Value>()` でパースし、`serde_yaml::to_string()` でシリアライズする
- [x] 1.4 `update_task_status` が新しい `update_frontmatter` 関数を使用するよう変更する

## 2. Rust バックエンド: update_task_order + renumber_tasks コマンド

- [x] 2.1 `Task` 構造体に `order: Option<f64>` を追加する
- [x] 2.2 `update_task_order(path: String, order: f64)` Tauri コマンドを実装する。path の workspace 内検証を行い、該当ファイルの frontmatter の order を書き換える
- [x] 2.3 `renumber_tasks(paths: Vec<String>)` Tauri コマンドを実装する。受け取ったパスのリストに 0.0, 1.0, 2.0, ... を順に割り当てて frontmatter に書き込む
- [x] 2.4 両コマンドを `invoke_handler` に登録する

## 3. Rust バックエンド: list_tasks のソート順変更

- [x] 3.1 `parse_frontmatter` で `order` フィールドを読み取るよう変更する
- [x] 3.2 `list_tasks` のソートを `order` 昇順 → `title` 昇順 fallback に変更する（`f64::MAX` を null の代替値として使用）

## 4. TypeScript 型定義

- [x] 4.1 `src/types/index.ts` の `Task` インターフェースに `order: number | null` を追加する

## 5. フロントエンド: useWorkspace

- [x] 5.1 `useWorkspace` に `updateTaskOrder(path: string, order: number)` コールバックを追加する（`invoke("update_task_order", { path, order })`）
- [x] 5.2 `useWorkspace` に `renumberTasks(paths: string[])` コールバックを追加する（`invoke("renumber_tasks", { paths })`）

## 6. フロントエンド: useBoardDragState

- [x] 6.1 `useBoardDragState` の `Params` に `onTaskOrderUpdate: (path: string, order: number) => Promise<void>` と `onRenumberTasks: (paths: string[]) => Promise<void>` を追加する
- [x] 6.2 `handleDragEnd` 内の card 処理を拡張し、中間値計算＋精度不足時のリナンバリング＋`update_task_order` 呼び出しを実装する

## 7. フロントエンド: Board.tsx の接続

- [x] 7.1 `Board.tsx` で `useWorkspace` の `updateTaskOrder` と `renumberTasks` を `useBoardDragState` に渡す

## 8. ビルド確認

- [x] 8.1 `bun run build`（TypeScript typecheck + Vite build）が通ることを確認する
- [x] 8.2 `cargo clippy` が通ることを確認する
