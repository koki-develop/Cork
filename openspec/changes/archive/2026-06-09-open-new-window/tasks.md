## 1. Rust: AppState をウィンドウラベルキーへ移行

- [x] 1.1 `src-tauri/src/state.rs` の構造体定義を変更: `workspace_dir: Mutex<Option<PathBuf>>` → `workspaces: Mutex<HashMap<String, PathBuf>>`、`tasks_cache: Mutex<Option<Vec<Task>>>` → `tasks_caches: Mutex<HashMap<String, Vec<Task>>>`、`last_reported: Mutex<HashMap<String, TaskSnapshot>>` → `last_reported: Mutex<HashMap<String, HashMap<String, TaskSnapshot>>>` (ウィンドウラベル → タスク id → スナップショット)
- [x] 1.2 ウィンドウラベル採番用の `next_window_id: AtomicU64` を `AppState` に追加
- [x] 1.3 `AppState` の公開 API をウィンドウラベル必須の形に書き換え: `workspace(label: &str)`, `require_workspace(label: &str)`, `set_workspace(label: &str, dir: PathBuf)`, `get_cached_tasks(label: &str)`, `set_cached_tasks(label: &str, tasks: Vec<Task>)`, `invalidate_cache(label: &str)`, `get_last_reported(label: &str)`, `set_last_reported(label: &str, tasks: &[Task])`, `seed_last_reported_if_empty(label: &str, tasks: &[Task])`, `upsert_last_reported(label: &str, id: String, status: String, order: Option<f64>)`, `remove_last_reported(label: &str, id: &str)`
- [x] 1.3.1 **`set_workspace(label, dir)` の副作用範囲は当該ラベル限定**: 該当ラベルの `tasks_caches` エントリと `last_reported` エントリのみリセットし、他ラベルの値には触れないことを実装上明示 (コメント + テストで担保)。現状のグローバル `tasks_cache.set(None)` + `last_reported.clear()` を per-label 操作に置き換える
- [x] 1.4 `AppState::remove_window(label: &str)` を実装 (`workspaces` / `tasks_caches` / `last_reported` の該当エントリ削除)
- [x] 1.5 `AppState::next_window_label()` を実装 (`fetch_add` で `workspace-<n>` 文字列を返す)
- [x] 1.6 `state.rs` の `#[cfg(test)] mod tests` を全面書き換え: 既存のラベル無しテストをラベル "main" 指定の形に変換し、追加で `remove_window` 動作確認テスト・複数ラベル間の独立性テスト・`next_window_label` の単調増加テストを追加

## 2. Rust: コマンドのシグネチャ変更

- [x] 2.1 `src-tauri/src/workspace.rs::set_workspace_directory` を `(window: tauri::WebviewWindow, path: String, state: tauri::State<'_, AppState>, app: tauri::AppHandle)` に変更し、`state.set_workspace(window.label(), dir.clone())` を使う
- [x] 2.2 `workspace.rs::get_workspace_directory` を `(window: tauri::WebviewWindow, state: tauri::State<'_, AppState>)` に変更し、履歴フォールバック (`history.into_iter()...find(|p| p.is_dir())`) のロジックを**削除**して `state.workspace(window.label())` の戻り値をそのまま返す
- [x] 2.3 `workspace.rs::get_workspace_filters` / `set_workspace_filters` の `state.require_workspace()` 呼び出しを `state.require_workspace(window.label())` に変更し `window: tauri::WebviewWindow` 引数を追加
- [x] 2.4 `src-tauri/src/task.rs` の `list_tasks` / `list_all_tags` / `get_task` / `create_task` / `update_task` / `move_task` / `renumber_tasks` / `delete_task` / `reconcile_external_status_changes` の各 `#[tauri::command]` に `window: tauri::WebviewWindow` 引数を追加し、`state.*` 呼び出しをすべて `window.label()` 指定形に書き換え
- [x] 2.5 `src-tauri/src/status.rs::get_statuses` / `save_statuses` も同様に `window: tauri::WebviewWindow` を追加して `window.label()` 経由の state アクセスに変更
- [x] 2.6 上記すべてのコマンドが正しく呼び出し元ウィンドウのスコープのみ参照することを `cargo check` で型整合性確認 (state API がラベル必須なため、漏れがあれば型エラーで検出される)

## 3. Rust: 新規 Tauri コマンド / 内部ヘルパー

