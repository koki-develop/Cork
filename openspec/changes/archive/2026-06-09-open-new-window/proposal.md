## Why

現在 Cork はプロセスあたり 1 つのウィンドウしか持てず、複数ワークスペースを横並びで参照したい場合はアプリを再起動してワークスペースを切り替えるしかない。ワークスペース履歴は既に `settings.json` に永続化されているにもかかわらず、ユーザーが履歴から直接ワークスペースを開く UI 経路が存在しないため、設定ダイアログを開いてディレクトリピッカーから選び直す多段操作が必要になっている。複数プロジェクトを横断して作業する際の摩擦を取り除くため、複数ウィンドウ同時展開と履歴ベースのワークスペース選択 UI を導入する。

## What Changes

- **BREAKING**: `AppState` のワークスペース・タスクキャッシュ・`last_reported` スナップショットを「単一値」から「ウィンドウラベル → 値」のマップ構造に置き換える。すべての `#[tauri::command]` はウィンドウラベルをハンドラ引数で受け取り、自ウィンドウのスコープのみ参照・更新する。
- macOS メニューに `File > New Window` (`Cmd+Shift+N`) を追加する。選択時は新しい `WebviewWindow` をユニークなラベル (`workspace-<n>`) で生成し、新規ウィンドウは「ワークスペース未選択」状態 (WelcomePage) で起動する。
- `WelcomePage` を再設計し、既存のヒーロー (ロゴ + `Select Workspace Directory` CTA) に加えて、**Recent Workspaces** セクションを下部に表示する。実在するディレクトリ (`p.is_dir()` で検証) のみを表示し、項目クリックで即座に当該ウィンドウのワークスペースを設定して BoardPage に遷移する。履歴が空ならセクション自体を非表示にする。
- 新規 Tauri コマンド: `list_workspace_history` (実在ディレクトリのみフィルタした履歴を返す)。新規 API ラッパー `src/api/workspace.ts` に `listWorkspaceHistory` を追加。ウィンドウ生成は menu イベントハンドラから内部関数 `open_new_window_impl` を直接呼ぶ形にし、フロントエンド側に command / API ラッパーは公開しない (v1 ではフロントエンドからウィンドウ生成を呼ぶユースケースが存在しないため YAGNI)。
- `get_workspace_directory` の「履歴からの自動復元」フォールバックを削除する。起動時の自動復元はバックエンドの `setup()` フェーズで `main` ウィンドウに対してのみシード処理で行い、`File > New Window` 経由で生成される新規ウィンドウは常に空状態で開始する (既存ウィンドウのワークスペースを意図せずクローンしてしまうのを避けるため)。
- macOS の Dock リオープン (`RunEvent::Reopen` with `has_visible_windows == false`) に対応する。`has_visible_windows` は `NSApplicationDelegate::applicationShouldHandleReopen:hasVisibleWindows:` 由来で、**「ウィンドウが完全に閉じられた状態」だけでなく「`Cmd+H` でアプリが隠された状態」「すべて最小化された状態」も `false` で発火する**。そのため Reopen ハンドラは `app.webview_windows().is_empty()` で分岐し、(a) 空ならば起動時と同じ履歴自動復元ロジックで新ウィンドウを 1 枚生成、(b) 既存ウィンドウがあれば全件 `show()` + `unminimize()` + `set_focus()` で再表示する。新規生成時のラベルは `workspace-<n>` で採番し (起動時の `main` 以外で `main` を再利用することはしない)、復元先がなければ WelcomePage 状態のウィンドウを開く。
- ウィンドウラベル (`main` / `workspace-*`) はバックエンドの実装詳細であり、ユーザーには露出しない。タイトルバー文字列・ウィンドウサイズ・装飾・機能はラベルにかかわらず同一。「自動復元するかしないか」はウィンドウの**作成経路** (起動 or Reopen → 復元あり、`New Window` → 復元なし) に紐付く責務で、ラベル文字列自体には特別な意味を持たせない。
- メニュー `Settings` イベントの発火スコープを「アプリ全体への emit」から「フォーカス中のウィンドウへの emit」に変更する。マルチウィンドウ環境下で `Cmd+,` が全ウィンドウの Settings を同時に開いてしまう挙動を防ぐ。
- Tauri capability (`capabilities/default.json`) の `windows` を `["main"]` から `["main", "workspace-*"]` に拡張し、新規ウィンドウにも `core` / `opener` / `fs` / `store` の権限が継承されるようにする。
- ウィンドウクローズ時 (`WindowEvent::Destroyed`) に `AppState` の該当ウィンドウエントリを掃除し、長期セッションでのメモリリークを防ぐ。

