## ADDED Requirements

### Requirement: `TagFilter` 型は operator を判別子とした discriminated union である

`TagFilter` 型は、Rust 側 (`src-tauri/src/task.rs`) でも TypeScript 側 (`src/types/filter.ts`) でも、operator を判別子とした discriminated union として定義されなければならない (MUST)。タグを取らない operator (`is_empty` / `is_not_empty`) は `tags` フィールドを持たず、タグを取る operator (`contains` / `not_contains` / `contains_any` / `contains_all`) は `tags: Vec<String>` / `string[]` を持たなければならない (MUST)。これにより「`is_empty` + 非空タグ」のような不正な組み合わせを型レベルで表現不能にしなければならない (MUST NOT)。

#### Scenario: タグなし operator は tags フィールドを持たない

- **GIVEN** Rust 側で `TagFilter::IsEmpty` または `TagFilter::IsNotEmpty` を構築する
- **THEN** バリアントは tags フィールドを持たない
- **AND** wire format は `{"operator":"is_empty"}` のみ (tags キーは含まれない)

#### Scenario: タグあり operator は tags フィールドを持つ

- **GIVEN** Rust 側で `TagFilter::Contains { tags: vec!["bug".into()] }` を構築する
- **THEN** wire format は `{"operator":"contains","tags":["bug"]}` である

#### Scenario: TypeScript の判別共用体は `"tags" in f` で narrow できる

- **GIVEN** `const f: TagFilter`
- **WHEN** コードが `"tags" in f` を判定する
- **THEN** true 分岐では `f.tags` にアクセスでき、false 分岐ではアクセスできない (型エラー)

### Requirement: `list_tasks` コマンドはオプションの `filters` パラメータでタグ条件によるフィルタリングができる

`list_tasks` Tauri コマンドは、オプションパラメータ `filters: Option<Vec<TagFilter>>` を受け付けなければならない (MUST)。`filters` が `None` または空配列の場合、フィルタリングを行ってはならない (MUST NOT)。`filters` が 1 件以上の場合、各フィルタを全体 AND で評価し、すべての条件を満たすタスクのみを返さなければならない (MUST)。`query` パラメータと併用された場合、`query` の fuzzy match と `filters` の AND で結合しなければならない (MUST)。

#### Scenario: filters 未指定で全タスクが返る

- **GIVEN** ワークスペースに 3 つのタスクが存在する
- **WHEN** `filters=None` で `list_tasks` が呼ばれる
- **THEN** 戻り値は 3 件のタスクすべてを含む `Vec<Task>` である

#### Scenario: filters が空配列で全タスクが返る

- **GIVEN** ワークスペースに 3 つのタスクが存在する
- **WHEN** `filters=Some(vec![])` で `list_tasks` が呼ばれる
- **THEN** 戻り値は 3 件のタスクすべてを含む

#### Scenario: 単一フィルタがすべてのタスクに適用される

- **GIVEN** タスク A (`tags=["bug"]`), B (`tags=["feature"]`), C (`tags=[]`) が存在する
- **WHEN** `filters=Some(vec![Contains{tags:["bug"]}])` で `list_tasks` が呼ばれる
- **THEN** 戻り値は A のみを含む

#### Scenario: 複数フィルタは全体 AND で評価される

- **GIVEN** タスク A (`tags=["bug", "p0"]`), B (`tags=["bug"]`), C (`tags=["p0"]`)
- **WHEN** `filters=Some(vec![Contains{tags:["bug"]}, Contains{tags:["p0"]}])` で呼ばれる
- **THEN** 戻り値は A のみを含む

#### Scenario: query と filters が併用されると AND で結合される

- **GIVEN** タスク A (`title="Fix bug"`, `tags=["bug"]`), B (`title="Fix typo"`, `tags=["bug"]`), C (`title="Fix bug"`, `tags=["feature"]`)
- **WHEN** `query=Some("bug")`, `filters=Some(vec![Contains{tags:["bug"]}])` で呼ばれる
- **THEN** 戻り値は A のみを含む

#### Scenario: フィルタ評価はキャッシュに対して行われファイル I/O が発生しない

- **GIVEN** `AppState::tasks_cache` に 5 件のタスクが保存されている
- **WHEN** `filters=Some(vec![Contains{tags:["x"]}])` で `list_tasks` が呼ばれる
- **THEN** ファイル読み込みは行われない

#### Scenario: マッチしたタスクは order → title 順でソートされる

- **GIVEN** タスク A (`order=2`), B (`order=1`), C (`order=3`) がすべて `tags=["x"]` を持つ
- **WHEN** `filters=Some(vec![Contains{tags:["x"]}])` で呼ばれる
- **THEN** 戻り値の順序は B → A → C である
- **AND** フィルタの順序は結果順序に影響しない