- [x] 3.1 `workspace.rs::list_workspace_history` を `#[tauri::command]` として実装: `app.store(SETTINGS_FILE)` から `workspace_history` を `parse_workspace_history` で取り出し、`PathBuf::from(s).is_dir()` フィルタした結果を `Vec<String>` で返す。永続データ自体は書き換えない
- [x] 3.2 `list_workspace_history` の戻り値の型 (`Vec<String>`)・順序保持・無効パス除外・永続データ不変動作の単体テストを `workspace.rs` 内 `#[cfg(test)] mod tests` に追加 (純粋なヘルパー部分のみ、Tauri runtime 依存部分はテスト対象外)
- [x] 3.3 `workspace.rs::open_new_window_impl(app: &tauri::AppHandle) -> tauri::Result<tauri::WebviewWindow>` を **内部関数として** 実装 (`#[tauri::command]` ではなく `pub(crate) fn`): `state.next_window_label()` でラベル採番、`build_workspace_window(app, &label)` でウィンドウ生成 → 返却。フロントエンドからは呼ばれないため Tauri command として公開しない (v1 では menu イベントハンドラからのみ呼ばれる)
- [x] 3.4 `open_new_window_impl` のウィンドウビルダー設定を共有ヘルパー関数 `build_workspace_window(app: &AppHandle, label: &str) -> tauri::Result<WebviewWindow>` として `lib.rs` の main ウィンドウ生成ロジックと共通化する。ヘルパーの中身: `WebviewWindowBuilder::new(app, label, WebviewUrl::default())` → `.title("")` → `.inner_size(1280.0, 800.0)` → macOS では `TitleBarStyle::Overlay` + `traffic_light_position(LogicalPosition::new(20.0, 28.0))` を適用 → `.build()` 後に macOS なら背景色 `#020617` を `objc2-app-kit` 経由でセット (DRY: 同じスタイル設定を 2 箇所に書かない)

## 4. Rust: メニュー変更

- [x] 4.1 `src-tauri/src/menu.rs` に `File` サブメニューを追加し、その配下に `MenuItemBuilder::with_id("new_window", "New Window").accelerator("CmdOrCtrl+Shift+N")` の `new_window_item` を配置
- [x] 4.2 `MenuBuilder` の `.items(&[&app_menu, &edit_menu, &window_menu])` を `.items(&[&app_menu, &file_menu, &edit_menu, &window_menu])` に拡張 (File は Cork メニューの直後、Edit の前)
- [x] 4.3 `app.on_menu_event` の `match` を `"new_window"` 分岐対応に拡張: `let _ = crate::workspace::open_new_window_impl(app);` を直接呼ぶ (task 3.3 で定義した内部関数。エラーは無視せず `eprintln!` でログ出力)
- [x] 4.4 `app.on_menu_event` の `"settings"` 分岐を変更: `app.emit("menu:open-settings", ())` (全ウィンドウ broadcast) → `app.get_focused_window()` を取得し、取れた場合は `window.emit("menu:open-settings", ())` で focus 中のウィンドウにだけ emit。取れない場合は何もしない (注釈コメントで「実害なし: Settings が開かないだけ」と書く)

## 5. Rust: lib.rs (起動シード + ウィンドウクリーンアップ)

