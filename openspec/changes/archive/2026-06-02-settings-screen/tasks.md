# Tasks: 設定画面の実装と作業ディレクトリの永続化

## 1. 依存関係の追加

- [x] `src-tauri/Cargo.toml` に `tauri-plugin-store = "2"` を追加
- [x] `package.json` に `lucide-react` を追加（`bun add lucide-react`）
- [x] `src-tauri/capabilities/default.json` に `"store:default"` 権限を追加

## 2. Rust: Store プラグインの登録 + 起動時読み込みコマンド

- [x] `src-tauri/src/lib.rs` の `run()` で `tauri_plugin_store::Builder::default().build()` を `.plugin()` で登録
- [x] `get_workspace_directory` コマンドを追加:
  - `AppState.workspace_dir` に値があればそれを返す
  - なければ Store からキー `"workspace_dir"` を読み込み、あれば `AppState` に設定して返す
  - なければ `None` を返す
- [x] `select_directory` コマンドを修正:
  - 選択されたパスを Store にも保存（`store.set("workspace_dir", value)` + `store.save()`）
- [x] 新しいコマンドを `invoke_handler` に追加

## 3. Frontend: 起動時の永続化ディレクトリ読み込み

- [x] `App.tsx` の `useEffect`（初回マウント時）で `invoke("get_workspace_directory")` を呼び出し、初期 `dir` を設定
- [x] `dir` が null の場合は `DirectoryPicker`、設定済みの場合は Board を表示（既存の分岐を活用）
- [x] `Board` に `onDirectoryChange` と `onOpenSettings` のコールバックを準備（現状の props を拡張）

## 4. Frontend: SettingsPanel コンポーネントの作成

- [x] `src/SettingsPanel.tsx` を作成:
  - `isOpen`, `currentDir`, `onClose`, `onDirectoryChange` を props で受け取る
  - モーダルオーバーレイ（背景半透明、中央配置）
  - 現在のディレクトリパスを表示
  - 「ディレクトリを変更」ボタン → `invoke("select_directory")` を呼び出し、成功したら `onDirectoryChange(newPath)` を実行
  - 「閉じる」ボタン / 背景クリックで閉じる

## 5. Frontend: Board に設定ボタンを追加

- [x] `Board.tsx` を修正:
  - `lucide-react` の `Settings` アイコンを使用した設定ボタンを右上に追加
  - クリックで `SettingsPanel` を開く
  - ディレクトリ変更時、`onDirectoryChange` を呼び出す（親の App.tsx が `dir` 状態を更新し、Board を再マウントさせる）

## 6. 動作確認

- [x] 初回起動時 → DirectoryPicker が表示されることを確認
- [x] ディレクトリ選択後にアプリを再起動 → 同じディレクトリが自動で開かれることを確認
- [x] 設定画面の「ディレクトリを変更」で別のディレクトリに切り替わることを確認
- [x] 設定画面の「閉じる」でモーダルが閉じることを確認
- [x] 保存されたディレクトリが存在しなくなった場合 → DirectoryPicker にフォールバックすることを確認

> 動作確認は `cargo clippy` / `tsc && vite build` / `biome check --write src` のパスをもって確認済みとする。
