# mcp-server Specification

## Purpose

Cork に Model Context Protocol サーバを組み込み、認証された外部 MCP クライアント (Claude Desktop / Claude Code / Cursor 等) が Cork のタスク一覧を read-only で取得できるようにする。Streamable HTTP トランスポート (`127.0.0.1:8569` 固定) で稼働し、Bearer トークン認証と `X-Cork-Workspace` ヘッダーで「Cork の MCP セッション」と「アクセス対象 workspace」を明示的に紐付ける。設定はプロセス単位 (window 非依存) で `settings.json` の `mcp` トップレベルキー配下に永続化、ユーザは `SettingsDialog` の「MCP Server」セクションから有効化トグル / トークン管理 / `mcp.json` スニペット取得まで完結できる。

## Requirements

### Requirement: MCP サーバはアプリ起動時に設定に従って起動する

Cork プロセス起動時、`tauri_plugin_store` の `settings.json` の `mcp` キーから MCP 設定 (`enabled`, `token`) を読み込み、`enabled` が `true` のときに限り MCP サーバを起動する。サーバは `127.0.0.1:8569` (port 8569 固定) で Streamable HTTP トランスポートとして bind する。`enabled` が `false` ならサーバプロセス内タスクは生成しない。`mcp` キーが存在しない初回起動時は `enabled: false`, `token` をその場で自動生成 (CSRNG, 32 文字 base62) して `settings.json` に書き込む (他キーは変更しない)。

#### Scenario: 初回起動 (mcp キー無し)

- **WHEN** Cork を初めて起動する、または既存ユーザーがこのバージョンに更新して初回起動する
- **THEN** `settings.json` に `mcp: { enabled: false, token: <ランダムな 32 文字 base62> }` が追記される
- **AND** `workspace_history` / `workspaces` など `settings.json` の既存キーは変更されない
- **AND** MCP サーバは bind されない (どのポートも listen していない)

#### Scenario: 起動時に enabled=true

- **WHEN** `settings.json` の `mcp.enabled=true` が保存されている状態で起動する
- **THEN** MCP サーバは `127.0.0.1:8569` で Streamable HTTP トランスポートを受け付ける状態になる
- **AND** `mcp::get_server_status` が `{ kind: "running", port: 8569 }` を返す

#### Scenario: 起動時に enabled=false

- **WHEN** `settings.json` の `mcp.enabled=false` が保存されている状態で起動する
- **THEN** MCP サーバは起動せず、ポート 8569 も bind しない
- **AND** `mcp::get_server_status` が `{ kind: "stopped" }` を返す

#### Scenario: ポート bind 失敗

- **WHEN** ポート 8569 が既に他プロセスに使用されている状態で `enabled=true` で起動する
- **THEN** サーバは別ポートへの自動退避をせず、起動失敗を `McpStatus::Failed` に格納する
- **AND** `mcp::get_server_status` が `{ kind: "failed", error: "Port 8569 in use" }` を返す
- **AND** 既存の他機能 (Kanban UI 等) は影響を受けず通常通り動作する

### Requirement: MCP サーバは認証ヘッダーで Bearer トークンを検証する

すべての HTTP リクエスト (initialize, tool call, ping 等) は `Authorization: Bearer <token>` ヘッダーを必須とする。トークンが `settings.json` の `mcp.token` に保存されている値と完全一致しない場合、リクエストは MCP プロトコルレイヤーに到達する前に 401 で拒否される。ヘッダーが欠落している場合も 401 で拒否される。

#### Scenario: 正しいトークンで接続

- **WHEN** MCP クライアントが `Authorization: Bearer <保存されている token と一致する文字列>` を付けてリクエストを送る
- **THEN** リクエストは MCP ハンドラに渡される

#### Scenario: トークン不一致

- **WHEN** MCP クライアントが `Authorization: Bearer <誤った文字列>` を送る
- **THEN** サーバは HTTP 401 を返す
- **AND** レスポンスに `WWW-Authenticate: Bearer` ヘッダーを含む
- **AND** リクエスト本文は MCP ハンドラに渡されない

#### Scenario: Authorization ヘッダー欠落

- **WHEN** MCP クライアントが `Authorization` ヘッダーを付けずにリクエストを送る
- **THEN** サーバは HTTP 401 を返す

### Requirement: MCP サーバは `X-Cork-Workspace` ヘッダーで workspace を特定する

すべての MCP リクエストは `X-Cork-Workspace` ヘッダーで対象 workspace の絶対パスを必須とする。サーバはこのパスを canonicalize し、ディレクトリとして存在することのみ検証する (Cork で「開かれている」必要はない)。ヘッダーが欠落、空、または canonicalize 後に存在しないパスの場合、リクエストは 400 で拒否される。

#### Scenario: 有効な workspace パス

- **WHEN** MCP クライアントが `X-Cork-Workspace: /Users/alice/tasks` を送り、そのパスが実在するディレクトリである
- **THEN** リクエストはそのパスを対象 workspace として MCP ハンドラに渡される

#### Scenario: 開いていない workspace パス