- [x] 5.1 `src-tauri/src/lib.rs::run` の `setup()` クロージャ内、ウィンドウ生成の前に `AppState` を `app.state::<AppState>()` で取得し、`tauri_plugin_store` から `workspace_history` を読んで `parse_workspace_history` + `find(|p| p.is_dir())` で最初の生存パスを取得
- [x] 5.2 生存パスがあれば `state.set_workspace("main", path.clone())` でシードし、`app.fs_scope().allow_directory(&path, false)` を登録 (失敗時は eprintln で警告ログのみ — 既存挙動踏襲)
- [x] 5.3 main ウィンドウのビルダーを `build_workspace_window(app, "main")` ヘルパー (task 3.4 で共通化) 経由に切り替え
- [x] 5.4 `tauri::Builder::default().on_window_event(|window, event| { if matches!(event, tauri::WindowEvent::Destroyed) { let state = window.state::<AppState>(); state.remove_window(window.label()); } })` を `.setup(...)` の前に追加。`Destroyed` のみで掃除 (`CloseRequested` は使わない — 将来 prevent_close を導入してもクリーンアップが暴発しないように)
- [x] 5.5 `tauri::generate_handler![...]` に `workspace::list_workspace_history` を登録 (`open_new_window_impl` は内部関数なので登録不要)
- [x] 5.6 `.run(tauri::generate_context!())` を `.build(tauri::generate_context!()).expect("...").run(|app_handle, event| ...)` 形式に変更し、`tauri::RunEvent::Reopen { has_visible_windows: false, .. }` パターンを受けるクロージャを実装。`#[cfg(target_os = "macos")]` でガード (Reopen 変種自体が macOS 限定)
- [x] 5.7 履歴自動復元シード処理 (history 読み込み → `is_dir()` フィルタ → `state.set_workspace(label, path)` → `fs_scope().allow_directory`) を `setup()` と Reopen ハンドラで共有できるように `seed_window_from_history(app: &AppHandle, label: &str)` ヘルパーに抽出。履歴復元先がなければ no-op で正常終了する設計
- [x] 5.8 Reopen ハンドラ内では `app.webview_windows().is_empty()` で分岐:
  - **(A) 空ならば** (`Cmd+W` でウィンドウを全部閉じた状態): `state.next_window_label()` で `workspace-<n>` 採番 → **先に** `seed_window_from_history(app, &label)` を呼んで AppState への workspace セット + `fs_scope` 登録を済ませる → **その後** `build_workspace_window(app, &label)` でウィンドウ生成。順序が逆だとフロントエンドの `useCurrentDir` が `getWorkspaceDirectory()` を呼んだとき `None` を読むレースが発生する
  - **(B) 1 件以上あるならば** (`Cmd+H` で隠した or `Cmd+M` で最小化した状態): すべての既存ウィンドウに対し `let _ = w.unminimize(); let _ = w.show(); let _ = w.set_focus();` を順に呼んで再表示する。新規ウィンドウは生成しない
- [x] 5.9 `has_visible_windows: true` の Reopen ではパターンマッチで何もしない (フォアグラウンド復帰は macOS 標準挙動に委ねる)
- [x] 5.10 `_ => {}` のワイルドカードアームを付けて、`RunEvent` の `#[non_exhaustive]` 性および将来追加される variants に対する forward compatibility を担保

## 6. Rust: capability

- [x] 6.1 `src-tauri/capabilities/default.json` の `"windows": ["main"]` を `"windows": ["main", "workspace-*"]` に変更し、ワイルドカードが新規ウィンドウラベルにマッチすることを確認

## 7. Frontend: API ラッパー

- [x] 7.1 `src/api/workspace.ts` に `export const listWorkspaceHistory = () => invoke<string[]>("list_workspace_history");` を追加
- [x] 7.2 `src/api/index.ts` で `listWorkspaceHistory` を再エクスポート
- [x] 7.3 `src/api/AGENTS.md` の `workspace.ts` 行に `listWorkspaceHistory` を追加 (v1 では `openNewWindow` の API ラッパーは作らない — メニュー経由のみ、フロントエンドからの呼び出し点が存在しないため)

## 8. Frontend: RecentWorkspacesList molecule

- [x] 8.1 `src/components/molecules/RecentWorkspacesList.tsx` を新規作成。props: `{ paths: string[]; onSelect: (path: string) => void; }`。空配列の場合は何も描画しない (`if (paths.length === 0) return null;`)
- [x] 8.2 セクションラベル `Recent Workspaces` を `Text variant="label" size="xs"` で描画 (既存 `WorkspaceDirectoryField` と同等スタイル)
- [x] 8.3 リスト本体: 各項目は既存の `PathDisplay` の clickable variant (`onClick={() => onSelect(path)}` + `aria-label`) を縦に並べる `<ul>` / `<li>` 構造
- [x] 8.4 リストコンテナに `max-h-[<タスク3.4 と整合する値>] overflow-y-auto` 系の Tailwind ユーティリティで上限高さ + 縦スクロール (例: `max-h-72`)。50 件履歴時に画面外まで伸びないことを目視確認
- [x] 8.5 `src/components/molecules/index.ts` で `RecentWorkspacesList`, `type RecentWorkspacesListProps` を再エクスポート
- [x] 8.6 `src/components/molecules/AGENTS.md` のファイル表に `RecentWorkspacesList.tsx` 行を追加