### Requirement: `Contains` / `NotContains` オペレータは単一タグでマッチを判定する

`TagFilter::Contains { tags }` はタスクの `tags` に `tags[0]` が完全一致で含まれる場合に true を返さなければならない (MUST)。`TagFilter::NotContains { tags }` はその否定を返さなければならない (MUST)。`tags` が空配列の場合、両 operator ともフィルタを無効として扱い (true を返し)、全タスクを通さなければならない (MUST)。タグ比較は大文字小文字を区別しなければならない (MUST)。

#### Scenario: Contains は完全一致で判定する

- **GIVEN** タスク A (`tags=["bug"]`), B (`tags=["bugs"]`)
- **WHEN** `Contains{tags:["bug"]}` で評価される
- **THEN** A のみがマッチする (B は "bugs" と異なるため除外)

#### Scenario: Contains は大文字小文字を区別する

- **GIVEN** タスク A (`tags=["Bug"]`), B (`tags=["bug"]`)
- **WHEN** `Contains{tags:["bug"]}` で評価される
- **THEN** B のみがマッチする

#### Scenario: NotContains は条件の反転を返す

- **GIVEN** タスク A (`tags=["bug"]`), B (`tags=["feature"]`), C (`tags=[]`)
- **WHEN** `NotContains{tags:["bug"]}` で評価される
- **THEN** B / C がマッチする
- **AND** タグが空の C も「'bug' を含まない」として通る

#### Scenario: Contains / NotContains の空 tags はフィルタ無効として全タスクを通す

- **GIVEN** ワークスペースに 3 件のタスクが存在する
- **WHEN** `Contains{tags:[]}` または `NotContains{tags:[]}` で評価される
- **THEN** 戻り値は 3 件すべてを含む

### Requirement: `ContainsAny` / `ContainsAll` オペレータは複数タグで集合判定する

`TagFilter::ContainsAny { tags }` は `tags` のいずれか 1 個でもタスクの `tags` に含まれていれば true を返さなければならない (MUST)。`TagFilter::ContainsAll { tags }` は `tags` のすべてがタスクの `tags` に含まれていれば true を返さなければならない (MUST)。両 operator とも `tags` が空配列の場合、フィルタを無効として true を返さなければならない (MUST)。

#### Scenario: ContainsAny はいずれか 1 つにマッチすれば通す

- **GIVEN** タスク A (`tags=["bug"]`), B (`tags=["feature"]`), C (`tags=["docs"]`)
- **WHEN** `ContainsAny{tags:["bug","feature"]}` で評価される
- **THEN** A / B がマッチする

#### Scenario: ContainsAll はすべてのタグが含まれているときのみ通す

- **GIVEN** タスク A (`tags=["bug","p0","frontend"]`), B (`tags=["bug","p0"]`), C (`tags=["bug"]`)
- **WHEN** `ContainsAll{tags:["bug","p0"]}` で評価される
- **THEN** A / B がマッチする (C は p0 を持たないため除外)

#### Scenario: ContainsAny / ContainsAll の空 tags は無効フィルタとして全タスクを通す

- **GIVEN** ワークスペースに 3 件のタスクが存在する
- **WHEN** `ContainsAny{tags:[]}` または `ContainsAll{tags:[]}` で評価される
- **THEN** 戻り値は 3 件すべてを含む

### Requirement: `IsEmpty` / `IsNotEmpty` オペレータはタグの有無で判定する

`TagFilter::IsEmpty` はタスクの `tags` が空配列のときのみ true を返さなければならない (MUST)。`TagFilter::IsNotEmpty` はその否定を返さなければならない (MUST)。両 operator とも `tags` フィールドを持たないため、型レベルで「タグ操作と混在しない」ことが保証されなければならない (MUST)。

#### Scenario: IsEmpty はタグなしタスクのみを通す

- **GIVEN** タスク A (`tags=[]`), B (`tags=["bug"]`), C (`tags=[]`)
- **WHEN** `IsEmpty` で評価される
- **THEN** A / C がマッチする (B は除外)

#### Scenario: IsNotEmpty はタグありタスクのみを通す

- **GIVEN** タスク A (`tags=[]`), B (`tags=["bug"]`), C (`tags=["x","y"]`)
- **WHEN** `IsNotEmpty` で評価される
- **THEN** B / C がマッチする (A は除外)

### Requirement: `list_all_tags` Tauri コマンドはワークスペース内の全タグをアルファベット順で返す

