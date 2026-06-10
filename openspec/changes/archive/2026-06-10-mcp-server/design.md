# Design: MCP Server を Tauri アプリに組み込む

## Context

Cork は Tauri 2 + React 19 で動く macOS 専用デスクトップアプリで、ローカルディレクトリ内の Markdown ファイル (frontmatter に `status` を持つもの) を Kanban として扱う。バックエンドは `src-tauri/` の Rust モジュール群、フロントエンドは `src/` の atomic design React。

MCP (Model Context Protocol) は、LLM クライアント (Claude Desktop, Claude Code, Cursor 等) が外部ツール / リソースに統一的にアクセスするためのプロトコル。stdio と Streamable HTTP の 2 トランスポートが主流で、後者は **常駐サーバ + クライアントが URL で接続** する形式 (旧 SSE トランスポートの後継)。

既存制約:

- `AppState` は **window 単位** で workspace を保持 (`src-tauri/src/state.rs`)。各ウィンドウが独立した workspace を開ける (multi-window 設計)。
- `SettingsDialog` (`src/components/organisms/settings/SettingsDialog.tsx`) は既に存在し、`Cmd+,` メニューから開く。Workspace Directory と Statuses を持つ。
- `tauri_plugin_store` で `settings.json` (ワークスペース履歴 / per-workspace filters) を永続化済み。
- 既存の `read_all_tasks(dir: &Path) -> Vec<Task>` (`src-tauri/src/task.rs:211`) はファイルシステムを直接読む純粋関数で、`frontmatter.status` がある `.md` だけ拾う。

## Goals / Non-Goals

**Goals:**

- MCP クライアントから Cork のタスク一覧を read-only で取得できる土台 (transport, 認証, 設定 UI, ライフサイクル) を構築する。
- 認証トークンと workspace ヘッダーで「Cork の MCP セッション」と「アクセス対象 workspace」を明示的に紐付ける。
- 設定 UI を完結させ、ユーザーが GUI だけで「有効化 → トークン取得 → `mcp.json` 用スニペットコピー」を完了できる。
- 同じ Cork プロセスから複数の MCP セッションが同時に開ける (1 プロセス、複数クライアント、各セッション独立)。
- 起動 / 停止 / ポート変更 / トークン変更を **graceful** に処理し、稼働中のセッションを安全に終端する。

**Non-Goals:**

- 書き込み系ツール (`create_task`, `update_task`, `delete_task` 等) — v2 以降。
- 複数 workspace を **1 つの MCP セッション内** で扱う機能。複数 workspace は MCP server エントリを複数登録する運用で対処。
- リモートアクセス (`0.0.0.0` への bind や TLS) — Cork はローカルアプリで、localhost only に絞ることでセキュリティを担保する。
- OAuth / DCR ベースの認証 — 静的 Bearer トークンで十分。
- macOS Keychain 統合 — `tauri_plugin_store` の Unix 権限保護で実用上十分。
- ポート衝突時の自動退避 — 「設定したポートで必ず立つ」予測可能性を優先。
- ステータス変更を MCP クライアントに **push** する subscriptions / notifications — read-only `list_tasks` のみで足りる。
- 設定画面のタブ化リファクタ — `SettingsDialog` がさらに膨らんだ将来の課題。

## Decisions

### Decision 1: トランスポートは Streamable HTTP

**選択**: `rmcp` クレートの `transport-streamable-http-server` を採用。`127.0.0.1` のみに bind。

**代替**:

- **stdio**: MCP のデフォルトで Claude Desktop も対応するが、stdio は「クライアントが MCP サーバを子プロセスとして起動」する前提。Cork は常駐 GUI アプリで、外部クライアントから「Tauri プロセスを spawn する」モデルは破綻する。
- **stdio ブリッジ用の別バイナリ**: stdio 互換のためだけに `cork-mcp-stdio` のような proxy バイナリを別途配布し、起動中の Cork に HTTP で転送する案。配布物が増え、ブリッジ自体のメンテも要するため、現代の MCP クライアント側がほぼ HTTP もサポートしている状況では割に合わない。

**理由**: 起動中の常駐プロセスに後付けで接続するという要件と完全一致。`rmcp` の Streamable HTTP server は axum ベースで、`Router` に `mount` する形で実装でき、認証ミドルウェアも axum の `from_fn` 等で前段に挟める。

