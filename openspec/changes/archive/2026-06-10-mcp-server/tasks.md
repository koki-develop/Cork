# Tasks: MCP Server を Tauri アプリに組み込む

## 1. 依存関係追加

- [x] 1.1 `src-tauri/Cargo.toml` に `rmcp = { version = "<最新安定版>", features = ["server", "transport-streamable-http-server", "macros", "schemars"] }` を追加
- [x] 1.2 `src-tauri/Cargo.toml` に `rand` を追加 (トークン生成 CSRNG 用)
- [x] 1.3 `src-tauri/Cargo.toml` に `tokio-util = { version = "0.7", features = ["rt"] }` を追加 (`CancellationToken` 用、rmcp 経由で transitive にあれば省略可)
- [x] 1.4 `bun install` 系の追加なしでフロントエンドは既存依存のみで実装できることを確認

## 2. バックエンド: 設定永続化と型

- [x] 2.1 `src-tauri/src/mcp.rs` を新規作成
- [x] 2.2 `McpSettings { enabled: bool, port: u16, token: String }` を定義 (Serialize/Deserialize)
- [x] 2.3 `McpStatus { running: bool, port: Option<u16>, error: Option<String> }` を定義 (Serialize)
- [x] 2.4 `generate_token() -> String` を実装 (CSRNG, 32 文字 base62、プレフィックス無し)
- [x] 2.5 `validate_token(s: &str) -> Result<(), ValidationError>` を実装 (最低 12 文字)
- [x] 2.6 `workspace.rs` の `SETTINGS_FILE` 定数を `pub(crate)` に昇格し、`mcp.rs` から再利用できるようにする (重複定義を避ける)
- [x] 2.7 `load_settings(app: &AppHandle) -> McpSettings` を実装。`app.store(SETTINGS_FILE)` 経由で `mcp` キーを読み込み、無ければ `enabled=false`, `port=8569`, `token=generate_token()` をデフォルトとして生成し `mcp` キーに書き戻す (他キーは変更しない)
- [x] 2.8 `save_settings(app: &AppHandle, settings: &McpSettings) -> CmdResult<()>` を実装。`app.store(SETTINGS_FILE)` の `mcp` キーだけを書き換え、`store.save()` で flush
- [x] 2.9 ユニットテスト: `generate_token` の長さ (32) / 文字種 (base62) / ユニーク性、`validate_token` の境界 (11 文字 NG / 12 文字 OK)、`McpSettings` の (de)serialize ラウンドトリップ
- [x] 2.10 ユニットテスト (or 結合): `mcp` キー追記が他キーを破壊しないこと (`workspace_history` を含むダミー store に対して `save_settings` を呼んで他キー不変を確認)

## 3. バックエンド: ランタイム状態と AppState

- [x] 3.1 `mcp.rs` に `McpHandle { cancel: CancellationToken, join: JoinHandle<()>, token: Arc<RwLock<String>>, port: u16 }` を定義
- [x] 3.2 `mcp.rs` に enum `McpRuntime { Stopped, Running(McpHandle), Failed { port: u16, error: String } }` を定義
- [x] 3.3 `mcp.rs` に `McpRuntime::to_status() -> McpStatus` を実装 (Running→`{running: true, port: Some, error: None}`, Failed→`{running: false, port: Some, error: Some}`, Stopped→`{running: false, port: None, error: None}`)
- [x] 3.4 `src-tauri/src/state.rs` の `AppState` に `mcp_runtime: Mutex<McpRuntime>` フィールドを追加 (デフォルト `Stopped`)
- [x] 3.5 `AppState::set_mcp_runtime(runtime)` / `take_mcp_handle() -> Option<McpHandle>` (Running 状態のときだけハンドルを取り出し Stopped に遷移) / `mcp_status() -> McpStatus` (to_status を呼ぶラッパー) / `with_mcp_handle<F>(f: F)` (Running 中の handle を借用してトークン swap などを行える) を追加
- [x] 3.6 `src-tauri/src/state.rs` のテストで新フィールドが他の per-window state に干渉しないこと、`set/take/status` の遷移が想定通りであること (Stopped → Running → token swap → take → Stopped、Failed への遷移) を確認

## 4. バックエンド: サーバ本体とツール定義