`list_all_tags` Tauri コマンドが新規追加されなければならない (MUST)。このコマンドは `AppState::tasks_cache` から全タスクのタグを抽出し、重複を取り除き、**アルファベット順 (case-insensitive、すなわち小文字化したキーで比較。同一小文字キーの場合は元の文字列の lexicographic 順で安定的にソート) **した `Vec<String>` を返さなければならない (MUST)。タグの原文ケースは保持しなければならない (MUST)。dedup は case-sensitive とし、`Bug` と `bug` のような大小文字違いは別エントリとして残さなければならない (MUST)。キャッシュが `None` (未構築) の場合はファイル読み込みを行ってキャッシュを構築しなければならない (MUST)。フィルタや query の影響を受けず、常に「全タスクのタグ集合」を返さなければならない (MUST)。

#### Scenario: case-insensitive アルファベット順で返す (原文ケース保持)

- **GIVEN** タスク A (`tags=["p0","bug"]`), B (`tags=["Feature"]`), C (`tags=["bug"]`) がキャッシュ済み
- **WHEN** `list_all_tags()` が呼ばれる
- **THEN** 戻り値は `["bug", "Feature", "p0"]` (重複なし、case-insensitive ソート)
- **AND** タグの原文ケースは保持される

#### Scenario: 大小文字違いは別エントリとして残る

- **GIVEN** タスク A (`tags=["Bug"]`), B (`tags=["bug"]`) がキャッシュ済み
- **WHEN** `list_all_tags()` が呼ばれる
- **THEN** 戻り値は `["Bug", "bug"]` の 2 エントリを含む

#### Scenario: キャッシュが `None` のときは自動的にビルドして返す

- **GIVEN** キャッシュが `None`
- **AND** ワークスペースに 2 件のタスクが存在する
- **WHEN** `list_all_tags()` が呼ばれる
- **THEN** ファイル読み込みが実行されキャッシュが構築される
- **AND** 構築されたキャッシュからタグが抽出されて返る

#### Scenario: キャッシュが `Some(空 vec)` のときはファイル I/O なしで空配列を返す

- **GIVEN** キャッシュが `Some(vec![])` (構築済みだがタスクなし)
- **WHEN** `list_all_tags()` が呼ばれる
- **THEN** 戻り値は空の `Vec<String>` である
- **AND** ファイル読み込みは発生しない

#### Scenario: ワークスペース未設定では空配列を返す

- **GIVEN** `AppState::workspace_dir` が `None`
- **WHEN** `list_all_tags()` が呼ばれる
- **THEN** 戻り値は空の `Vec<String>` であり、エラーは発生しない

### Requirement: フロントエンド API `listTasks` は query / filters を受けて invoke する

`src/api/tasks.ts` の `listTasks` 関数のシグネチャは `(query?: string, filters?: TagFilter[]) => Promise<Task[]>` でなければならない (MUST)。`query` が undefined / 空文字列、`filters` が undefined / 空配列の場合は invoke ペイロードに含めてはならない (MUST NOT)。filter ペイロードは frontend 固有の `id` フィールドを除き、タグなし operator では `tags` フィールドも省略しなければならない (MUST)。

#### Scenario: 引数なしで呼ぶと空ペイロードで invoke される

- **WHEN** `listTasks()` が呼ばれる
- **THEN** `invoke("list_tasks", {})` が実行される

#### Scenario: query のみを渡すと query だけがペイロードに入る

- **WHEN** `listTasks("bug")` が呼ばれる
- **THEN** `invoke("list_tasks", { query: "bug" })` が実行される

#### Scenario: タグあり operator は tags フィールド付きで送信される

- **WHEN** `listTasks(undefined, [{id:"a", operator:"contains", tags:["bug"]}])` が呼ばれる
- **THEN** `invoke("list_tasks", { filters: [{ operator: "contains", tags: ["bug"] }] })` が実行される
- **AND** `id` は IPC ペイロードに含まれない

#### Scenario: タグなし operator は tags フィールドなしで送信される

- **WHEN** `listTasks(undefined, [{id:"a", operator:"is_empty"}])` が呼ばれる
- **THEN** `invoke("list_tasks", { filters: [{ operator: "is_empty" }] })` が実行される
- **AND** ペイロードに `tags` フィールドは含まれない

#### Scenario: filters が空配列のときはペイロードに含めない

- **WHEN** `listTasks("bug", [])` が呼ばれる
- **THEN** `invoke("list_tasks", { query: "bug" })` が実行される

### Requirement: フィルタの読み書きは Rust 側 Tauri コマンドが store を wrap し、active workspace を `AppState` から取得する

