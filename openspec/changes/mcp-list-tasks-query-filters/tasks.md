## 1. MCP 入力型の定義

- [x] 1.1 `McpTagFilter` enum を `mcp.rs` に定義する（`task::TagFilter` と同一のバリアント、`schemars::JsonSchema` + `serde` derive 付き）
- [x] 1.2 `ListTasksInput` struct を `mcp.rs` に定義する（`query: Option<String>`, `filters: Option<Vec<McpTagFilter>>`、`schemars::JsonSchema` + `serde::Deserialize` derive 付き）

## 2. 型変換

- [x] 2.1 `McpTagFilter` → `task::TagFilter` の変換関数（または `From` impl）を `mcp.rs` に実装する

## 3. ハンドラの更新

- [x] 3.1 `list_tasks` ツールの引数に `ListTasksInput` を追加し、`#[tool(input)]` パターンで受け取る
- [x] 3.2 ハンドラ内で `task::read_all_tasks` → `task::apply_query_and_filters` の呼び出しパイプラインに組み込む
- [x] 3.3 `McpTask` / `ListTasksOutput` は変更しない（DTO は従来通り）

## 4. 既存 spec の更新

- [x] 4.1 `openspec/specs/mcp-server/spec.md` の `list_tasks` 要件を引数ありに更新する

## 5. テスト

- [x] 5.1 `mcp.rs` のテストモジュールに `ListTasksInput` のデシリアライズテストを追加する
- [x] 5.2 `McpTagFilter` → `task::TagFilter` 変換のラウンドトリップテストを追加する
- [x] 5.3 `tool_router_registers_without_panicking` テストが新しい引数スキーマでもパニックしないことを確認する（既存テストの自然なカバレッジ）
- [x] 5.4 `cargo test` と `bun run build`（tsc）が通ることを確認する