## 9. Frontend: WelcomeLayout のドラッグ領域

- [x] 9.1 `src/components/templates/WelcomeLayout.tsx` のルート `<main>` に `data-tauri-drag-region="deep"` 属性を付与
- [x] 9.2 macOS のトラフィックライト位置 (`LogicalPosition(20, 28)`) と干渉しないよう、必要であれば上部パディングを微調整 (既存の hero 配置 `items-center justify-center` で `min-h-screen` のため、視覚的にはトラフィックライトと重ならない — 確認の上、必要なら `pt-12` 等を追加)
- [x] 9.3 `bun run tauri dev` で実機確認: 余白でドラッグ可能、CTA ボタンと履歴項目は通常クリックできること

## 10. Frontend: WelcomePage 配線

- [x] 10.1 `src/components/pages/WelcomePage.tsx` をリファクタリング: `useState<string[]>([])` で `history` を持ち、`useEffect(() => { listWorkspaceHistory().then(setHistory); }, [])` で初回フェッチ
- [x] 10.2 `handleSelectFromHistory = async (path: string) => { await setWorkspaceDirectory(path); onDirectorySelected(path); }` ハンドラを追加
- [x] 10.3 既存の `<WelcomeHero ... />` の下に `<RecentWorkspacesList paths={history} onSelect={handleSelectFromHistory} />` を配置
- [x] 10.4 history が空のときは `RecentWorkspacesList` 内のガードで何も描画されないことを確認 (チラつきがないように初期 state を `[]` で確定させる)

## 11. Rust テスト: 既存単体テスト追従

- [x] 11.1 `src-tauri/src/state.rs` の既存テストを書き換え (task 1.6 で実施済みのものを再確認)。`set_then_get_round_trips`, `set_replaces_previous_value`, `last_reported_*`, `set_workspace_clears_last_reported` などをすべてラベル付き API で書き直す
- [x] 11.2 ウィンドウ A の state 変更がウィンドウ B の state に影響しないことを保証するテスト `workspaces_are_isolated_by_label` を追加
- [x] 11.3 `remove_window` がすべてのマップから該当エントリを消すことを保証するテスト `remove_window_clears_all_maps` を追加
- [x] 11.4 `next_window_label` が `workspace-1`, `workspace-2`, ... の単調連番を返すことを保証するテスト `next_window_label_is_monotonic` を追加
- [x] 11.5 `set_workspace(label, ...)` が他ラベルの cache / last_reported に影響を与えないことを保証するテスト `set_workspace_does_not_affect_other_labels` を追加 (ラベル "main" の値をセット後、ラベル "workspace-1" の `set_workspace` を呼んで、"main" の cache と last_reported が無事であることを確認)
- [x] 11.6 `compute_reconciled_orders` (`task.rs`) が「status diff あり AND order diff あり」のケースで no-op になることを保証するテスト `reconcile_skips_when_both_status_and_order_changed` を追加 (multi-window invariant の最後の砦)。既存テストの cassette 内に同等のものがあれば追加不要 — その場合はそのテストが本 invariant を担保する文言コメントを付ける
- [x] 11.7 `cargo test` を `src-tauri/` で実行し、すべてのテストが通ることを確認

## 12. ドキュメント更新

- [x] 12.1 `src-tauri/AGENTS.md` の `## State` セクションを書き換え: 新しい AppState の構造 (`workspaces`, `tasks_caches`, `last_reported` がすべてウィンドウラベルキーである旨) と新 API シグネチャを反映
- [x] 12.2 `src-tauri/AGENTS.md` の `## Capabilities` 行を更新: `windows: ["main", "workspace-*"]` を反映
- [x] 12.3 `src-tauri/AGENTS.md` の `## Layout` の `workspace.rs` 説明に `open_new_window`, `list_workspace_history` を追加
- [x] 12.4 `src-tauri/AGENTS.md` の `## Tests` の `workspace.rs` カバレッジ行に `list_workspace_history` 関連を追加
- [x] 12.5 `src-tauri/AGENTS.md` の `## Adding a command` セクションに「`window: tauri::WebviewWindow` を引数に追加し `window.label()` で state アクセスする」運用を追記
- [x] 12.6 `src/api/AGENTS.md` を更新 (task 7.4 で実施済みのものを再確認): `window.ts` セクションと `listWorkspaceHistory` の追加が反映されていること
- [x] 12.7 `src/components/molecules/AGENTS.md` に `RecentWorkspacesList.tsx` 行が入っていることを確認 (task 8.6 で実施)
- [x] 12.8 `src/components/pages/AGENTS.md` の `WelcomePage.tsx` 説明を更新: 履歴フェッチと Recent Workspaces 経由のワークスペース選択も担う旨を追加
- [x] 12.9 ルート `AGENTS.md` の Stack 表は不変だが、必要であれば「マルチウィンドウ対応」の旨を 1 行追加