frontend は `@tauri-apps/plugin-store` を直接利用してはならない (MUST NOT)。代わりに Rust 側の Tauri コマンド `get_workspace_filters()` / `set_workspace_filters(filters)` を invoke 経由で呼ばなければならない (MUST)。対象ワークスペースは frontend から受け取らず、`AppState::require_workspace` から取得しなければならない (MUST)。保存先は既存の `settings.json` ストアの `workspaces.<path>.filters` で、`<path>` はワークスペースの絶対パス文字列とする (MUST)。保存ペイロードは frontend 固有の `id` フィールドを含めてはならない (MUST NOT)。corrupt な store 値 (例: `workspaces` キーがオブジェクトでない) は silent recovery してはならず、`CommandError` を返さなければならない (MUST)。

#### Scenario: get_workspace_filters は active workspace のフィルタを返す

- **GIVEN** `settings.json` の `workspaces["/Users/koki/board-a"].filters` に `[{operator:"contains", tags:["bug"]}]` が保存済み
- **AND** `AppState` の active workspace が `/Users/koki/board-a`
- **WHEN** frontend が `get_workspace_filters()` を invoke する
- **THEN** 戻り値は `[{operator:"contains", tags:["bug"]}]` である

#### Scenario: 該当ワークスペースのエントリが無いときは空配列を返す

- **GIVEN** `settings.json` に `workspaces` キーが存在しない、または active workspace のエントリが無い
- **WHEN** `get_workspace_filters()` が呼ばれる
- **THEN** 戻り値は空の `Vec<StoredFilter>` である
- **AND** エラーは発生しない

#### Scenario: set_workspace_filters は active workspace 配下に保存する

- **GIVEN** `AppState` の active workspace が `/Users/koki/board-a`
- **WHEN** frontend が `set_workspace_filters([{operator:"contains", tags:["bug"]}])` を invoke する
- **THEN** `settings.json` の `workspaces["/Users/koki/board-a"].filters` に該当配列が書き込まれる
- **AND** 他のワークスペースのエントリは破壊されない
- **AND** `id` フィールドは保存されない

#### Scenario: 空配列を渡すと filters サブキーが削除される

- **GIVEN** active workspace のエントリに `filters` が保存済み
- **WHEN** `set_workspace_filters([])` が呼ばれる
- **THEN** 該当 workspace の `filters` サブキーが削除される
- **AND** workspace エントリが他のサブキー (例: `sort_order`) を持つ場合は workspace エントリ自体は保持される
- **AND** workspace エントリが完全に空になった場合は workspace エントリ自体も削除される
- **AND** `workspaces` Map が空になった場合は `workspaces` キー自体も `settings.json` から削除される

#### Scenario: corrupt な workspaces 値はエラーを返す

- **GIVEN** `settings.json` の `workspaces` キーがオブジェクトではない値 (例: 文字列)
- **WHEN** `set_workspace_filters([{operator:"contains", tags:["bug"]}])` または `get_workspace_filters()` が呼ばれる
- **THEN** `CommandError` が返る
- **AND** 既存の `workspaces` 値は破壊されない

#### Scenario: corrupt な workspace エントリはエラーを返す

- **GIVEN** `workspaces["/path/a"]` がオブジェクトではない値
- **WHEN** active workspace `/path/a` に対して `set_workspace_filters(...)` が呼ばれる
- **THEN** `CommandError` が返る

### Requirement: `useFilterStore` フックはワークスペース毎のフィルタをロード/永続化する

frontend hook `useFilterStore(workspaceDir: string | null)` は、`{ filters: TagFilter[], scheduleSave: (next: TagFilter[]) => void }` を返さなければならない (MUST)。`workspaceDir` が変更されたとき、即座に `filters` を空配列にリセットし、`get_workspace_filters()` を非同期に呼んで結果で `filters` を更新しなければならない (MUST)。`scheduleSave` は 500ms debounce で `set_workspace_filters` を invoke しなければならない (MUST)。ロード/保存失敗時は `sonner` トーストで通知しなければならない (MUST)。

#### Scenario: ワークスペース切替で filters が再ロードされる

- **GIVEN** ワークスペース A が選択され、復元済みのフィルタが `[F1]`
- **WHEN** ワークスペース B に切り替える
- **THEN** `filters` が即座に `[]` にリセットされる
- **AND** `get_workspace_filters()` が invoke される
- **AND** 解決後 `filters` は B の保存済みフィルタで更新される

#### Scenario: ワークスペース未選択時は空配列で開始する

- **GIVEN** `workspaceDir === null`
- **WHEN** `useFilterStore(null)` が初期化される
- **THEN** `filters` は `[]` である
- **AND** `get_workspace_filters` は invoke されない

#### Scenario: アプリ再起動後に前回のフィルタが復元される