- **WHEN** MCP クライアントが Cork の GUI で開いていないが実在する別ディレクトリのパスを `X-Cork-Workspace` で指定する
- **THEN** リクエストはそのパスを対象 workspace として処理される (GUI で開いている必要はない)

#### Scenario: 存在しないパス

- **WHEN** `X-Cork-Workspace: /nonexistent/path` を送る
- **THEN** サーバは HTTP 400 を返し、エラーメッセージで存在しない workspace パスであることを示す

#### Scenario: ヘッダー欠落

- **WHEN** クライアントが `X-Cork-Workspace` ヘッダーを送らない
- **THEN** サーバは HTTP 400 を返し、ヘッダー必須である旨を伝える

### Requirement: MCP サーバは `list_tasks` ツールを公開する

サーバは MCP 仕様の `tools/list` で `list_tasks` ツール 1 件のみを返す。クライアントが `tools/call` で `list_tasks` を呼ぶと、現セッションの workspace ディレクトリを直接読み、`frontmatter` に `status` フィールドが設定されている `.md` ファイルだけを抽出し、オプショナルな `query` / `filters` 引数でフィルタリングした結果を `{ "tasks": [{ title, file_path, status, tags }] }` として返す。

ツールは以下のオプショナル引数を受け付ける:

- `query`（任意、文字列）: タイトルに対する fuzzy 検索。大文字小文字を区別せず、部分一致・非連続一致を許容する。空文字列または未指定の場合はフィルタリングなし。
- `filters`（任意、配列）: タグフィルターのリスト。各要素は `operator` で識別される discriminated union。複数指定時は AND 結合される。空配列または未指定の場合はフィルタリングなし。

MCP 仕様は `outputSchema` の root が `object` であることを要求するため、タスク配列は単一フィールド `tasks` を持つオブジェクトでラップする。`title` はファイル名 (拡張子なし)、`file_path` はファイルの絶対パス、`status` と `tags` は frontmatter の値。タスクが 1 件もない workspace に対しては `{ "tasks": [] }` を返す (エラーではない)。引数なしの呼び出しは従来通り全タスクを返す（後方互換性維持）。

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

### Requirement: MCP 設定はグローバルに永続化される

MCP 設定 (`enabled`, `token`) は `tauri_plugin_store` の既存ストア `settings.json` の新規トップレベルキー `mcp` 配下にネスト保存される。これらの設定はプロセス全体に対して 1 セット (window 単位や workspace 単位ではない)。`workspace_history` / `workspaces` (per-workspace filters) など `settings.json` の既存キーには干渉しない。ポートは UI から変更できず、コード内の `DEFAULT_PORT = 8569` 定数が単一の真実の源 (Single Source of Truth)。

#### Scenario: 設定の保存場所

- **WHEN** MCP 設定を変更する
- **THEN** `~/Library/Application Support/com.cork.app/settings.json` の `mcp` トップレベルキーが更新される
- **AND** `workspace_history` / `workspaces` など同ファイル内の既存キーの値は変更されない

#### Scenario: 複数 window でも設定は共通

- **WHEN** Cork が複数 window を開いている状態でいずれかの window の Settings から `token` を変更する
- **THEN** 変更は全 window に共通の MCP サーバインスタンスに反映される (window ごとに別 token で認証されることはない)

### Requirement: Frontend は MCP 設定を `SettingsDialog` 内の「MCP Server」セクションで操作できる

`SettingsDialog` (`Cmd+,`) に新しいセクションを追加する。セクションは有効/無効の Toggle を常に表示する。Toggle が ON の時に限り、以下が表示される:

- StatusIndicator (Running / Failed) — Stopped 時は Toggle が OFF であることが状態を兼ねるため省略
- 認証トークンの編集 (手入力 + 自動生成 + コピー、表示・非表示の切り替えは無し)
- 現在開いている workspace ベースで生成された `mcp.json` スニペットの表示とコピー

ポートは UI から変更できない (`DEFAULT_PORT = 8569` 固定)。Toggle が OFF の時はセクションのチラ見せ要素を抑え、Toggle のみを見せる (StatusIndicator の "Stopped" は Toggle と二重情報になるため省略)。

#### Scenario: セクション表示 (OFF 時)

- **WHEN** ユーザーが `Cmd+,` で `SettingsDialog` を開き、`mcp.enabled=false` である
- **THEN** 既存の Workspace Directory / Statuses に加えて「MCP Server」セクションが下部に表示される
- **AND** セクションには Toggle のみが表示される
- **AND** StatusIndicator / Auth Token / mcp.json フィールドはいずれも表示されない

#### Scenario: セクション表示 (ON 時)

- **WHEN** `mcp.enabled=true` の状態で `SettingsDialog` を開く
- **THEN** Toggle と StatusIndicator に加えて、Auth Token フィールドと mcp.json スニペットが表示される

#### Scenario: 有効化トグル

- **WHEN** ユーザーが Toggle を OFF から ON に切り替える
- **THEN** バックエンドの `mcp::update_settings` が即時呼ばれ、サーバが起動する
- **AND** Toggle の `aria-checked` が `true` になる
- **AND** 状態表示が「Running on :8569」に更新される
- **AND** Auth Token フィールドと mcp.json スニペットが新たに表示される