### Decision 2: 認証は Bearer Token (静的)

**選択**: `Authorization: Bearer <token>` ヘッダー必須。トークンは 32 文字 base62 (プレフィックス無し)。手動入力も許可するが最低 12 文字をバリデート。`rand` クレートの `OsRng` (CSRNG) で自動生成。

**代替**:

- **認証なし (localhost を信頼)**: 同一マシンで動作する任意のローカルプロセスがタスクを読めてしまう。マルウェアやサンドボックス外のスクリプトが Cork の MCP に talk して `.md` の内容を leak する経路を残す。
- **OAuth 2.1 / Dynamic Client Registration**: MCP の仕様には載るが、Cork のような単一ユーザー / 単一マシン用途で OAuth フローを回す UX 負荷は過大。
- **mTLS / クライアント証明書**: ローカルでの鍵管理 UX が破綻。

**理由**: 静的 Bearer は MCP クライアント (Claude Desktop / Code / Cursor) すべてが `mcp.json` の `headers` で素直に書ける形式。CSRNG で 32 文字 base62 は約 190bit エントロピーで brute-force 耐性十分。

### Decision 3: Workspace は `X-Cork-Workspace` ヘッダーで必須指定

**選択**: MCP クライアントは `X-Cork-Workspace: <absolute path>` を必ず送る。Cork はリクエスト受信時に canonicalize してディレクトリ存在を確認するのみ。Cork で「開いている」workspace である必要はない。

**代替**:

- **URL クエリパラメータ (`?workspace=...`)**: 認証ヘッダーをどのみち `headers` で書く以上、workspace もヘッダーで統一する方が一貫性が高い。URL 中に絶対パスを混ぜると見た目も冗長。
- **tool パラメータで毎回指定**: MCP クライアントが意識する情報が増え、`mcp.json` 設定だけでセッションを完結できなくなる。
- **「Cork で開いている workspace のみ受け付ける」制約**: GUI 起動なしで管理したいユースケース (CI 的に Claude Code から定期チェックなど) を阻害する。認証トークンが渡った時点でローカルファイルシステムへのアクセス権はあるとみなして良い。
- **省略時に「開いている唯一の workspace」を採用するフォールバック**: 多窓環境で挙動が不安定になる。常に必須にした方が予測可能。

**理由**: 1 MCP セッション = 1 workspace の固定により、`list_tasks` のシグネチャは引数なしで完結する。複数 workspace を扱いたければクライアント側で MCP server エントリを複数登録する。`frontmatter.status` を持つ `.md` のみ返す既存セマンティクスにより、任意ディレクトリ指定でも `~/.ssh` のような場所から有意な情報は引けない。

### Decision 4: 設定は完全グローバル、既存 `settings.json` に統合、ポートは固定

**選択**: 有効/無効と認証トークンの 2 項目を、既存の `tauri_plugin_store` ストア `settings.json` に新規トップレベルキー `mcp` (オブジェクト) としてネスト格納する。`workspace_history` (配列) / `workspaces` (per-workspace 設定) の既存キーには触らない。ポートは `DEFAULT_PORT = 8569` 定数で固定し、UI からも `McpSettings` 型からも除外する (single source of truth)。

**代替**:

- **ワークスペース単位**: MCP サーバはプロセス単位の 1 リソース (ポートは唯一)。「window A は有効 / B は無効」「workspace ごとに別トークン」は物理的に意味を持たないか、複雑度に見合わない。
- **専用ファイル `mcp.json` に分離**: 当初案。だが (1) `.mcp.json` は MCP クライアント (Claude Code 等) がプロジェクトルートに置く慣習的なファイル名で、ユーザーが両者を混同するリスクがある。(2) MCP 設定は 3 キーしかなく、ファイルを分ける「関心の分離」の旨味よりも、ストアファイルが増える運用コストの方が上回る。

**理由**: 既存ストアの top-level キー追加で済むなら、それが最も小さい変更。`tauri_plugin_store` は file レベルで atomic write を保証するため、`workspace::set_workspace_directory` と `mcp::update_settings` が並行して同じ `settings.json` に書いても整合性は崩れない。`update_workspaces_map` は `workspaces.<path>.<setting>` のサブツリー専用の helper で、`mcp` キーは別のコードパスで読み書きするため衝突しない。

