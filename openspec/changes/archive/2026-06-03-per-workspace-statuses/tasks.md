## 1. バックエンド: `.cork.json` 直接 I/O のヘルパーを実装する

- [x] 1.1 `src-tauri/src/lib.rs` にプライベートヘルパー `read_statuses_from_workspace(dir: &str) -> Vec<StatusEntry>` を実装する。`<dir>/.cork.json` を `std::fs::read_to_string` で読み、`serde_json::from_str::<serde_json::Value>` でパースし、`statuses` キーから `Vec<StatusEntry>` を取り出す。ファイル不在 / パース失敗 / キー欠落 / 型不一致のいずれの場合も `vec![]` を返す。パース失敗時のみ `eprintln!` で警告を出す
- [x] 1.2 プライベートヘルパー `write_statuses_to_workspace(dir: &str, statuses: &[StatusEntry]) -> Result<(), String>` を実装する。既存 `.cork.json` があれば JSON として読んでオブジェクトに `statuses` を差し替え、`statuses` 以外のキーは保持する（拡張性確保）。ファイルが無い / パース失敗の場合は `{"statuses": [...]}` のみのオブジェクトを新規作成する。書き込みは `serde_json::to_string_pretty` + 末尾改行 `\n` で行う
- [x] 1.3 ファイル I/O は `AppState.workspace_dir` の `Mutex` ガードを `drop` した後に行う（既存 `list_tasks` (`lib.rs:101-106`) のパターン踏襲）

## 2. バックエンド: `get_statuses` / `save_statuses` を書き換える

- [x] 2.1 `get_statuses` のシグネチャを `(state: tauri::State<'_, AppState>) -> Vec<StatusEntry>` に変更する。`workspace_dir` が `None` なら空配列を返し、それ以外は `read_statuses_from_workspace` を呼ぶ。`tauri_plugin_store` への参照を削除する
- [x] 2.2 `save_statuses` のシグネチャを `(state: tauri::State<'_, AppState>, statuses: Vec<StatusEntry>) -> Result<(), String>` に変更する。`workspace_dir` が `None` なら `Err("No directory selected".into())` を返す。それ以外は `write_statuses_to_workspace` を呼ぶ
- [x] 2.3 `lib.rs` から `tauri_plugin_store` の `statuses` キー利用箇所が一切残らないことを確認する（`save_statuses` 内および `list_tasks` 内）

## 3. バックエンド: `list_tasks` のデフォルトステータス参照を `.cork.json` に切り替える

- [x] 3.1 `list_tasks` (`lib.rs:108-117`) 内の `app.store("settings.json").ok().and_then(|store| store.get("statuses"))` ブロックを削除し、代わりに `read_statuses_from_workspace(&dir)` の戻り値の先頭 `.label` をデフォルトステータスとして使う
- [x] 3.2 `list_tasks` の引数から `app: tauri::AppHandle` を削除できるなら削除する（他で使っていない場合）

## 4. バックエンド: ビルドとリント

- [x] 4.1 `cd src-tauri && cargo clippy --all-targets -- -D warnings` を実行し警告ゼロになることを確認する
- [x] 4.2 `cd src-tauri && cargo build` がエラーなく通ることを確認する

## 5. フロントエンド: `useWorkspace` の watch ハンドラを拡張する

- [x] 5.1 `src/hooks/useWorkspace.ts` の `watch(dir, (event) => { ... })` コールバックを書き換える。`event.paths` の中に `.cork.json` で終わるパスがあれば `loadStatuses()` と `loadTasks()` の両方を実行する。`.md` ファイル変更のみの場合は従来通り `loadTasks()` のみ
- [x] 5.2 `loadStatuses` を `loadTasks` 同様 `useCallback` 化されていることを確認する（既存実装で OK）。watch の依存配列に `loadStatuses` を追加する
- [x] 5.3 デバウンスは既存値 `delayMs: 300` を維持する

## 6. フロントエンド: ビルドとリント

- [x] 6.1 `bun run format` を実行し Biome の差分が消えていることを確認する
- [x] 6.2 `bun run build` を実行し TypeScript の型チェックと Vite ビルドが通ることを確認する

## 7. 手動検証

- [ ] 7.1 `bun run tauri dev` を起動する
- [ ] 7.2 作業ディレクトリ A を選び、設定パネルで statuses を `Backlog / Doing / Done` に設定する。A 直下に `.cork.json` が作成され、内容が `{"statuses":[{"label":"Backlog"},{"label":"Doing"},{"label":"Done"}]}` 形式で 2 スペースインデント整形になっていることをファインダー / `cat` で確認する
- [ ] 7.3 作業ディレクトリ B に切り替え、statuses を `Todo / In Progress / Review / Done` に設定する。B 直下にも独立した `.cork.json` ができ、A の内容は変化していないことを確認する
- [ ] 7.4 A と B を行き来して Board のカラム構成と設定パネルの一覧が、選んだディレクトリの `.cork.json` に追従して切り替わることを確認する
- [ ] 7.5 Cork を起動した状態で別エディタから A の `.cork.json` を書き換え保存する。Board と設定パネルが自動で新しい構成に更新されることを確認する
- [ ] 7.6 別エディタから A の `.cork.json` を削除する。設定パネルが `Todo / Doing / Done`（フロント側 `DEFAULT_STATUSES`）に戻ることを確認する
- [ ] 7.7 A の `.cork.json` を JSON シンタックスエラーになるよう書き換える。Cork が空配列にフォールバックし、設定パネルが `Todo / Doing / Done` を表示すること、コンソールにバックエンドの警告が出ていることを確認する
- [ ] 7.8 OS のアプリデータディレクトリにあるグローバル `settings.json`（macOS なら `~/Library/Application Support/<bundle>/settings.json`）を開き、`statuses` キーが書き込まれていないこと（過去に残っていた場合は読み出しに使われていないこと）を確認する
- [ ] 7.9 frontmatter `status` を持たない `.md` ファイルを A に作成する。Board に `.cork.json` の先頭ステータス（`Backlog`）の列に表示されることを確認する