- [x] 4.1 `src-tauri/src/task.rs` の `read_all_tasks` を `pub(crate)` に変更
- [x] 4.2 `mcp.rs` に `McpTask { title, file_path, status, tags }` を定義 (Serialize + JsonSchema)。さらに MCP 仕様 (`outputSchema` の root は `object` 必須) を満たすため `ListTasksOutput { tasks: Vec<McpTask> }` ラッパも定義
- [x] 4.3 `CorkMcpServer` を unit struct (`pub struct CorkMcpServer;`) として定義 (Clone, Default)。`AppState` への参照は持たない (workspace は HTTP ヘッダーから抽出するため)。`tool_router` は `#[tool_router]` が生成する associated fn (`Self::tool_router()`) を `#[tool_handler]` 側が直接参照するため、フィールドで保持する必要はない (フィールド方式は dead code になる)
- [x] 4.4 `#[tool_router] impl CorkMcpServer { #[tool(...)] async fn list_tasks(...) -> Result<Json<ListTasksOutput>, rmcp::ErrorData> }` を実装。ハンドラは `Extension<Workspace>` で middleware が格納した検証済みディレクトリを受け取り、`read_all_tasks(&dir)` 呼び出し → `McpTask` に変換し `ListTasksOutput { tasks }` でラップして返す。ハンドラ自身は workspace 検証を行わない (middleware が前段で済ませている)
- [x] 4.5 `#[tool_handler] impl ServerHandler for CorkMcpServer { fn get_info(&self) -> ServerInfo { ... } }` を追加。`#[tool_handler]` 属性は `call_tool` / `list_tools` / `get_tool` を `Self::tool_router()` 経由で自動実装する — これを付け忘れると `tools/list` は空配列、`tools/call` は `method_not_found` を返してツール定義が外部から不可視になる致命的な状態に陥る。手動の `get_info` は既存メソッドのため `#[tool_handler]` は上書きしない

## 5. バックエンド: ミドルウェアと bind

- [x] 5.1 axum middleware `auth_layer(State<Arc<RwLock<String>>>, headers, req, next)` を実装: `Authorization: Bearer <token>` を `RwLock<String>` の値と定数時間比較 (`subtle::ConstantTimeEq` or 同等) し、不一致 / 欠落で 401 + `WWW-Authenticate: Bearer` を返す
- [x] 5.2 axum middleware `workspace_layer(headers, mut req, next)` を実装: `X-Cork-Workspace` ヘッダー値を取り出し、canonicalize → `is_dir()` 検証 → 成功時 `req.extensions_mut().insert(Workspace(path))`、欠落 / 値が空 / canonicalize 失敗 / ディレクトリでない場合は 400 + 簡潔なエラーメッセージで返す。`Workspace` は `pub struct Workspace(pub PathBuf)` の newtype
- [x] 5.3 `start(settings: &McpSettings) -> Result<McpHandle, McpStartError>` を実装。`TcpListener::bind("127.0.0.1:{port}")` → `Arc<RwLock<String>>` を生成 → `StreamableHttpService` を `Router` に mount → `tower::ServiceBuilder::new().layer(auth_layer).layer(workspace_layer)` を `.layer()` で重ねる (リクエスト到達時の実行順は auth → workspace → handler) → `CancellationToken` を作成 → `axum::serve(...).with_graceful_shutdown(token.cancelled())` を `tokio::spawn` → 返す `McpHandle` は `{cancel, join, token, port}` を含む
- [x] 5.4 bind エラーを enum `McpStartError { PortInUse { port: u16 }, Other(String) }` で分類し、`McpStatus.error` の文字列に変換するヘルパー (`Display`) を実装
- [x] 5.5 `stop(handle: McpHandle) -> ()` を実装: `handle.cancel.cancel()` → `tokio::time::timeout(1s, handle.join).await` (タイムアウトは無視して return)
- [x] 5.6 ユニットテスト: `auth_layer` (`Bearer` 正常系 / 不一致 / 欠落 / `bearer` 小文字 NG / `Bearer  ` 空白過剰 NG)、`workspace_layer` (有効パス / 欠落 / 空文字列 / 存在しないパス / ファイルパス指定 NG)

## 6. バックエンド: Tauri コマンドと配線

- [x] 6.1 `mcp::get_settings(app) -> CmdResult<McpSettings>` を実装 (token はマスク文字列ではなく実値を返す。マスクはフロント側の責務)
- [x] 6.2 `mcp::update_settings(app, state, settings: McpSettings) -> CmdResult<McpStatus>` を実装。差分検知で以下の分岐を行う:
  - **token のみ変更** (`enabled` / `port` 不変) かつ Running 中: `with_mcp_handle` 経由で `handle.token.write() = new_token` を swap、サーバ継続稼働
  - **その他 (enabled 切替 / port 変更 / Failed→retry など)**: `take_mcp_handle` で旧 handle を取り出し `stop` → `enabled=true` なら `start` を呼び結果 (`Running(...)` か `Failed{...}`) を `set_mcp_runtime`
  - 永続化は分岐の前に行う (`save_settings`)
  - 戻り値は `state.mcp_status()` を返す