### Decision 5: ライフサイクルは設定ストアに従い、ランタイム状態は enum で AppState に保持

**選択**:

- 起動時に `settings.json` の `mcp` キーを読み、`enabled=true` ならサーバを起動 (`tokio::spawn`)。
- `AppState` に `mcp_runtime: Mutex<McpRuntime>` を追加。`McpRuntime` は以下の 3 状態を持つ enum:

  ```rust
  enum McpRuntime {
      Stopped,                              // 無効 or 未起動
      Running(McpHandle),                   // 稼働中
      Failed { port: u16, error: String },  // 直近の start で bind 失敗
  }
  ```

  `McpHandle` は `CancellationToken` + `JoinHandle` + `Arc<RwLock<String>>` (token swap 用) + `port: u16` を保持。

- `mcp::get_server_status` はこの enum から `McpStatus` を派生。
- 設定変更 (`mcp::update_settings`) は **差分検知** によりオペレーションを分岐:
  - `enabled` OFF→ON: start
  - `enabled` ON→OFF: stop
  - `token` のみ変更 (Running 中): `McpHandle.token` の `RwLock` を in-place swap、サーバは継続稼働
- Toggle ON で bind 失敗した場合、`enabled=true` は保存され、ランタイムは `Failed` 状態に入る。Toggle UI は ON のまま、status は error を表示。次に `port` を変えて再保存すれば再 start が試みられる。
- `RunEvent::Exit` ハンドラで `mcp::stop` を呼んで graceful 終了。
- 初回起動はデフォルト OFF (`enabled=false`, 自動生成された token は保持)。明示的にトグル ON するまでサーバは立たない。

**代替**:

- **常時オン**: ユーザーの明示的な同意なしに localhost ポートを開けるのはプライバシー的に不適切。
- **ポート bind 失敗時の自動退避**: ユーザーが MCP クライアントの `mcp.json` に書いたポートと、実際にサーバが立っているポートがズレる。MCP クライアント側からは「繋がらない」となり原因究明が困難。代わりに Settings 画面にエラーを露出させてユーザーに対応を促す。
- **`mcp_handle: Mutex<Option<McpHandle>>` (enum なし)**: bind 失敗時のエラー文字列を保持できず、`get_server_status` が「動いてないけど理由がわからない」状態を返してしまう。spec が要求する `error` フィールドを満たせない。
- **bind 失敗時に Toggle を OFF へバウンスバック**: ユーザーが「ON にしたい」という意図と、Settings 画面が示す状態が乖離する。「ON のまま赤い error」の方が修復への動線として自然。

**理由**: 「設定したポートで必ず立つ」+「ユーザーが明示的に opt-in する」という挙動が、デバッガビリティとセキュリティの両面で最も健全。enum で状態を一元化することで `mcp_handle` と `mcp_last_error` が drift する事故を構造的に防ぐ。

### Decision 6: バックエンドモジュール分離

**選択**: `src-tauri/src/mcp.rs` 単一ファイルで以下を持つ:

- `McpSettings` 型 (Serialize/Deserialize)
- `McpStatus` 型 (`{ running, port?, error? }`)
- `McpRuntime` 型 (Stopped / Running(McpHandle) / Failed の enum)
- `McpHandle` 型 (`CancellationToken`, `JoinHandle<()>`, `token: Arc<RwLock<String>>`, `port: u16`)
- `CorkMcpServer` (`#[derive(Clone)] struct`、`tool_router: ToolRouter<Self>` だけを持つ — `AppState` への参照は不要、workspace は HTTP ヘッダーから抽出するため)
- `#[tool_router]` impl (`list_tasks` 1 メソッド)
- `#[tool_handler] impl ServerHandler for CorkMcpServer {}`
- axum middleware (2 段、いずれも MCP プロトコル処理の前段):
  1. **auth middleware**: `Authorization: Bearer <token>` の検証。失敗で 401 + `WWW-Authenticate: Bearer`。
  2. **workspace middleware**: `X-Cork-Workspace` ヘッダーを抽出 → canonicalize → ディレクトリ存在チェック。成功時は `Workspace(PathBuf)` を request extensions に格納し、ハンドラから `Extension<Workspace>` で取得。欠落 / 不正で 400 を返す (JSON-RPC エラーではなく素の HTTP エラー)。