- **GIVEN** 前回セッションで `[{operator:"is_not_empty"}]` が保存済み
- **WHEN** Cork を再起動して同じワークスペースを開く
- **THEN** `filters` は `[{operator:"is_not_empty"}]` で復元される
- **AND** 各フィルタには新しい `id` (UUID) が振られる

#### Scenario: 連続したフィルタ変更は debounce で 1 度の書き込みに統合される

- **GIVEN** フィルタが空の状態
- **WHEN** ユーザが 100ms 間隔で 5 回 scheduleSave を呼ぶ
- **THEN** 最後の呼び出しから 500ms 後に 1 度だけ `set_workspace_filters` が invoke される

#### Scenario: ロード失敗時は toast で通知される

- **GIVEN** `get_workspace_filters` が rejection する状況 (例: `settings.json` が corrupt)
- **WHEN** `useFilterStore` が初期化される
- **THEN** `sonner` の `toast.error` で "Failed to load filters: ..." が表示される
- **AND** `filters` は `[]` のまま (UI はブロックされない)

#### Scenario: 保存失敗時は toast で通知される

- **WHEN** `scheduleSave` の結果として `set_workspace_filters` が rejection する
- **THEN** `sonner` の `toast.error` で "Failed to save filters: ..." が表示される

### Requirement: `useWorkspace` フックは filters ステートを保持し変更時に listTasks を再実行する

`useWorkspace` は `filters: TagFilter[]` ステートと `handleFiltersChange(next: TagFilter[])` ハンドラを公開しなければならない (MUST)。`filters` は `useFilterStore` の `filters` をミラーしなければならない (MUST)。`filters` が変更されたとき (handler 経由 / ストアからのミラー両方) `listTasks` を最新の query / filters で呼ばなければならない (MUST)。ファイル監視 reload や CRUD 完了時にも現在の filters を使って `listTasks` および `listAllTags` を呼ばなければならない (MUST)。`requestIdRef` により最新のリクエストのみ結果を反映させなければならない (MUST)。

#### Scenario: フィルタ変更で即座にタスクが再取得される

- **GIVEN** 現在のフィルタが `[]`
- **WHEN** ユーザが `[{operator:"contains", tags:["bug"]}]` を設定する
- **THEN** `listTasks(undefined, [{operator:"contains", tags:["bug"]}])` が invoke される
- **AND** debounce はかからない

#### Scenario: query もフィルタも両方変えると最新の組み合わせで再取得される

- **GIVEN** 検索バーに "fix"、フィルタに `[]`
- **WHEN** ユーザがフィルタを `[{operator:"contains", tags:["bug"]}]` に変える
- **THEN** `listTasks("fix", [{operator:"contains", tags:["bug"]}])` が invoke される

#### Scenario: ファイル監視リロード時も現在のフィルタが維持される

- **GIVEN** フィルタが `[{operator:"contains", tags:["bug"]}]`
- **WHEN** 外部エディタでタスクファイルが変更されファイル監視が発火する
- **THEN** `listTasks(query, [{operator:"contains", tags:["bug"]}])` が呼ばれる
- **AND** `listTasks` 完了後に `listAllTags()` も呼ばれて `availableTags` が更新される

#### Scenario: ワークスペース切替で前回のフィルタが復元される

- **GIVEN** ワークスペース A でフィルタが永続化済み
- **WHEN** ユーザがワークスペース A を開く
- **THEN** `useFilterStore` が `get_workspace_filters()` を invoke する
- **AND** 解決結果が `useWorkspace.filters` にミラーされる
- **AND** ミラー後に `listTasks` および `listAllTags` が呼ばれる

### Requirement: toolbar に `FilterButton` を配置し、有効フィルタ数をバッジ表示する

ツールバー領域 (`BoardLayout` の `toolbar` slot) は、`SearchBar` の右側に `FilterButton` molecule を含まなければならない (MUST)。`FilterButton` は **有効フィルタ** (`isValidFilter` true なもの) の件数のみカウントしなければならない (MUST)。フィルタが 1 件以上有効な時は accent ボーダーと件数バッジを表示しなければならない (MUST)。クリックで popover をトグルしなければならない (MUST)。

#### Scenario: フィルタなしのときは muted トーンで表示される

- **GIVEN** 有効フィルタが 0 件
- **THEN** `FilterButton` は `ListFilter` (lucide) アイコン + "Filter" テキストで表示される
- **AND** ボーダーは `border-cork-border/40`、テキストは `text-cork-muted`
- **AND** 件数バッジは表示されない

#### Scenario: 有効フィルタが 3 件あると件数バッジが表示される

- **GIVEN** 有効フィルタが 3 件
- **THEN** "Filter" の右に `3` のバッジ (`bg-cork-accent text-white` の小型ピル) が表示される
- **AND** ボタンのボーダーは `border-cork-accent/50`