## Capabilities

### New Capabilities

- `multi-window`: 複数ウィンドウの同時展開機能。`File > New Window` メニュー、ウィンドウ単位のワークスペース状態管理、`open_new_window` コマンド、フォーカス中ウィンドウへのメニューイベント emit を含む。
- `recent-workspaces-picker`: WelcomePage 上の Recent Workspaces セレクタ。永続化済み `workspace_history` から実在ディレクトリのみを取得して一覧表示し、クリックでそのウィンドウのワークスペースをセットして BoardPage に遷移させる。

### Modified Capabilities

なし。既存 spec (`per-workspace-statuses`, `tag-filters`, `task-delete`, ...) の要件は変わらない — 単一ワークスペースに対する挙動は同一で、ウィンドウ間で状態が分離されるのみ。

## Impact

### Backend (`src-tauri/`)

- `src/state.rs`: `AppState` の構造体定義と全 API をウィンドウラベルキーに変更。`#[cfg(test)] tests` も全面書き換え。
- `src/lib.rs`: `setup()` で `main` ウィンドウのワークスペース履歴シード処理を追加。`on_window_event` ハンドラを登録。`open_new_window` / `list_workspace_history` を `generate_handler!` に登録。`.run(tauri::generate_context!())` の呼び出し方を `.build(...).run(|app, event| ...)` 形式に変更し、`RunEvent::Reopen` ハンドラで履歴自動復元付きの新規ウィンドウを生成。
- `src/menu.rs`: `File` サブメニュー追加、`new_window` メニューアイテム追加、`new_window` ハンドラ実装、`settings` 発火を `app.get_focused_window()` 経由に変更。
- `src/workspace.rs`: `set_workspace_directory` / `get_workspace_directory` / `get_workspace_filters` / `set_workspace_filters` が `WebviewWindow` を受け取りそのラベルで状態を引く形に。`get_workspace_directory` の自動復元フォールバックを削除。新コマンド `list_workspace_history` 実装 (既存 `parse_workspace_history` ヘルパー再利用)。`pub(crate) fn open_new_window_impl(app: &AppHandle) -> tauri::Result<WebviewWindow>` を追加 (ラベル採番は `AtomicU64`、フロントエンドには command として公開せず menu.rs から呼ぶ)。
- `src/task.rs` / `src/status.rs`: 既存の全コマンド (`list_tasks`, `list_all_tags`, `create_task`, `update_task`, `move_task`, `renumber_tasks`, `delete_task`, `get_task`, `reconcile_external_status_changes`, `get_statuses`, `save_statuses`) のシグネチャに `WebviewWindow` を追加し、`state.require_workspace(window.label())` へ切り替え。
- `src-tauri/capabilities/default.json`: `windows` フィールドにワイルドカード `workspace-*` を追加。

### Frontend (`src/`)

- `src/api/workspace.ts`: `listWorkspaceHistory()` 追加。
- `src/api/index.ts`: `listWorkspaceHistory` の再エクスポート。
- `src/components/molecules/RecentWorkspacesList.tsx` 新規: 履歴アイテムのリスト UI。`PathDisplay` ベースの行をスクロール可能なリストで描画。
- `src/components/molecules/index.ts`: 再エクスポート。
- `src/components/templates/WelcomeLayout.tsx`: `data-tauri-drag-region="deep"` を付与してウィンドウドラッグ領域を確保。macOS のトラフィックライト用に上部パディング。
- `src/components/pages/WelcomePage.tsx`: マウント時に `listWorkspaceHistory()` をフェッチし、結果が空でなければ `RecentWorkspacesList` を描画。アイテムクリックで `setWorkspaceDirectory(path)` → `onDirectorySelected(path)`。
- `src/hooks/useCurrentDir.ts`: 既存ロジックのまま (`get_workspace_directory` の戻り値がバックエンドの変更で `None` を返すケースが正規化されるだけ)。

### Documentation

- `AGENTS.md` (ルート + `src/AGENTS.md` + `src-tauri/AGENTS.md` + `src-tauri/src/state.rs` 周辺ドキュメント) を新しいウィンドウラベルキー方式に追従させる。