- `start(settings: &McpSettings) -> Result<McpHandle, McpStartError>`
- `stop(handle: McpHandle) -> ()` (cancel + drain join、1 秒タイムアウト)
- 純粋ヘルパー: `generate_token() -> String`, `build_sample_config(open_workspaces: &[PathBuf], port: u16, token: &str) -> String`, `validate_token(s: &str) -> Result<(), ValidationError>`, `slug_for_workspace(path: &Path) -> String`

**理由**: モジュールが密結合 (state, handler, transport が同じ概念単位) なので 1 ファイルにまとめる方が見通しが良い。`CorkMcpServer` から `AppState` 参照を外したことで、ハンドラはディスク読み取りに集約され、テスト時にも生 Rust 関数として呼びやすい。`AppState` への access が必要な箇所 (`get_sample_config` の open workspace 列挙) は Tauri command 側で `tauri::State` + `app.webview_windows()` から拾う。さらにファイルが増えたら `mcp/` ディレクトリ化を検討。

### Decision 7: `task::read_all_tasks` を `pub(crate)` に昇格

**選択**: 既存の `fn read_all_tasks(dir: &Path) -> Vec<Task>` (`src-tauri/src/task.rs`) は純粋関数で、frontmatter に `status` がある `.md` だけ拾うセマンティクスをそのまま MCP からも使いたい。`pub(crate)` に変更して `mcp.rs` から呼ぶ。

**代替**:

- **MCP 側でロジック再実装**: セマンティクス (例: 無効 frontmatter の扱い、order ソート) が二重管理になり drift する。
- **`task::list_tasks` (Tauri command) を内部から呼ぶ**: `WebviewWindow` と `AppState` の per-window cache に依存する。MCP は per-window 概念を持たないので不適合。

**理由**: 既存ロジックの単純再利用が最もリスクが小さい。`Task` の `id` フィールド (= file path) はそのまま `file_path` として返す。

### Decision 8: MCP の出力型は Task と別の DTO、配列は object でラップ

**選択**: MCP 向けの専用 struct を `mcp.rs` 内に定義し、配列は `tasks` フィールドを持つ object でラップして返す:

```rust
#[derive(Serialize, schemars::JsonSchema)]
struct McpTask {
    title: String,
    file_path: String,
    status: String,
    tags: Vec<String>,
}

#[derive(Serialize, schemars::JsonSchema)]
struct ListTasksOutput {
    tasks: Vec<McpTask>,
}
```

`body` と `order` は意図的に含めない。MCP 仕様 (`tools/list` の `outputSchema`) は root 型が `object` であることを要求するため、`Json<Vec<McpTask>>` を直接返すと rmcp がツール登録時に panic する (`Invalid output schema ... root type 'object', but found 'array'`)。`ListTasksOutput` の単一フィールドラッパでこれを満たす。

**代替**:

- **既存 `Task` をそのまま返す** — `body` が膨らむと LLM コンテキストを浪費する。`order` は LLM に渡しても解釈に困る数値。
- **`Vec<McpTask>` を直接 `Json` で返す** — 上述の MCP 仕様違反でサーバ起動時に panic する。
- **MCP の `content` (テキスト) として JSON 文字列を埋め込む** — クライアント側でパースが必要になり、`outputSchema` の恩恵 (型付き structured content) を捨てることになる。

**理由**: MCP は LLM 向け API。LLM が解釈しやすい最小フィールドに絞る + MCP プロトコル準拠を `ListTasksOutput` で同時に満たす。後で `body` を要求された場合は別ツール `get_task_body(file_path)` を追加する。将来ページネーション (`next_cursor`) や集計 (`total`) を足す余地もラッパの追加フィールドで開かれている。

### Decision 9: フロントエンドの atomic 振り分け

**選択**:

- `atoms/Toggle.tsx` — iOS 風スイッチ (`role="switch"`, `aria-checked`)。`MCP Server` 専用ではなく汎用 atom として作る。
- `molecules/CodeBlock.tsx` — `<pre>` + copy button (右上)。コピー成功/失敗を `toast.success` / `toast.error` でユーザーに伝える (既存の「Copy Path」と同じ UX)。
- `molecules/StatusIndicator.tsx` — colored dot + label。
- `organisms/settings/McpServerSection.tsx` — 上記を組み合わせた MCP セクション。Token 入力は `Input` + `IconButton` (Copy) の素朴な組み合わせで足り、専用 molecule (`SecretInput`) は作らない (表示・非表示切替が無く、サンプル JSON で平文表示される以上マスクの意味が薄い)。
- `hooks/useMcpSettings.ts` — `get_settings` / `update_settings` / `generate_token` / `get_sample_config` / `get_server_status` をまとめたドメインフック。すべての書き込み (enabled / token / Generate) を即時永続化 (debounce なし)。Cork はローカル完結アプリで毎キーストロークの IPC コストは無視できる。

**代替**: 全部 `McpServerSection` 内部にインライン実装 — 再利用性が落ち、`AGENTS.md` の atomic ルールに反する。当初は `SecretInput` も別 molecule にしていたが、マスク切替を廃止した結果 Input + Copy ボタンだけになり独立 molecule にする旨味が消えた。

**理由**: Cork のディレクトリ規約 (`src/AGENTS.md` 以下) に沿って素直に分割する。`Toggle` は今後 Cork で他にも使いうる primitive なので atom に置く。

### Decision 10: 設定 UI からのフィードバック設計

**選択**:

- 書き込みはすべて即時反映: enabled / token / Generate のいずれも入力直後に `update_settings` を発火。debounce は持たない (Cork はローカルアプリで IPC コストが事実上ゼロ、加えて auth token を手入力するユースケース自体ほぼ無い)。同じ方針を既存 `useFilterStore` にも適用済み。
- Toggle OFF 時は Toggle のみを表示 (`StatusIndicator` の `Stopped` は Toggle と二重情報になるため省略)。ON にすると Token / Sample / status badge が段階的に現れる。
- **ポーリングは持たず、`tauri-plugin-store` の `store://change` イベントを購読**してリアルタイムに UI を更新する (`src/api/mcp.ts::onMcpSettingsChange`)。Rust 側の `store.set()` が呼ばれるたびに `app.emit("store://change", ...)` がブロードキャストされ、全 window が同期する。
- AppState 経由でのみ変わる値 (sample mcp.json は「現在開いている workspace 一覧」に依存する) は store イベントを発火しないので、Settings ダイアログを開くたびに 1 回だけ `refresh()` を呼び全項目を再取得する。これで他 window で新規 workspace を開いたケースも次回ダイアログ開封時にカバーできる。
- bind エラーは `McpStatus::Failed { error }` を `StatusIndicator` のラベルに反映 + 詳細を `ErrorBanner` で表示。
- コピー操作は既存「Copy Path」と同じく `toast.success` / `toast.error`。ボタン自身のアイコン変化は持たない。

**代替**:

- **2 秒間隔ポーリング**: 元の実装。レイテンシ最大 2 秒で UX 上明らかに体感できた。ローカル完結アプリでネットワーク的な「コスト」が無いため、push 型に乗り換えるべきと判断。
- **`@tauri-apps/plugin-store` JS 包の API 利用** (`store.onKeyChange("mcp", cb)`): 機能的には同等だが、`store://change` イベントを直接 `listen()` で拾うだけなら npm 依存追加不要で済む。既存の `api/menu.ts` も同じ素朴な `listen()` 直叩きパターンを使っているので合わせる。
- **debounce 保存**: 元はサーバ負荷を気にして 500ms debounce を入れていたが、ローカルアプリでは無意味なコスト計上であり、ユーザーから debounce 撤廃の指示を受けた。

**理由**: ローカル完結のアプリではネットワーク的な「保存リクエスト集約」の動機が存在しないため、ユーザー意図と実状態の遅延を持つ理由が無い。同じ思想で、状態の取得側もポーリングではなく push に倒す。

## Risks / Trade-offs