#### Scenario: 未入力フィルタはカウントされない

- **GIVEN** フィルタが `[{operator:"contains", tags:[]}, {operator:"is_empty"}]`
- **THEN** バッジは `1` (空タグの contains は無効、is_empty は有効)

#### Scenario: クリックで popover がトグルされる

- **GIVEN** popover が閉じている
- **WHEN** ユーザが `FilterButton` をクリックする
- **THEN** popover が開く
- **WHEN** ユーザがもう一度クリックする
- **THEN** popover が閉じる

### Requirement: `Cmd/Ctrl+F` キーボードショートカットは SearchBar にフォーカスする

`BoardPage` は `Cmd/Ctrl+F` (shift なし) でキーボードショートカットを処理しなければならない (MUST)。Settings / Create / Detail / Delete-confirm / ContextMenu など他のダイアログが開いている時はショートカットを無視しなければならない (MUST NOT)。`SearchBar` は `forwardRef` で `{ focus, blur }` を公開し、`BoardPage` から制御可能でなければならない (MUST)。

#### Scenario: Cmd/Ctrl+F で SearchBar にフォーカスが移る

- **GIVEN** ダイアログが開いておらず、SearchBar にフォーカスは無い
- **WHEN** ユーザが Cmd/Ctrl+F を押す
- **THEN** SearchBar の input にフォーカスが移る
- **AND** デフォルトのブラウザ動作は抑制される

#### Scenario: 他のダイアログが開いている時は無視される

- **GIVEN** SettingsDialog が開いている
- **WHEN** ユーザが Cmd/Ctrl+F を押す
- **THEN** SearchBar にフォーカスは移らない
- **AND** デフォルトのブラウザ動作も抑制されない

#### Scenario: SearchBar フォーカス中の Esc は input をクリア + blur する

- **GIVEN** SearchBar の input がフォーカスを持ち、value が `"bug"`
- **WHEN** ユーザが Esc を押す
- **THEN** value が `""` にクリアされる
- **AND** input から blur する

### Requirement: `TagFilterPopover` はフィルタの追加・編集・削除と全クリアを提供する

`TagFilterPopover` organism は、`filters: TagFilter[]` と `onFiltersChange(next: TagFilter[])` を props で受け取らなければならない (MUST)。FilterButton 直下に右端揃え (`position: fixed` + 計算座標) で表示し、`origin-top-right` の scale アニメーションで開閉しなければならない (MUST)。常に header (`Filters (N)` + 条件付き Clear all) / body / footer (`+ Add filter`) の 3 段構造で描画し、フィルタ 0 件時は body に "No filters applied" テキストを表示しなければならない (MUST)。close 時 (外側クリック / Esc / FilterButton トグル) に無効フィルタ (operand 未入力の tag-based) を prune しなければならない (MUST)。`Filters (N)` の `N` は **有効フィルタ件数** (`isValidFilter` true なもの) でなければならない (MUST)。

#### Scenario: フィルタ 0 件で空状態 body が表示される

- **WHEN** `filters=[]` で popover が開く
- **THEN** header に "Filters (0)"、body に "No filters applied" の muted テキスト、footer に `+ Add filter` ボタンが表示される
- **AND** Clear all は表示されない

#### Scenario: Add filter で新しい行が追加される

- **GIVEN** popover が開いており、フィルタは `[]`
- **WHEN** ユーザが `+ Add filter` をクリックする
- **THEN** 新しいフィルタ `{id: <uuid>, operator: "contains", tags: []}` が追加される
- **AND** body は空状態テキストから FilterRow 縦並びに切り替わる

#### Scenario: フィルタ行の operator を変更できる

- **GIVEN** 1 件のフィルタ `{operator: "contains", tags: ["bug"]}`
- **WHEN** ユーザが operator select を `not_contains` に変更する
- **THEN** `onFiltersChange` が `[{operator: "not_contains", tags: ["bug"]}]` で呼ばれる
- **AND** operand の tags は保持される

#### Scenario: operator を tag-based から empty 系に変更すると tags フィールドが消える

- **GIVEN** フィルタが `{operator: "contains", tags: ["bug"]}`
- **WHEN** ユーザが operator を `is_empty` に変更する
- **THEN** `onFiltersChange` が `[{operator: "is_empty"}]` で呼ばれる (型レベルで tags は存在しない)
- **AND** operand 入力欄は描画されなくなる

#### Scenario: フィルタ行の Remove ボタンで個別削除できる

- **GIVEN** フィルタが 3 件表示されている
- **WHEN** ユーザが 2 番目の行の X (Remove) ボタンをクリックする
- **THEN** `onFiltersChange` が 1 番目と 3 番目だけの配列で呼ばれる

