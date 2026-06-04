## 1. Rust Backend — `status:` の有無判定とフィルタリング

- [x] 1.1 `Frontmatter.status` の型を `String` から `Option<String>` に変更し、`#[serde(default)]` を削除する（`status:` キーがない場合 `None`、空文字の場合 `Some("")` となる）
- [x] 1.2 `list_tasks` の frontmatter 処理ロジックを修正する: status が `None` または空文字 `Some("")` のファイルをスキップする。デフォルトステータス割り当てのロジックを削除する。未定義ステータス値のタスクはそのままのラベルで結果に含める。
- [x] 1.3 `cargo clippy` で静的チェックを通過することを確認する

## 2. Frontend Lib — `groupTasksByStatus` の拡張

- [x] 2.1 `src/lib/board.ts` に `UNKNOWN_STATUS = "__unknown__"` 定数を追加する
- [x] 2.2 `groupTasksByStatus` を修正し、定義済みステータスにマッチしないタスクを `__unknown__` グループに集約する

## 3. Frontend Hook — `useBoardDragState` の修正

- [x] 3.1 `columnOrder` の先頭に `UNKNOWN_STATUS` を追加する
- [x] 3.2 `handleDragEnd` で、ドロップ先が `UNKNOWN_STATUS` の場合に `updateTaskStatus` をスキップする（カードの表示のみ移動しない）
- [x] 3.3 Unknown レーンへの column ドロップを考慮し、`onReorderStatuses` の処理で `UNKNOWN_STATUS` を除外する

## 4. Frontend Component — `KanbanColumn` の拡張

- [x] 4.1 `KanbanColumnProps` に `showNewTaskButton?: boolean`（デフォルト `true`）と `draggable?: boolean`（デフォルト `true`）を追加する
- [x] 4.2 `showNewTaskButton` が `false` のとき `New Task` ボタンを非表示にする
- [x] 4.3 `draggable` が `false` のとき `useSortable` を呼ばず、代わりに静的な div としてレーンをレンダリングする

## 5. Frontend Page — `BoardPage` での Unknown レーン描画

- [x] 5.1 `columnOrder` の先頭要素が `UNKNOWN_STATUS` の場合、対応する `KanbanColumn` を `showNewTaskButton={false}` `draggable={false}` でレンダリングする
- [x] 5.2 `tasksByColumn[UNKNOWN_STATUS]` にタスクがある場合のみ Unknown レーンを表示する（空の場合は非表示でも良い）
- [x] 5.3 `bunx tsc --noEmit` と `bunx biome check src` を通過することを確認する
