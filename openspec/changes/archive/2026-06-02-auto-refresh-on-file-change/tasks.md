# Tasks: 外部ファイル変更の自動検出とリアルタイムUI反映

## 1. 依存関係の追加

- [x] `src-tauri/Cargo.toml` に `tauri-plugin-fs = { version = "2", features = ["watch"] }` を追加
- [x] `package.json` に `@tauri-apps/plugin-fs` を追加
- [x] `src-tauri/capabilities/default.json` に `"fs:default"` 権限を追加

## 2. Rust: プラグイン登録 + 既存コマンドのセキュリティ改善

- [x] `src-tauri/src/lib.rs` の `run()` 関数で `tauri_plugin_fs::init()` を `.plugin()` で登録
- [x] `AppState` 構造体を追加し、選択中のディレクトリを管理
- [x] `select_directory` で選択されたパスを Rust state に保存し、`FsExt::allow_directory()` で fs スコープに追加
- [x] `list_tasks` の引数 `dir` を削除し、Rust state から読み取るよう変更
- [x] `update_task_status` にパス検証を追加（選択ディレクトリ外のファイル操作を拒否）

## 3. Frontend: ファイル監視の実装

- [x] `App.tsx` に `@tauri-apps/plugin-fs` から `watch` をインポート
- [x] ディレクトリ選択後の `useEffect` 内で watcher を開始:
  - `watch(dir, callback, { recursive: false, delayMs: 300 })`
  - コールバック内でイベントのパスが `.md` ファイルか確認
  - `.md` ファイルの変更/作成/削除の場合に `loadTasks()` を呼び出す
- [x] `useEffect` のクリーンアップ関数で unwatch を呼び出す

## 4. 動作確認

- [ ] ディレクトリ選択後に `.md` ファイルを外部エディタで編集し、UI が更新されることを確認
- [ ] 新規 `.md` ファイルを作成し、UI にカードが追加されることを確認
- [ ] `.md` ファイルを削除し、UI からカードが消えることを確認
- [ ] frontmatter の status を直接編集し、カードが別カラムに移動することを確認
- [ ] 非 `.md` ファイルの変更では UI が更新されないことを確認
