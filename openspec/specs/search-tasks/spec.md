# search-tasks Specification

## Purpose

ユーザがタスクをタイトルであいまい検索できる機能を提供する。検索は AppHeader 内の SearchBar から入力し、Rust バックエンドで case-insensitive な fuzzy matching を実施する。検索テキストは即時 Rust に送信され (debounce なし)、結果がリアルタイムでボードに反映される。Rust 側はタスクキャッシュを持ち、検索時のファイル I/O は発生しない。

## Requirements

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

### Requirement: Rust はタスクキャッシュを持ち、検索時はキャッシュに対して fuzzy matching を実行する

`list_tasks` は `query=None` または空文字列のときにファイル読み込みを行い、結果を `AppState` のキャッシュに保存しなければならない (MUST)。`query=Some(q)` で非空クエリが指定された場合は、キャッシュからタスク一覧を読み取り、fuzzy matching を実行しなければならない (MUST)。

#### Scenario: 初回読み込み時にキャッシュが作成される

- **GIVEN** ワークスペースに 2 つのタスクが存在し、キャッシュが空の状態
- **WHEN** `list_tasks(None)` が呼ばれる
- **THEN** 2 つのタスクがファイルから読み込まれ、キャッシュに保存される
- **AND** 戻り値は 2 件のタスクを含む

#### Scenario: 検索時はキャッシュから読み取り、ファイル I/O は発生しない

- **GIVEN** キャッシュに 3 つのタスクが保存されている
- **WHEN** `list_tasks(Some("query".to_string()))` が呼ばれる
- **THEN** ファイル読み込みは行われず、キャッシュに対して fuzzy matching が実行される
- **AND** マッチしたタスクのみが返る

### Requirement: フロントエンドは SearchBar で検索テキストを入力できる

AppHeader 内に SearchBar molecule が配置されなければならない (MUST)。SearchBar は controlled コンポーネントとして、親から `value` と `onChange` を受け取らなければならない (MUST)。

#### Scenario: SearchBar が AppHeader に表示される

- **WHEN** ボードがレンダリングされる
- **THEN** AppHeader の PathDisplay の右側に SearchBar が表示される
- **AND** SearchBar 内に Search (lucide) アイコンが表示される
- **AND** placeholder テキスト "Search tasks…" が表示される

#### Scenario: 入力に応じて onChange が呼ばれる

- **GIVEN** SearchBar が初期状態 (value="")
- **WHEN** ユーザが "hello" とタイプする
- **THEN** 各キー入力に対して `onChange` が最新の文字列で呼ばれる
- **AND** `<input>` 要素の値が入力文字列と一致する

#### Scenario: Escape キーで入力がクリアされる

- **GIVEN** SearchBar に "search" と入力されている
- **WHEN** ユーザが Escape キーを押す
- **THEN** `onChange("")` が呼ばれる
- **AND** `<input>` からフォーカスが外れる (blur)

#### Scenario: フォーカスで幅が広がる

- **GIVEN** SearchBar が非フォーカス状態 (width: w-48)
- **WHEN** ユーザが SearchBar にフォーカスする
- **THEN** SearchBar の幅が w-64 に拡大する
- **AND** 変化は 150ms の transition でアニメーションする

### Requirement: 検索入力は即時 Rust バックエンドに送信される (debounce なし)

`useWorkspace` フックは、`query` ステートが変更されるたびに即座に `loadTasks` を呼び出さなければならない (MUST)。検索は Rust 側のタスクキャッシュに対して実行されるため、ファイル I/O は発生せずパフォーマンスに影響しない。

#### Scenario: キー入力ごとに即座に検索が発火する

- **GIVEN** 検索バーに何も入力されていない状態
- **WHEN** ユーザが "t" とタイプする
- **THEN** 即座に `listTasks("t")` が invoke される
- **AND** ユーザが続けて "e" とタイプする
- **THEN** 即座に `listTasks("te")` が invoke される (前回の呼び出しをキャンセルしない)

#### Scenario: 空クエリでは全タスクが返る

- **GIVEN** ユーザが何か検索した後に入力を空にした
- **WHEN** `query` が空文字列に変更される
- **THEN** 即座に `listTasks("")` が呼ばれ、Rust 側は全タスクを返す

### Requirement: 検索結果がボードにリアルタイム反映される

`listTasks` の戻り値は既存の `tasks` ステートを置き換え、ボードの表示が更新されなければならない (MUST)。

#### Scenario: 検索結果がカラムに反映される

- **GIVEN** ワークスペースに `status: Todo` で "Implement A" と "Implement B" の 2 タスクが存在する
- **WHEN** ユーザが "A" と検索する
- **THEN** Todo カラムに "Implement A" のみが表示される
- **AND** "Implement B" は表示されない

#### Scenario: 検索をクリアすると全タスクに戻る

- **GIVEN** ユーザが "A" で検索中で、Todo カラムに 1 タスクのみ表示されている
- **WHEN** ユーザが Escape キーを押して検索をクリアする
- **THEN** 300ms 後に全タスクが再表示される
- **AND** Todo カラムに "Implement A" と "Implement B" の両方が表示される

### Requirement: ファイル監視による reload は現在の検索クエリを維持する

外部エディタ等で `.md` ファイルが変更された場合、ファイル監視による `loadTasks` 呼び出しは現在の `query` 値を `listTasks` に渡さなければならない (MUST)。

#### Scenario: 検索中にファイルが追加された場合も検索状態が維持される

- **GIVEN** ユーザが "bug" で検索中で、"Fix bug" のタスクのみ表示されている
- **WHEN** 外部エディタで "Critical bug" というタイトルの新しい `.md` ファイルが作成される
- **THEN** ファイル監視が発火し `loadTasks` が呼ばれる
- **AND** `listTasks("bug")` が呼ばれ、"Fix bug" と "Critical bug" の両方が表示される
- **AND** 検索クエリ "bug" は入力欄に残ったままである
