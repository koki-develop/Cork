## MODIFIED Requirements

### Requirement: `list_tasks` コマンドはオプションの query パラメータでフィルタリングできる

`list_tasks` Tauri コマンドは、オプションパラメータ `query: Option<String>` を受け付けなければならない (MUST)。`None` または空文字列の場合、ワークスペース内の全タスクを返さなければならない (MUST)。`Some(query)` の場合、タイトルに対して case-insensitive な fuzzy matching を実施し、マッチしたタスクのみを返さなければならない (MUST)。

`list_tasks` は同時にオプションパラメータ `filters: Option<Vec<TagFilter>>` も受け付け、`query` と併用された場合は **両者を AND で結合** し、両方の条件を満たすタスクのみを返さなければならない (MUST)。`filters` の詳細仕様は `tag-filters` capability で定義する。

#### Scenario: query 未指定で全タスクが返る

- **GIVEN** ワークスペースに `task-a.md`, `task-b.md` の 2 ファイルが存在する
- **WHEN** `query=None`, `filters=None` で `list_tasks` が呼ばれる
- **THEN** 戻り値は 2 件のタスクを含む `Vec<Task>` である
- **AND** フィルタリングは行われず、従来通りの全件返却である

#### Scenario: query が空文字列で全タスクが返る

- **GIVEN** ワークスペースに 3 ファイルが存在する
- **WHEN** `query=Some("".to_string())`, `filters=None` で `list_tasks` が呼ばれる
- **THEN** 戻り値は 3 件のタスクを含む

#### Scenario: query に部分一致するタイトルのタスクだけが返る

- **GIVEN** ワークスペースに `title="Implement search"`, `title="Fix bug"` の 2 タスクが存在する
- **WHEN** `query=Some("search".to_string())`, `filters=None` で `list_tasks` が呼ばれる
- **THEN** 戻り値は `title="Implement search"` のタスク 1 件のみである
- **AND** `title="Fix bug"` のタスクは含まれない

#### Scenario: あいまい検索が機能する (非連続文字のマッチ)

- **GIVEN** ワークスペースに `title="Pull Request"` のタスクが存在する
- **WHEN** `query=Some("pr".to_string())`, `filters=None` で `list_tasks` が呼ばれる
- **THEN** `"Pull Request"` のタスクが結果に含まれる (`P` → `ull` → `R` → `equest` の順で "PR" の文字が出現する。fuzzy matching はこれらを非連続部分列としてマッチする)

#### Scenario: 大文字小文字を区別しない

- **GIVEN** ワークスペースに `title="Task"` のタスクが存在する
- **WHEN** `query=Some("tAsK".to_string())`, `filters=None` で `list_tasks` が呼ばれる
- **THEN** `"Task"` のタスクが結果に含まれる

#### Scenario: query にマッチするタスクが無い場合は空配列が返る

- **GIVEN** ワークスペースに 2 タスクが存在するが、いずれも "xyzzy" にマッチしない
- **WHEN** `query=Some("xyzzy".to_string())`, `filters=None` で `list_tasks` が呼ばれる
- **THEN** 戻り値は空の `Vec<Task>` である

#### Scenario: マッチしたタスクは order → title 順でソートされる

- **GIVEN** ワークスペースに `title="B Task" (order=2)`, `title="A Task" (order=1)`, `title="C Task" (order=3)` が存在し、すべて "Task" にマッチする
- **WHEN** `query=Some("Task".to_string())`, `filters=None` で `list_tasks` が呼ばれる
- **THEN** 戻り値のタスク順は `A Task (order=1)` → `B Task (order=2)` → `C Task (order=3)` である
- **AND** スコア順ではなく、従来の order → title ソートを維持する

#### Scenario: query と filters は AND で結合される

- **GIVEN** タスク A (`title="Fix bug"`, `tags=["bug"]`), B (`title="Fix typo"`, `tags=["bug"]`), C (`title="Fix bug"`, `tags=["feature"]`)
- **WHEN** `query=Some("bug")`, `filters=Some(vec![Contains{tags:["bug"]}])` で呼ばれる
- **THEN** 戻り値は A のみ
- **AND** B (title fuzzy が "bug" にマッチしない) と C (tags が "bug" を含まない) は除外される

#### Scenario: filters のみ指定されたとき query は無効化される

- **GIVEN** タスク A (`tags=["bug"]`), B (`tags=["feature"]`)
- **WHEN** `query=None`, `filters=Some(vec![Contains{tags:["bug"]}])` で呼ばれる
- **THEN** 戻り値は A のみ
- **AND** `query` パラメータ未指定で全タスク対象 → filters で絞り込みという順で評価される