- **[Risk] ローカルマシン内の他プロセスがトークンを盗む** → `settings.json` は Unix 権限で保護 (`~/Library/Application Support/com.cork.app/`) 。同マシンで他ユーザー権限を取られている時点で他に深刻な穴があるので Cork の責務外。Keychain 統合は将来の検討課題。
- **[Risk] ポート 8569 がデフォルトのまま他のローカルツールと衝突** → bind 失敗を握りつぶさず Settings 画面にエラーを露出。ユーザーは別ポートに変更して解決できる。
- **[Risk] 認証トークンを `settings.json` の JSON 平文で保存している** → 同上 (Unix 権限 + 同マシン信頼)。ユーザーが意図的にトークンを共有 (例: スクリーンキャプチャ) する事故は UI 側のマスク表示で軽減。
- **[Risk] `rmcp` の MCP 仕様追従が遅れて、新版クライアントが繋がらなくなる** → `Cargo.toml` の `rmcp` バージョンを明示し、`renovate.json` で update を受け取る運用に乗せる。仕様変更時の再生成は限定的 (1 ツールのみ)。
- **[Risk] graceful restart 中に進行中の MCP リクエストが切断される** → `rmcp` の `serve_server_with_ct` に `CancellationToken` を渡し、`cancel()` 後に `JoinHandle.await` する設計でドレインを待つ。短時間 (< 1s) の遮断は許容。
- **[Risk] MCP クライアントが workspace ヘッダーを送らずに繋ぎに来る** → initialize 時点で 400 を返す。MCP クライアント側にはエラーメッセージとして「Set `X-Cork-Workspace` header in your mcp.json」を返す。
- **[Risk] 任意ディレクトリ参照がプライバシーリスクと誤解される** → 設定画面の説明文に「only directories containing Cork-format tasks (`.md` with `status:` frontmatter) yield results」と明記。
- **[Trade-off] フロントエンドではトークンを常に平文表示する** (Decision 9 でマスク切替を廃止) → 同じトークン値が下の `mcp.json` スニペットでも平文で見えるため、入力欄だけマスクしても実効的な保護にならない。スクリーンキャプチャ等で意図せず晒すリスクは残るが、ローカル単一ユーザー前提のアプリでは Settings ダイアログを開いている状況自体ユーザー主導であり受容可能と判断。
- **[Trade-off] v1 は read-only。書き込みは v2 以降** → 「タスクを作って」など書き込み要求には MCP 側で対応できず、ユーザーが GUI に戻る必要がある。スコープを小さく保つ方が初期実装の品質を担保できる。
- **[Trade-off] サーバプロセスは Tauri と同居** → Tauri アプリ落ちると MCP も落ちる。これは要件の「Tauri 組み込み」の必然的な結果。

## Migration Plan

新規機能のため migration なし。既存 `settings.json` の他キー (`workspace_history`, `workspaces`) には触れず、`mcp` キーを追記するだけ。既存ユーザーの初回 `mcp` 読み込み時に `mcp` キーが無ければ `enabled=false`, `port=8569`, 新規生成された `token` のデフォルトを書き込む。

ロールバック: `settings.json` の `mcp` キーを削除 → 設定がリセット (デフォルト OFF) されるだけ。`SettingsDialog` のセクションは UI 上に残るが、`enabled=false` 状態で再表示される。他のキーには影響しない。

## Open Questions

- MCP クライアントの `mcp.json` に貼る `mcpServers` キー名 (`cork-<workspace-name>` の `<workspace-name>`) をどう生成するか — ディレクトリ basename のスラグ化で素朴に実装する。サンプル生成時のみの問題で、ユーザーは自由に書き換え可。スラグ化ルールは `[a-zA-Z0-9_-]` 以外を `-` 置換、複数 `-` を圧縮、両端 `-` を trim。
- アプリ更新でデフォルトポート 8569 が他アプリと競合した場合の通知方法 — 現状は Settings 画面の error 表示で十分と判断。
- `rmcp` のバージョン pin — 実装時に最新安定版を確認し、`Cargo.toml` に固定する。

> **Note on naming**: 本ドキュメント中で `mcp.json` という単語は、**MCP クライアント側の設定ファイル** (Claude Desktop / Claude Code 等がローカルに置くファイル) を指す。Cork 自身の設定は `settings.json` (既存ストア) の `mcp` トップレベルキー配下に書き込まれ、Cork が `mcp.json` というファイルを生成・参照することは無い。
