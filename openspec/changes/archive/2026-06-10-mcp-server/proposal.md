# MCP Server を Tauri アプリに組み込む

## Why

Cork はローカル Markdown ファイルを Kanban として扱うアプリだが、現在は GUI からしかタスクを参照できず、Claude / Cursor などの LLM クライアントから状況を尋ねるたびに「ユーザーが GUI を見て手で伝える」必要がある。Model Context Protocol (MCP) を喋るサーバを Cork 自身に組み込めば、対応 MCP クライアントが直接タスク一覧を取得でき、「いま自分が何を抱えているか」を AI 駆動のワークフローに自然に組み込めるようになる。

v1 は read-only の `list_tasks` だけ。スコープを最小化して土台 (transport、認証、設定 UI、ライフサイクル) を先に固めることで、後続の書き込み系ツールを最小コストで足せる状態にする。

## What Changes

- Cork プロセス内で **Streamable HTTP** トランスポートの MCP サーバを `127.0.0.1` に bind して稼働させる (`rmcp` クレートを採用)。
- 公開ツールは **`list_tasks()` のみ**。戻り値は `{ "tasks": [{ title, file_path, status, tags }] }` (MCP 仕様で `outputSchema` の root が `object` 必須のため単一フィールド object でラップ)。`frontmatter` に `status` が設定された `.md` ファイルだけを返す既存の `read_all_tasks` セマンティクスを踏襲。
- 接続には MCP クライアントから **Bearer トークン認証** と **`X-Cork-Workspace` ヘッダー** (絶対パス) を要求する。どちらか欠ければ拒否する。
- 設定はすべて **グローバル** (プロセス単位): 有効/無効、認証トークン。既存 `settings.json` (`tauri_plugin_store`) の新規トップレベルキー `mcp` に統合して永続化。ポートは `DEFAULT_PORT = 8569` 固定でユーザー設定不可。
- 既存の `SettingsDialog` に「MCP Server」セクションを追加。OFF 時は Toggle + StatusIndicator のみ。ON 時は加えて Auth Token (手入力 + Generate + Copy)、`mcp.json` スニペットを表示。コピー操作は既存「Copy Path」と同じく `toast.success` でフィードバック。
- ポートが 8569 で固定 (UI なし)。bind 失敗時は Settings 画面の StatusIndicator + ErrorBanner で状態をユーザーに通知。
- 初回起動時はデフォルト OFF (明示的なユーザー opt-in を必須)。
- アプリ起動時に設定が `enabled=true` ならサーバを起動、`enabled=false` なら起動しない。設定変更で graceful restart。アプリ終了時に cancellation token で停止。
- ポート bind 失敗時 (8569 が他プロセスに占有されている場合) は別ポートに自動退避せず、Settings 画面にエラー状態を表示してユーザーに対応を促す。

## Capabilities

### New Capabilities

- `mcp-server`: Cork に Model Context Protocol サーバを組み込み、認証された外部 MCP クライアントが Cork のタスク一覧を取得できるようにする。トランスポート、認証、ツール公開、グローバル設定 UI、ライフサイクル管理を包含する。

### Modified Capabilities

(なし — 既存 spec に要件レベルの変更はない。`SettingsDialog` への UI 追加や `task::read_all_tasks` の可視性昇格は実装詳細であり、既存 capability の要件は変えない。)

## Impact

- **新規依存**: `rmcp` (server + transport-streamable-http-server + macros + schemars features)、`axum` (rmcp 経由)、`tokio` (Tauri 経由で既存)、`rand` (トークン生成)。
- **バックエンド新規モジュール**: `src-tauri/src/mcp.rs` (サーバ本体、handler、認証 middleware、設定型)。
- **既存バックエンド改修**:
  - `src-tauri/src/lib.rs` — `mcp::start` を `setup` で呼ぶ、`tauri::generate_handler!` に新コマンド追加、`RunEvent::Exit` で `mcp::stop`。
  - `src-tauri/src/state.rs` — MCP サーバのランタイム状態を保持する `mcp_runtime: Mutex<McpRuntime>` を追加 (`Stopped` / `Running(McpHandle)` / `Failed { port, error }` の 3 状態)。
  - `src-tauri/src/task.rs` — `read_all_tasks(&Path)` を `pub(crate)` に昇格。
- **新規 Tauri コマンド**: `mcp::get_settings`, `mcp::update_settings`, `mcp::generate_token`, `mcp::get_sample_config`, `mcp::get_server_status`。
- **フロントエンド新規**:
  - `src/api/mcp.ts` — 新コマンドラッパー。
  - `src/components/atoms/Toggle.tsx` — iOS 風スイッチ atom。
  - `src/components/molecules/CodeBlock.tsx` — pre 整形 + copy (`toast.success` で成功フィードバック)。
  - `src/components/molecules/StatusIndicator.tsx` — Running/Stopped/Error 表示。
  - `src/components/organisms/settings/McpServerSection.tsx` — MCP セクション本体。
  - `src/hooks/useMcpSettings.ts` — 設定読み書き + `store://change` イベント購読 (cross-window 同期) のドメインフック。
- **既存フロントエンド改修**:
  - `src/api/index.ts` / `src/components/organisms/settings/index.ts` — re-export 追加。
  - `src/components/organisms/settings/SettingsDialog.tsx` — `<McpServerSection />` を追加。
  - 各層の `AGENTS.md` — 新ファイル / 新ディレクトリの説明を追記。
- **永続化先**: 既存 `~/Library/Application Support/com.cork.app/settings.json` (`tauri_plugin_store` 経由) の新規トップレベルキー `mcp` 配下。`workspace_history` / `workspaces.*` (既存キー) には触らない。
- **権限 / Capability**: HTTP サーバはフロントエンドの WebView と独立しているため、`capabilities/default.json` の追加変更は不要。
- **CI / テスト**: `src-tauri/src/mcp.rs` の純粋ヘルパー (トークン生成、`mcp.json` スニペット生成、設定パース) に `cargo test` の unit を追加。Tauri runtime を要するハンドラ本体は既存方針通り unit test 対象外。