- [x] 6.3 `#[tauri::command] mcp::generate_token() -> String` を実装 (Tauri command として `generate_token` の名前で公開)。内部は純粋ヘルパー `mint_token()` を呼ぶだけ (`#[tauri::command]` 関数の Rust 名 = wire 名のため、helper と command で識別子を共有できない都合上 helper 側を別名にしている)。永続化は別途 `update_settings` 経由
- [x] 6.4 `mcp::get_sample_config(app, state) -> String` を実装。`app.webview_windows()` を回し、各 window label に対して `state.workspace(label)` で workspace を引く。dedup したリストを `build_sample_config(open_workspaces, port, token)` ヘルパーに渡して JSON 文字列を得る。開いている workspace が 0 件のときは空オブジェクト `"{}"` の JSON を返す
- [x] 6.5 `mcp::get_server_status(state) -> McpStatus` を実装 (`state.mcp_status()` 呼び出し)
- [x] 6.6 `src-tauri/src/lib.rs` の `tauri::generate_handler![...]` に 5 コマンドを追加 (`mcp::get_settings`, `mcp::update_settings`, `mcp::generate_token`, `mcp::get_sample_config`, `mcp::get_server_status`)
- [x] 6.7 `src-tauri/src/lib.rs` の `setup` で `mcp::load_settings` を呼び、`enabled=true` なら `mcp::start` を試みる。`Ok(handle)` → `set_mcp_runtime(Running(handle))`、`Err(McpStartError)` → `set_mcp_runtime(Failed{port, error})` に格納する。**いずれの場合も setup 自体は成功させ、Kanban UI の起動を妨げない**
- [x] 6.8 `src-tauri/src/lib.rs` の `app.run` ハンドラに `RunEvent::Exit` ケースを追加し、`take_mcp_handle` 経由で `mcp::stop` を呼ぶ (handle が無ければ no-op)
- [x] 6.9 ユニットテスト: 純粋ヘルパー `build_sample_config` の JSON 構造 (workspace 0 件 / 1 件 / 複数件)、`slug_for_workspace` (空白 → `-`、非 ASCII → `-`、複数 `-` の圧縮、両端 trim、重複 basename の衝突確認は v1 スコープ外として workspace のフルパスを `X-Cork-Workspace` で区別すれば足りる)

## 7. フロントエンド: API ラッパー

- [x] 7.1 `src/api/mcp.ts` を新規作成。`getSettings`, `updateSettings`, `generateToken`, `getSampleConfig`, `getServerStatus` を `invoke<T>` で薄くラップ
- [x] 7.2 `src/api/index.ts` に re-export を追加
- [x] 7.3 `src/api/AGENTS.md` の Files セクションに `mcp.ts` を追記

## 8. フロントエンド: ドメインフック

- [x] 8.1 `src/hooks/useMcpSettings.ts` を新規作成。`get_settings` で初期ロード → state を返す。`updateEnabled(bool)` / `updateToken(string)` / `generateToken()` はいずれも即時保存 (debounce なし、Cork はローカル完結アプリのため)
- [x] 8.2 同フックは `status` / `sampleConfig` も保持する。**ポーリングではなく `tauri-plugin-store` の `store://change` イベント (`mcp` キー) を購読**して全 window 間でリアルタイム同期する (`src/api/mcp.ts::onMcpSettingsChange`)。Settings ダイアログを開いたタイミングで一度 refresh を走らせ、AppState のみで変わる値 (sampleConfig が依存する「現在開いている workspace 一覧」) も反映する
- [x] 8.3 `src/hooks/AGENTS.md` に `useMcpSettings.ts` の説明を追記

## 9. フロントエンド: 新規 atoms

- [x] 9.1 `src/components/atoms/Toggle.tsx` を新規作成 (`role="switch"`, `aria-checked`, `cursor-pointer`, 200ms color transition, `prefers-reduced-motion` で 0ms に短縮)
- [x] 9.2 `src/components/atoms/index.ts` に re-export を追加
- [x] 9.3 `src/components/atoms/AGENTS.md` の Files セクションに `Toggle.tsx` を追記

## 10. フロントエンド: 新規 molecules

> Decision 9 に従い `SecretInput` molecule は作らない (マスク切替を廃止した結果、Input + IconButton (Copy) を `McpServerSection` 内にインラインで置けば足りる)。
> したがって新規 molecule は `CodeBlock` と `StatusIndicator` の 2 つのみ。

- [x] 10.1 `src/components/molecules/CodeBlock.tsx` を新規作成 (`<pre>` + コピー、`font-mono`)
- [x] 10.2 `src/components/molecules/StatusIndicator.tsx` を新規作成 (色付きドット + ラベル、`kind: "running" | "stopped" | "error"`)
- [x] 10.3 `src/components/molecules/index.ts` に re-export を追加
- [x] 10.4 `src/components/molecules/AGENTS.md` に 2 ファイルの説明を追記

