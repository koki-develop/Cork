## MODIFIED Requirements

### Requirement: MCP サーバは `list_tasks` ツールを公開する

サーバは MCP 仕様の `tools/list` で `list_tasks` ツール 1 件のみを返す。クライアントが `tools/call` で `list_tasks` を呼ぶと、現セッションの workspace ディレクトリを直接読み、`frontmatter` に `status` フィールドが設定されている `.md` ファイルだけを抽出し、オプショナルな `query` / `filters` 引数でフィルタリングした結果を `{ "tasks": [{ title, file_path, status, tags }] }` として返す。

ツールは以下のオプショナル引数を受け付ける:

- `query`（任意、文字列）: タイトルに対する fuzzy 検索。大文字小文字を区別せず、部分一致・非連続一致を許容する。空文字列または未指定の場合はフィルタリングなし。
- `filters`（任意、配列）: タグフィルターのリスト。各要素は `operator` で識別される discriminated union であり、複数指定時は AND 結合される。空配列または未指定の場合はフィルタリングなし。各フィルターの仕様:

  | operator       | フィールド       | 動作                                                          |
  | -------------- | ---------------- | ------------------------------------------------------------- |
  | `contains`     | `tags: string[]` | 指定されたタグのいずれかを少なくとも 1 つ持つ                 |
  | `not_contains` | `tags: string[]` | 指定されたタグを 1 つも持たない                               |
  | `contains_any` | `tags: string[]` | `contains` と同義（既存フロントエンド互換のためのエイリアス） |
  | `contains_all` | `tags: string[]` | 指定されたタグをすべて持つ                                    |
  | `is_empty`     | （なし）         | タグが 1 つも設定されていない                                 |
  | `is_not_empty` | （なし）         | タグが 1 つ以上設定されている                                 |

  `tags` フィールドが空配列の場合は、そのフィルターは無効（常に通過）として扱われる。

MCP 仕様は `outputSchema` の root が `object` であることを要求するため、タスク配列は単一フィールド `tasks` を持つオブジェクトでラップする。`title` はファイル名 (拡張子なし)、`file_path` はファイルの絶対パス、`status` と `tags` は frontmatter の値。タスクが 1 件もない workspace に対しては `{ "tasks": [] }` を返す (エラーではない)。

引数なし（または `query` / `filters` 未指定）の呼び出しは従来通り全タスクを返す（後方互換性維持）。

#### Scenario: タスクが複数ある workspace

- **WHEN** workspace に `Todo.md` (frontmatter `status: Todo`, `tags: [a, b]`) と `Doing.md` (frontmatter `status: Doing`) と `NoStatus.md` (frontmatter 無し) が含まれる状態で `list_tasks` を呼ぶ
- **THEN** レスポンスの `tasks` 配列には 2 件のタスク (`Todo.md` と `Doing.md`) のみが含まれる
- **AND** `NoStatus.md` は含まれない
- **AND** 各タスクは `title`, `file_path`, `status`, `tags` の 4 フィールドのみを持ち、`body` や `order` は含まれない

#### Scenario: タスクが 0 件の workspace

- **WHEN** workspace に該当する `.md` が 1 件もない状態で `list_tasks` を呼ぶ
- **THEN** レスポンスは `{ "tasks": [] }` を返し、エラーにはならない

#### Scenario: tools/list レスポンス

- **WHEN** クライアントが `tools/list` リクエストを送る
- **THEN** レスポンスには `list_tasks` ツール 1 件のみが含まれる
- **AND** ツールスキーマには `query`（任意、文字列）と `filters`（任意、配列）の入力パラメータが含まれる
- **AND** 出力スキーマは root が `object` で `tasks` プロパティ (要素が `title`, `file_path`, `status`, `tags` の 4 フィールドを持つ array) のみを含む

#### Scenario: query によるタイトル検索

- **WHEN** workspace に `Implement search.md` と `Fix bug.md` が含まれる状態で `list_tasks` に `query: "search"` を指定する
- **THEN** レスポンスの `tasks` には `Implement search` のみが含まれる
- **AND** `Fix bug` は含まれない

#### Scenario: filters によるタグフィルタリング

- **WHEN** workspace に `tags: ["bug"]` のタスク A と `tags: ["feature"]` のタスク B が含まれる状態で `list_tasks` に `filters: [{ operator: "contains", tags: ["bug"] }]` を指定する
- **THEN** レスポンスの `tasks` にはタスク A のみが含まれる
- **AND** タスク B は含まれない

#### Scenario: query と filters の AND 結合

- **WHEN** workspace に `Fix bug.md` (tags: `["bug"]`), `Fix typo.md` (tags: `["bug"]`), `Fix bug.md` (tags: `["feature"]`) が含まれる状態で `query: "bug"` と `filters: [{ operator: "contains", tags: ["bug"] }]` を同時に指定する
- **THEN** レスポンスの `tasks` には 1 件のみ含まれる
- **AND** そのタスクの `title` は `Fix bug`、`tags` は `["bug"]` である

#### Scenario: query / filters 未指定（後方互換性）

- **WHEN** 引数なしで `list_tasks` を呼び出す（旧クライアント）
- **THEN** 全タスクが返される（変更前と同じ動作）

#### Scenario: 空の query はフィルタリングなし

- **WHEN** `query: ""` を指定する
- **THEN** query によるフィルタリングは行われず、全タスクが返される

#### Scenario: 空の filters はフィルタリングなし

- **WHEN** `filters: []` を指定する
- **THEN** フィルタリングは行われず、全タスクが返される
