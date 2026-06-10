## Context

MCP の `list_tasks` ツールは現在引数なしで、対象 workspace の全タスク（`status` frontmatter を持つ `.md` ファイル）を返す。フロントエンド側の `task::list_tasks`（Tauri command）は既に `query`（fuzzy タイトル検索）と `filters`（タグフィルター）をサポートしており、`task::apply_query_and_filters` 関数でフィルタリングを実装している。

MCP クライアント（Claude Desktop / Claude Code 等）が全タスクを取得してから自身でフィルタするのは非効率であり、LLM のコンテキスト制限にも抵触しやすい。サーバサイドでフィルタリングを行うことで、MCP クライアントに必要なタスクだけを返せるようにする。

## Goals / Non-Goals

**Goals:**

- MCP `list_tasks` にオプショナル引数 `query`（fuzzy title 検索）と `filters`（タグフィルター）を追加する
- 既存の `task::apply_query_and_filters` を再利用する（フィルタリングロジックの重複を避ける）
- 引数なしの既存呼び出しは従来通り全タスクを返す（後方互換性）
- `McpTask` DTO（`body` / `order` を除外した LLM 向け軽量表現）は変更しない

**Non-Goals:**

- フロントエンド側の `listTasks` API の変更（既存のまま動作する）
- MCP ツールの追加や削除（`list_tasks` 1 本体制を維持）
- ページネーションやカーソルベースの分割取得（将来の課題）
- 認証や workspace 解決の方式変更

## Decisions

### 1. MCP 専用の入力型を `mcp.rs` に定義する

`task::TagFilter` は既存の型だが `schemars::JsonSchema` を derive していない。`#[tool]` マクロは入力パラメータの JSON Schema 生成に `schemars::JsonSchema` を必要とするため、MCP 専用の `McpTagFilter` と `ListTasksInput` を `mcp.rs` に定義し、`task::TagFilter` への変換を行う。

- **選択肢 A**: `task::TagFilter` に `schemars::JsonSchema` を追加 → タスクコア型に MCP 関心が漏れる
- **選択肢 B**: MCP 専用入力型を `mcp.rs` に定義して変換 → 関心の分離が明確（**採用**）

### 2. 引数は `#[tool(input)]` の object パターンで受け取る

`rmcp` の `#[tool]` マクロは、引数が 1 つのみの場合にそれをツールの入力オブジェクトとして扱う。`ListTasksInput { query: Option<String>, filters: Option<Vec<McpTagFilter>> }` を唯一の引数とすることで、MCP 仕様に沿った `inputSchema` を自動生成させる。

### 3. フィルタリングは `apply_query_and_filters` を直接呼ぶ

`task::read_all_tasks` で全タスクを読み、`task::apply_query_and_filters` でフィルタリングする。フロントエンドと同じロジックを再利用するため、挙動の差異が生まれない。

### 4. `filters` の wire format はフロントエンドと統一する

`TagFilter` と同じ `#[serde(tag = "operator", rename_all = "snake_case")]` を用いるため、`McpTagFilter` も同一の JSON 表現を持つ。既にフロントエンドで使われている `{"operator":"contains","tags":["bug"]}` 形式を MCP クライアントもそのまま使える。

## Risks / Trade-offs

- **[後方互換性]** `query` / `filters` は `Option` のため、引数なしの既存呼び出しは全く変更なく動作する → リスクなし
- **[スキーマ重複]** `McpTagFilter` と `task::TagFilter` が実質的に同じ型を二重定義する → 変換関数 (`From` / `TryFrom`) を 1 箇所にまとめ、差分を閉じ込める
- **[fuzzy 検索パフォーマンス]** `nucleo_matcher` は既にフロントエンドで使われており、同一ロジックの呼び出し → 追加の依存なく既存の仕組みを再利用
