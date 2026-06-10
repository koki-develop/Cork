## Why

MCP クライアント（Claude Desktop / Claude Code 等）が `list_tasks` を呼ぶたびに全タスクを取得し、クライアント側でフィルタリングするのは非効率。フロントエンドの `listTasks` は既に `query`（fuzzy 検索）と `filters`（タグフィルター）をサポートしており、MCP 側も同じフィルタリングをサーバサイドで行えるようにすることで、LLM へのコンテキスト量を削減し、応答品質を向上させる。

## What Changes

- `list_tasks` MCP ツールにオプショナル引数 `query`（文字列、タイトルに対する fuzzy 検索）と `filters`（タグフィルター配列）を追加する
- MCP ハンドラ内で `task::apply_query_and_filters` を呼び出してフィルタリングを実行する
- `body` と `order` を除外した現行の `McpTask` DTO は変更しない（LLM 向け軽量表現を維持）

## Capabilities

### New Capabilities

<!-- No new capabilities — this modifies an existing capability -->

### Modified Capabilities

- `mcp-server`: `list_tasks` ツールの要求仕様を変更 — 引数なしから `query` / `filters` を受け付けるよう拡張する

## Impact

- `src-tauri/src/mcp.rs`: `list_tasks` ツールのハンドラシグネチャ変更、引数型の追加、フィルタリング呼び出しの追加
- `openspec/specs/mcp-server/spec.md`: `list_tasks` の要件を引数ありに更新
- 既存の MCP クライアントへの影響: `query` / `filters` はオプショナルであるため、引数なしの既存呼び出しは従来通り動作する（後方互換性維持）