#### Scenario: Clear all で全フィルタが削除される

- **GIVEN** フィルタが 3 件
- **WHEN** ユーザが header の `Clear all` をクリックする
- **THEN** `onFiltersChange([])` が呼ばれる
- **AND** body は空状態テキストに切り替わる
- **AND** popover は閉じない

#### Scenario: Esc キーで popover が閉じる (suggestion popover が無い場合)

- **GIVEN** popover が開いていて、TagEditor の suggestion popover はどれも開いていない
- **WHEN** ユーザが Esc キーを押す
- **THEN** popover が閉じる
- **AND** Filter ボタンにフォーカスが戻る

#### Scenario: suggestion popover が開いているときの Esc は popover を閉じない

- **GIVEN** popover が開いていて、operand input にフォーカス + 配下の suggestion popover が開いている
- **WHEN** ユーザが Esc キーを押す
- **THEN** suggestion popover のみが閉じる (`TagEditor` が `e.stopPropagation()` する)

#### Scenario: popover 外クリックで閉じる

- **GIVEN** popover が開いている
- **WHEN** ユーザが popover 外の領域をクリックする
- **THEN** popover が閉じる

#### Scenario: portal-rendered popup へのクリックは外側扱いされない

- **GIVEN** popover が開いていて、内部の Select dropdown または TagEditor suggestion popover が開いている (`document.body` 直下に Portal 描画)
- **WHEN** ユーザが Portal 内の要素 (`[data-floating-popup]` を持つ) をクリックする
- **THEN** popover は閉じない

#### Scenario: close 時に無効フィルタが自動削除される

- **GIVEN** popover が開いており、フィルタ `[{operator:"contains", tags:["bug"]}, {operator:"contains", tags:[]}]` がある (2 件目は無効)
- **WHEN** ユーザが Esc / 外側クリック / FilterButton 再クリックのいずれかで popover を閉じる
- **THEN** `onFiltersChange([{operator:"contains", tags:["bug"]}])` が呼ばれる (無効フィルタが prune される)

### Requirement: `TagEditor` molecule は `suggestions` / `maxTags` プロップによる autocomplete と最大タグ数制限をサポートする

既存 `TagEditor` molecule (`src/components/molecules/TagEditor.tsx`) は、オプションプロップ `suggestions?: string[]` と `maxTags?: number` を新規に受け付けなければならない (MUST)。両プロップが未指定の場合、既存の振る舞い (`task-tags` capability のシナリオすべて) を完全に維持しなければならない (MUST)。`suggestions` が指定された場合、入力欄フォーカス時に suggestion popover を `document.body` 直下に Portal 描画しなければならない (MUST)。候補のフィルタリングは入力中文字列に対する **case-insensitive fuzzy matching** (subsequence マッチ) でなければならない (MUST)。既選択タグ (`tags` に含まれる) は候補リストから除外しなければならない (MUST)。`maxTags === 1` のとき、`tags.length >= 1` であれば入力欄を `disabled` にしなければならない (MUST)。suggestion popover は `data-floating-popup="true"` 属性を持ち、ホスト popover の外側クリック判定から除外できなければならない (MUST)。

#### Scenario: suggestions 未指定時は既存の TagEditor 挙動を維持する

- **GIVEN** `TagEditor` を `suggestions` も `maxTags` も指定せずに描画する
- **WHEN** ユーザが入力欄にフォーカスする
- **THEN** suggestion popover は表示されない
- **AND** Enter / カンマ / Backspace / IME の挙動は `task-tags` capability のシナリオ通り

#### Scenario: suggestions 指定時はフォーカスで候補が表示される

- **GIVEN** `suggestions=["bug", "feature", "p0"]`, `tags=[]`
- **WHEN** ユーザが入力欄にフォーカスする
- **THEN** suggestion popover に 3 つの候補が表示される
- **AND** ↑ ↓ で選択を移動できる
- **AND** Enter で選択中の候補がチップとして追加される

#### Scenario: fuzzy filter で候補が絞り込まれる

- **GIVEN** `suggestions=["bug", "feature", "frontend"]`
- **WHEN** ユーザが "fr" と入力する
- **THEN** suggestion popover には "feature" と "frontend" のみが表示される

#### Scenario: 小文字入力で大文字含む候補が case-insensitive にマッチする

- **GIVEN** `suggestions=["Frontend", "Backend"]`
- **WHEN** ユーザが "front" と入力する
- **THEN** "Frontend" が候補に表示される

#### Scenario: 既選択タグは候補リストから除外される