## 11. フロントエンド: 新規 organism

> Decision 4 に従い port は `DEFAULT_PORT = 8569` 固定で UI 露出なし。Port 入力 / Port エラー表示 / `onUpdatePort` ハンドラのいずれも実装しない。

- [x] 11.1 `src/components/organisms/settings/McpServerSection.tsx` を新規作成。props は `settings`, `status`, `sampleConfig`, `onUpdateEnabled`, `onUpdateToken`, `onGenerateToken` を受け取る pure-UI organism
- [x] 11.2 セクションヘッダーに「Global · applies to all windows」相当の文言を表示
- [x] 11.3 状態表示の右上配置 (`StatusIndicator` で Running/Stopped/Error)
- [x] 11.4 Toggle / Auth Token (Input + Generate IconButton + Copy IconButton をインライン配置) / Sample mcp.json (CodeBlock) のレイアウト
- [x] 11.5 OFF 時は Toggle のみ表示 (StatusIndicator の "Stopped" は Toggle と二重情報のため省略、Decision 10)。Token / Sample は ON のときだけ段階的に表示する。Failed 時のみ Toggle が ON のまま StatusIndicator の error バッジ + ErrorBanner が現れる
- [x] 11.6 Token の 12 文字未満は ErrorBanner で警告
- [x] 11.7 `src/components/organisms/settings/index.ts` に re-export を追加
- [x] 11.8 `src/components/organisms/settings/AGENTS.md` に `McpServerSection.tsx` の説明を追記

## 12. フロントエンド: SettingsDialog への統合

- [x] 12.1 `src/components/organisms/settings/SettingsDialog.tsx` の props に `mcpProps: McpServerSectionProps` を受け取れるよう追加
- [x] 12.2 dialog 内に `<McpServerSection {...mcpProps} />` を Statuses の下に追加
- [x] 12.3 Token は常に平文表示 (Decision 9 で masking を廃止)。`McpServerSection` が抱える local state は `tokenDraft` (12 文字未満を一時的に保持するためのドラフトバッファ) のみで、`SettingsDialog` の閉じ/開きで `<Modal isOpen={isOpen}>` 配下の条件レンダリングにより再マウントされ初期化される
- [x] 12.4 `BoardPage` で `useMcpSettings(isOpen)` を呼び、`mcpProps` を生成して `SettingsDialog` に渡す
- [x] 12.5 organisms 内では hook を直接呼ばないこと、Tauri 副作用も props 経由で受けることを確認 (`.oxlintrc.json` の `no-restricted-imports` が違反を検出する)

## 13. 動作確認

- [x] 13.1 `cargo test` がパスする (`mcp.rs` の純粋ヘルパー、`state.rs` の既存テスト、その他)
- [x] 13.2 `bun run lint` および `bun run fmt:check` がパスする
- [x] 13.3 `bunx tsc --noEmit` がパスする
- [ ] 13.4 `bun run tauri dev` で起動して以下を手動確認:
  - 初回起動時に `settings.json` の `mcp` キーが `enabled=false` で追記され、`workspace_history` 等の既存キーが破壊されていない
  - Settings → MCP Server の Toggle ON でサーバが立ち、`StatusIndicator` が「Running on :8569」になる
  - `curl -H "Authorization: Bearer <wrong>" -H "X-Cork-Workspace: /path" http://127.0.0.1:8569/mcp` が 401 を返す
  - `curl` で正しいトークン + 正しい workspace + initialize JSON-RPC を送ると 200 で initialize 応答が返る
  - `tools/list` で `list_tasks` のみが返る
  - `tools/call` で `list_tasks` を呼ぶと `frontmatter.status` のあるファイルだけが返り、`body` と `order` は含まれない
  - Port を 8569 → 9000 に変更すると 8569 が解放され 9000 で listen される
  - Token を Generate で再生成するとサーバは継続稼働し、旧トークンでの認証は失敗する
  - Toggle OFF で接続が切れる
  - 8569 を他プロセスで占有した状態で Toggle ON すると「Port 8569 in use」と表示される
  - Cork を `Cmd+Q` で終了するとポートが解放される
- [x] 13.5 Claude Desktop / Claude Code いずれかで `mcp.json` にコピーしたスニペットを貼り、実際に `list_tasks` が呼べることを確認 (Claude Code から `/mcp` で `Reconnected to cork-tasks.` を確認、`list_tasks` 呼び出しで 67 件の `{ "tasks": [...] }` 応答を取得済み)