## 13. 検証

- [x] 13.1 `bunx tsc --noEmit` で型エラーゼロを確認
- [x] 13.2 `bun run lint` で oxlint エラーゼロを確認 (特に `no-restricted-imports` の overrides に違反していないこと)
- [x] 13.3 `bun run fmt:check` でフォーマット差分ゼロを確認
- [x] 13.4 `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` で警告ゼロを確認
- [x] 13.5 `bun run build` (tsc + vite build) が成功することを確認
- [x] 13.6 `bun run tauri dev` で手動検証:
  - [x] 13.6.1 起動時、前回ワークスペースが自動復元されること
  - [x] 13.6.2 `File > New Window` / `Cmd+Shift+N` で新ウィンドウが開き、WelcomePage が表示されること
  - [x] 13.6.3 新ウィンドウは既存ウィンドウのワークスペースを継承しないこと
  - [x] 13.6.4 Recent Workspaces が実在ディレクトリのみ表示されること (試しに 1 つを `rm -rf` してから WelcomePage を開き直して確認)
  - [x] 13.6.5 Recent Workspaces クリックで該当ワークスペースが当該ウィンドウに開き、BoardPage に遷移すること
  - [x] 13.6.6 2 ウィンドウで別ワークスペースを開き、片方でタスクを操作してももう片方が影響を受けないこと
  - [x] 13.6.7 2 ウィンドウで同じワークスペースを開き、片方の編集 (例: タスクの status 変更) がもう片方の watcher で検出され BoardPage が再描画されること
  - [x] 13.6.8 `Cmd+,` Settings がフォーカス中のウィンドウだけで開くこと
  - [x] 13.6.9 WelcomePage の余白をドラッグするとウィンドウが動くこと
  - [x] 13.6.10 ウィンドウを閉じた後、再度開いてもアプリが落ちないこと (state cleanup 後の再オープンが正常)
  - [x] 13.6.11 (macOS) すべてのウィンドウを `Cmd+W` で閉じ、続いて Dock の Cork アイコンをクリックすると、新規ウィンドウが起動時と同じ履歴復元挙動で開くこと (Reopen → `webview_windows().is_empty() == true` 分岐)
  - [x] 13.6.12 (macOS) ウィンドウが見えている状態で Dock の Cork アイコンをクリックしても新規ウィンドウが追加で生成されない (既存ウィンドウがフォアグラウンドに戻るだけ — `has_visible_windows: true` 分岐) こと
  - [x] 13.6.13 (macOS) Reopen で開いたウィンドウのラベルが `workspace-<n>` 採番続き番号であり、`main` の再利用ではないことを Tauri デバッグログまたは Devtools の `getCurrent().label` で確認
  - [x] 13.6.14 (macOS) `Cmd+H` で Cork アプリを完全に隠した状態で Dock の Cork アイコンをクリックすると、隠れていた既存ウィンドウが復帰すること (新ウィンドウが増えていない、既存ウィンドウのワークスペースは元のまま — Reopen → `webview_windows().is_empty() == false` 分岐 / 隠れケース)
  - [x] 13.6.15 (macOS) `Cmd+M` ですべてのウィンドウを最小化した状態で Dock の Cork アイコンをクリックすると、最小化していたウィンドウが Dock から復帰すること (新ウィンドウが増えていない — Reopen → `webview_windows().is_empty() == false` 分岐 / 最小化ケース)
  - [x] 13.6.16 同一ワークスペースを 2 つのウィンドウで開き、片方でタスクを `Doing` カラムの**中段** (先頭ではない位置) にドラッグ移動した直後、もう片方のウィンドウで watcher → reconcile が走っても、当該タスクが先頭に飛ばされず**ドラッグ先の位置にそのまま留まる**こと (status+order invariant の確認)
