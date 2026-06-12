## 1. バックエンド: frontmatter / Task モデル

- [x] 1.1 `task.rs` の `Task` struct に `date: Option<String>` を追加（`#[serde(default)]`）
- [x] 1.2 `TaskFrontmatter` に `date` を追加し、`deserialize_tags_lenient` に倣った `deserialize_date_lenient` を実装（正準形 `YYYY-MM-DD` 以外 / 非文字列 / YAML date 型は `None` にフォールバック）
- [x] 1.3 `date` 文字列の正準形バリデーションヘルパー（`YYYY-MM-DD`、月日の範囲チェック）を `task.rs` に追加
- [x] 1.4 `frontmatter.rs` で `date` 文字列が YAML date 型ではなく string としてラウンドトリップすることを確認（必要なら serialize/parse を調整）

## 2. バックエンド: task コマンド

- [x] 2.1 `write_task_file` に `date: Option<String>` 引数を追加し、`Some(正準形)` のとき frontmatter に `date` を書き出す（空 / `None` は出力しない）。`Some(非正準形)` は `CommandError` を返す（MCP `create_task` 経由の不正値防御 — Tauri / MCP 両経路で同一バリデーション）
- [x] 2.2 `create_task` コマンドに `date: Option<String>` を追加し `write_task_file` に渡す
- [x] 2.3 `update_task` にローカル enum `DateOp { Keep, Set(String), Clear }` を導入し、`None`=Keep / `Some("")`=Clear / `Some(canonical)`=Set を実装（`tags` の `TagOp` に対称）
- [x] 2.4 `update_task` の Set 時に `fm_updates` へ `date` を push、Clear 時に `frontmatter::remove_keys(&content, &["date"])` を適用、戻り値 `Task.date` を正しく反映
- [x] 2.5 `get_task` の戻り値に `date` を反映

## 3. バックエンド: MCP

- [x] 3.1 `mcp.rs` の `McpTask` に `date: Option<String>` を追加し、全 McpTask 生成箇所（`list_tasks` のマップ / `create_task` 出力 / `delete_task` 出力）で `task.date` を写す
- [x] 3.2 `CreateTaskInput` に `date: Option<String>` を追加し、`create_task` ハンドラから `write_task_file` の `date` 引数へ渡す（不正値は `write_task_file` バリデーションで弾く）
- [x] 3.3 `ListTasksOutput` / `CreateTaskOutput` の outputSchema pin テストが `date` 追加後も root=object を満たすことを確認

## 4. バックエンド: テスト

- [x] 4.1 `frontmatter.rs`: `date` の serialize/parse ラウンドトリップ（`"2026-06-15"` → string で往復）テストを追加
- [x] 4.2 `task.rs`: `deserialize_date_lenient`（正準形受理 / `2026/6/5`・`abc`・null・非文字列のフォールバック）テストを追加
- [x] 4.3 `task.rs`: 正準形バリデーション（`2026-13-40` 等の無効日付拒否）テストを追加
- [x] 4.4 `mcp.rs`: `McpTask` に `date` が含まれることのテストを追加（`mcp_task` 等の既存テストヘルパーの更新含む）
- [x] 4.5 `mcp.rs`: `CreateTaskInput` の `date` デシリアライズ（指定あり / 未指定）テストを追加
- [x] 4.6 `cargo test` が通ることを確認

## 5. フロントエンド: 型 / lib

- [x] 5.1 `types/task.ts` の `Task` に `date: string | null`（`null`=期日なし）、`TaskUpdates` に `date: string`（`""`=Clear のセンチネル / 正準形=Set）を追加
- [x] 5.2 `lib/task.ts` の `TaskFormSnapshot.date` を `string`（`""`=なし）として扱い、`computeDirtyUpdates` / `withTaskUpdates` に `date` を編み込む。フォーム seed 時に `task.date ?? ""` で null→"" 変換（変換点はここ 1 箇所のみ）
- [x] 5.3 `lib/date.ts`（新規）: `parseDate` / `formatISODate` / `classifyDate`（`overdue|today|tomorrow|soon|far`）/ `formatRelativeLabel` を実装
- [x] 5.4 `api/tasks.ts` の `createTask` / `updateTask` シグネチャに `date` を追加

## 6. フロントエンド: UI コンポーネント

- [x] 6.1 `molecules/Calendar`（新規）: 月グリッド + 月送りの自作カレンダー（`value` / `onSelect`、月送り state を内部保持するため atoms ではなく molecules）を実装し barrel から export
- [x] 6.2 `molecules/DateField`（新規）: 入力欄 + `Calendar` ポップオーバー（`createPortal` で dialog top layer、`useAnchorRect` で位置決め、選択は即 `onChange`、直接入力は blur 確定で `parseDate` 検証・不正なら直前値に戻す、× でクリア、`onChange(date: string)` で `""`=なし）を実装し barrel から export
- [x] 6.3 `molecules/DateBadge`（新規）: `date` を受け `classifyDate` でラベル + 色を出すカード用バッジを実装し barrel から export

## 7. フロントエンド: テーマ

- [x] 7.1 `style.css` の `@theme` に期日文字色トークン（`--color-cork-success-text`=緑 / `--color-cork-warning-text`=オレンジ）を追加（DateBadge はテキストのみのため文字色だけで足りる）

## 8. フロントエンド: ダイアログ / カード配線

- [x] 8.1 `CreateTaskDialog`: サイドバーに「Date」`FormField` + `DateField` を追加、`date` state、`onCreateTask` シグネチャ拡張、`isDirty` 判定に反映
- [x] 8.2 `useTaskDialogState`: `date` フォーム状態 + `handleDateChange`（auto-save）を追加、`revertField` / `withFieldReverted` / snapshot 各所に `date` を編み込む
- [x] 8.3 `TaskDetailDialog`: サイドバーに「Date」`FormField` + `DateField` を配線
- [x] 8.4 `KanbanCard`: 期日があるとき `DateBadge` を表示
- [x] 8.5 `BoardPage` 等の呼び出し元で `createTask` / `updateTask` に `date` を渡す配線を更新

## 9. 検証

- [x] 9.1 `bunx tsc --noEmit` / `bun run lint` / `bun run fmt:check` が通ることを確認
- [x] 9.2 `bun run tauri dev` で手動スモーク: 作成ダイアログでのカレンダー選択・直接入力・クリア、詳細ダイアログでの auto-save、カードの各カテゴリ表示（today/tomorrow/soon/overdue/far/なし）、frontmatter のラウンドトリップ