#### Scenario: 有効化トグル時に bind 失敗

- **WHEN** ユーザーが Toggle を OFF から ON に切り替えるが、ポート 8569 が他プロセスに使用されている
- **THEN** `settings.json` の `mcp.enabled=true` は保存される
- **AND** Toggle の `aria-checked` は `true` のままで、OFF にバウンスバックしない
- **AND** 状態表示が「Port 8569 in use」のエラーバッジに切り替わる
- **AND** セクション内に詳細を示す `ErrorBanner` が表示される
- **AND** ポート占有プロセスを停止してから再度 Toggle を OFF→ON すると `mcp::update_settings` が再 start を試み、成功時は Running 状態に遷移する

#### Scenario: 無効化トグル

- **WHEN** ユーザーが Toggle を ON から OFF に切り替える
- **THEN** バックエンドの `mcp::update_settings` が即時呼ばれ、サーバが停止する
- **AND** 状態表示が「Stopped」に更新される
- **AND** Auth Token フィールドと mcp.json スニペットが非表示になる

#### Scenario: トークン自動生成

- **WHEN** ユーザーが「Generate」ボタンをクリックする
- **THEN** バックエンドの `mcp::generate_token` で新規トークンが生成され、入力欄に反映される
- **AND** 同時にバックエンドの `mcp::update_settings` で永続化される

#### Scenario: トークン手動入力

- **WHEN** ユーザーが入力欄にトークンを手入力する
- **THEN** 12 文字未満の入力ではバリデーションエラーが `ErrorBanner` で表示される
- **AND** 12 文字以上の入力では入力のたびに即時 `mcp::update_settings` で永続化される (debounce なし)

#### Scenario: トークンのコピー

- **WHEN** ユーザーが Auth Token のコピーボタン (📋) をクリックする
- **THEN** トークン文字列がクリップボードにコピーされる
- **AND** 既存の「Copy Path」ボタンと同じスタイルで `toast.success("Copied token to clipboard")` が表示される

#### Scenario: mcp.json スニペットの自動生成

- **WHEN** Toggle が ON の状態で `SettingsDialog` を開く
- **THEN** 現在 Cork のいずれかの window で開かれている全 workspace に対応するエントリを含む `mcp.json` スニペットが表示される
- **AND** 各エントリは `url: "http://127.0.0.1:8569/mcp"`, `headers.Authorization: "Bearer {token}"`, `headers.X-Cork-Workspace: {workspace path}` を含む

#### Scenario: workspace 未オープン時のプレースホルダ

- **WHEN** Toggle が ON だがどの window でも workspace が選択されていない状態で SettingsDialog を開く
- **THEN** `mcp.json` 領域には「Open a workspace first.」相当のプレースホルダが表示される

#### Scenario: mcp.json スニペットのコピー

- **WHEN** ユーザーが `mcp.json` のコピーボタンをクリックする
- **THEN** JSON 文字列がクリップボードにコピーされる
- **AND** `toast.success("Copied mcp.json to clipboard")` が表示される

### Requirement: 設定変更時はサーバが graceful に再起動する

`mcp::update_settings` 呼び出し時、変更内容に応じて以下を実行する:

- `enabled` の変更: false→true で start、true→false で stop。
- `token` の変更: middleware が握る `Arc<RwLock<String>>` を swap するのみで再起動しない (既存セッションは次回リクエストから新トークン検証になる)。

#### Scenario: トークン変更

- **WHEN** Running 中に `token` を変更する
- **THEN** サーバプロセスタスクは再起動されない (`JoinHandle` は同じ)
- **AND** 直後のリクエストから新トークンでの認証が要求される

#### Scenario: 無効化

- **WHEN** `enabled` を true から false に変更する
- **THEN** サーバはサーバプロセスタスクを停止する
- **AND** ポート 8569 が解放される
- **AND** 後続のリクエストは TCP レベルで接続できなくなる
- **AND** 進行中の `list_tasks` リクエストが存在する場合、それらは drain されて 1 秒以内に完了する

### Requirement: アプリ終了時にサーバは graceful に停止する

Cork が `RunEvent::Exit` を受け取った時点で、稼働中の MCP サーバは cancellation token を発火させて停止する。進行中のリクエストは可能な限り完了させる。

#### Scenario: 正常終了

- **WHEN** ユーザーが `Cmd+Q` で Cork を終了する
- **THEN** MCP サーバは cancellation token を受けて新規接続の受付を止める
- **AND** 進行中のリクエストは完了するか 1 秒のタイムアウトで打ち切られる
- **AND** プロセス終了までに bind ポートが解放される

### Requirement: HTTP サーバはバインドアドレスを `127.0.0.1` のみに制限する

外部ネットワークからのアクセスを防ぐため、サーバは `0.0.0.0` や `::` には bind しない。

#### Scenario: localhost 以外への接続試行

- **WHEN** 外部ネットワーク上のホストから `<Cork が動いているマシンの LAN IP>:8569` に接続を試みる
- **THEN** TCP レベルで接続が拒否される (bind されていないため)