- **GIVEN** `tags=["bug"]`, `suggestions=["bug", "feature"]`
- **WHEN** 入力欄にフォーカス
- **THEN** suggestion popover には "feature" のみが表示される
- **AND** "bug" は候補リストに含まれない

#### Scenario: 候補に無いタグも自由入力で追加できる

- **GIVEN** `suggestions=["bug"]`
- **WHEN** ユーザが "newtag" を入力して Enter
- **THEN** `onChange([..., "newtag"])` が呼ばれる
- **AND** suggestion popover は閉じる

#### Scenario: Esc で suggestion popover のみが閉じる

- **GIVEN** suggestion popover が開いている
- **WHEN** ユーザが Esc キーを押す
- **THEN** suggestion popover が閉じる
- **AND** TagEditor 自身は閉じない (input にフォーカスは残る)
- **AND** 親の Modal / Popover も閉じない (`e.stopPropagation()`)

#### Scenario: maxTags=1 でタグが 1 個になると入力欄が disabled になる

- **GIVEN** `maxTags=1`, `tags=[]`
- **WHEN** ユーザが "bug" を入力して Enter を押す
- **THEN** `onChange(["bug"])` が呼ばれる
- **AND** 入力欄に `disabled` 属性が付与される

#### Scenario: maxTags=1 でチップを削除すると再び入力可能になる

- **GIVEN** `maxTags=1`, `tags=["bug"]` で入力欄 disabled
- **WHEN** ユーザがチップの × ボタンで "bug" を削除する
- **THEN** `tags=[]` となり、入力欄の `disabled` が外れる

#### Scenario: suggestion popover は Portal 描画されホスト popover の overflow を逃れる

- **GIVEN** TagEditor がホスト popover (例: TagFilterPopover) 内に配置されている
- **WHEN** suggestion popover が開く
- **THEN** suggestion popover は `document.body` 直下に Portal 描画される
- **AND** `position: fixed` で trigger 位置を基準に表示される
- **AND** `data-floating-popup="true"` 属性を持つ

### Requirement: `TagOperandInput` molecule は operator に応じて `TagEditor` を薄くラップする

`TagOperandInput` molecule は `mode: "single" | "multi" | "none"`, `tags: string[]`, `onChange(next: string[]) => void`, `availableTags: string[]` を props で受けなければならない (MUST)。`mode === "none"` のとき null を return しなければならない (MUST)。`mode === "single"` のとき `<TagEditor tags onChange suggestions={availableTags} maxTags={1} />` を、`mode === "multi"` のとき `<TagEditor tags onChange suggestions={availableTags} />` を描画しなければならない (MUST)。

#### Scenario: none モードでは何も描画されない

- **WHEN** `<TagOperandInput mode="none" tags={[]} onChange availableTags={[]} />` がレンダリングされる
- **THEN** DOM に operand input 関連の要素は追加されない

#### Scenario: single モードは TagEditor を maxTags=1 で描画する

- **WHEN** `<TagOperandInput mode="single" tags=[] onChange availableTags={["bug","feature"]} />` が描画される
- **THEN** `TagEditor` が `maxTags=1` および `suggestions=["bug","feature"]` で描画される

#### Scenario: multi モードは TagEditor を maxTags 無しで描画する

- **WHEN** `<TagOperandInput mode="multi" tags=[] onChange availableTags={["bug","feature"]} />` が描画される
- **THEN** `TagEditor` が `maxTags` 無し / `suggestions=["bug","feature"]` で描画される

### Requirement: `Select` molecule の dropdown は Portal 描画される

`Select` molecule の dropdown は `document.body` 直下に `createPortal` で描画され、`position: fixed` で trigger の座標を基準に表示されなければならない (MUST)。これにより Modal / Popover 内 (transform stacking context を持つ親) で使用された場合でも viewport 基準の正しい位置に表示されなければならない (MUST)。dropdown 要素は `data-floating-popup="true"` 属性を持ち、ホスト popover の外側クリック判定から除外できなければならない (MUST)。表示テキストは `options.find(o => o.value === value)?.label ?? value` でラベルベース表示されなければならない (MUST)。

#### Scenario: Modal 内で開いても viewport 基準の正しい位置に表示される

- **GIVEN** Modal (`m.div` の transform animation) 内に Select が配置されている
- **WHEN** Select dropdown を開く
- **THEN** dropdown は viewport 基準で trigger の直下に表示される
- **AND** Modal の transform stacking context に閉じ込められない

#### Scenario: ラベルと value が異なるオプションでもラベルが表示される

- **GIVEN** `options=[{value: "is_empty", label: "is empty"}]`, `value="is_empty"`
- **WHEN** trigger ボタンがレンダリングされる
- **THEN** ボタンには "is empty" (label) が表示される
- **AND** "is_empty" (value) ではない
